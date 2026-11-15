#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   SWEEP 13F — what the funds in src/data/13f-funds.json bought and
   sold each quarter, cross-referenced against the model portfolio.

   Runs after each 13F deadline via .github/workflows/sweep-13f.yml,
   or by hand:
     node scripts/sweep-13f.mjs                 # latest complete quarter
     node scripts/sweep-13f.mjs 2026 3          # a specific quarter
     node scripts/sweep-13f.mjs 2026 3 --backfill 4   # that quarter and the 3 before it

   Source: SEC EDGAR, read directly (free, no key):
     data.sec.gov/submissions/CIK##########.json  → the fund's filings
     www.sec.gov/Archives/edgar/data/<cik>/<acc>/  → the 13F-HR information table XML
   Set SOURCE=fmp to use FMP's institutional-ownership endpoints instead
   (needs a tier that includes 13F; the default tier returns 402).

   CUSIP → ticker: OpenFIGI (free, OPENFIGI_API_KEY optional for a higher
   rate limit), FMP search-cusip as a fallback (FMP_API_KEY), cached in
   src/data/13f/cusips.json so re-runs cost nothing.

   For each fund it pulls the quarter and the prior quarter, then
   classifies every position:
     new     held now, not last quarter
     add     shares up 20%+
     trim    shares down 20%+
     exit    held last quarter, gone now
   Positions under $20M are ignored. Put/call rows are kept out of the
   share diff and listed under `options`.

   Output: src/data/13f/<year>-q<q>.json per quarter (per-fund summary,
   top-10, moves; a consensus table; overlap with holdings and bench;
   funds that have not filed) and src/data/13f/index.json listing the
   quarters on disk. The 13F tab reads these.

   It changes nothing in the portfolio. The report is for the quarterly
   review and the ideas list.
──────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FUNDS_FILE = path.join(ROOT, "src", "data", "13f-funds.json");
const PORT_FILE = path.join(ROOT, "src", "data", "model-portfolio.json");
const OUT_DIR = path.join(ROOT, "src", "data", "13f");
const CUSIP_FILE = path.join(OUT_DIR, "cusips.json");

const SOURCE = (process.env.SOURCE || "edgar").toLowerCase();
const FMP_KEY = process.env.FMP_API_KEY || "";
const FIGI_KEY = process.env.OPENFIGI_API_KEY || "";
// SEC's fair-access rules require a User-Agent that names the app and a contact
// address ("Name email@domain"); anything else is refused with 403 as an
// undeclared automated tool. Override with the SEC_USER_AGENT secret.
const SEC_UA = process.env.SEC_USER_AGENT || "advisor-toolkit 13F sweep autiger3424@users.noreply.github.com";

const ADD_THRESHOLD = 0.20;
const MIN_VALUE_USD = 20_000_000;
const TOP_N = 10;

// ── Args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const backfillIdx = args.indexOf("--backfill");
const BACKFILL = backfillIdx >= 0 ? Math.max(1, Number(args[backfillIdx + 1]) || 1) : 1;
const positional = args.filter((a, i) => !a.startsWith("--") && (backfillIdx < 0 || i !== backfillIdx + 1)).map(Number).filter(Boolean);

function latestCompleteQuarter(now = new Date()) {
  // 13F for quarter Q is due 45 days after quarter end (next business day if
  // that falls on a weekend). Treat a quarter as "complete" once Feb 15 /
  // May 16 / Aug 15 / Nov 15 has arrived.
  const y = now.getUTCFullYear();
  const deadlines = [
    { year: y - 1, quarter: 4, due: Date.UTC(y, 1, 15) },
    { year: y, quarter: 1, due: Date.UTC(y, 4, 16) },
    { year: y, quarter: 2, due: Date.UTC(y, 7, 15) },
    { year: y, quarter: 3, due: Date.UTC(y, 10, 15) },
  ];
  let pick = { year: y - 1, quarter: 3 };
  for (const d of deadlines) if (now.getTime() >= d.due) pick = { year: d.year, quarter: d.quarter };
  return pick;
}
const prevQuarter = ({ year, quarter }) => (quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 });
const quarterEnd = ({ year, quarter }) => `${year}-${String(quarter * 3).padStart(2, "0")}-${quarter === 1 || quarter === 4 ? "31" : "30"}`;
const qlabel = ({ year, quarter }) => `${year} Q${quarter}`;
const qfile = ({ year, quarter }) => `${year}-q${quarter}.json`;

// ── HTTP ───────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastSec = 0;
let secForbidden = 0;
async function secFetch(url, as = "json") {
  // SEC fair-access limit is 10 requests/second; stay under it.
  const wait = 120 - (Date.now() - lastSec);
  if (wait > 0) await sleep(wait);
  lastSec = Date.now();
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": SEC_UA, Accept: "application/json, text/xml, */*" } });
      if (res.status === 403) {
        // 403 is SEC's bot filter (bad User-Agent or a blocked network), not a transient. Fail the run
        // after three in a row rather than backing off for an hour and committing an empty quarter.
        if (++secForbidden >= 3) { console.error(`\nSEC EDGAR refused ${url} with 403 three times. Check SEC_USER_AGENT ("Name email@domain") and whether this network is allowed by sec.gov.`); process.exit(2); }
        console.warn(`  SEC 403 on ${url}, retrying`); await sleep(5_000 * attempt); continue;
      }
      secForbidden = 0;
      if (res.status === 429) { console.warn(`  SEC 429 on ${url}, backing off`); await sleep(10_000 * attempt); continue; }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return as === "json" ? await res.json() : await res.text();
    } catch (err) {
      if (attempt === 4) { console.warn(`  failed ${url}: ${err.message}`); return null; }
      await sleep(2000 * attempt);
    }
  }
  return null;
}
async function getJSON(url, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { console.warn(`  rate limited (${label}), waiting 65s`); await sleep(65_000); continue; }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (data && !Array.isArray(data) && (data["Error Message"] || data.message)) throw new Error(data["Error Message"] || data.message);
      return data;
    } catch (err) {
      if (attempt === 3) { console.warn(`  failed ${label}: ${err.message}`); return null; }
      await sleep(1500 * attempt);
    }
  }
  return null;
}

// ── EDGAR: find the 13F-HR for a period and read its information table ──
const submissionsCache = new Map();
async function submissions(cik) {
  if (submissionsCache.has(cik)) return submissionsCache.get(cik);
  const main = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!main) { submissionsCache.set(cik, null); return null; }
  const rows = [];
  const push = (f) => {
    const n = f.accessionNumber?.length || 0;
    for (let i = 0; i < n; i++) rows.push({ form: f.form[i], filingDate: f.filingDate[i], reportDate: f.reportDate[i], accession: f.accessionNumber[i], primary: f.primaryDocument?.[i] });
  };
  push(main.filings.recent);
  for (const extra of main.filings.files || []) {
    const page = await secFetch(`https://data.sec.gov/submissions/${extra.name}`);
    if (page) push(page);
  }
  const out = { name: main.name, rows };
  submissionsCache.set(cik, out);
  return out;
}

function parseInfoTable(xml) {
  // Namespace-agnostic regex parse of <infoTable> entries. Fields: nameOfIssuer,
  // titleOfClass, cusip, value, sshPrnamt, sshPrnamtType, putCall.
  const rows = [];
  const tag = (block, name) => {
    const m = block.match(new RegExp(`<(?:[\\w-]+:)?${name}>\\s*([\\s\\S]*?)\\s*<\\/(?:[\\w-]+:)?${name}>`, "i"));
    return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim() : "";
  };
  const re = /<(?:[\w-]+:)?infoTable>([\s\S]*?)<\/(?:[\w-]+:)?infoTable>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    rows.push({
      name: tag(b, "nameOfIssuer"), title: tag(b, "titleOfClass"), cusip: tag(b, "cusip").toUpperCase(),
      value: Number(tag(b, "value").replace(/,/g, "")), shares: Number(tag(b, "sshPrnamt").replace(/,/g, "")),
      sharesType: tag(b, "sshPrnamtType").toUpperCase(), putCall: tag(b, "putCall"),
    });
  }
  return rows;
}

async function readInfoTable(cik, accession) {
  const acc = accession.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}`;
  const index = await secFetch(`${base}/index.json`);
  const items = index?.directory?.item || [];
  const xmls = items.map((i) => i.name).filter((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  // Usually one XML besides primary_doc.xml. Try each until one holds an information table.
  for (const name of xmls) {
    const xml = await secFetch(`${base}/${name}`, "text");
    if (xml && /<(?:[\w-]+:)?infoTable>/i.test(xml)) return { rows: parseInfoTable(xml), file: `${base}/${name}` };
  }
  return null;
}

async function amendmentType(cik, accession) {
  const acc = accession.replace(/-/g, "");
  const xml = await secFetch(`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/primary_doc.xml`, "text");
  const m = xml && xml.match(/<(?:[\w-]+:)?amendmentType>\s*([\w ]+?)\s*</i);
  return m ? m[1].toUpperCase() : "";
}

async function edgarHoldings(cik, q) {
  const subs = await submissions(cik);
  if (!subs) return { rows: null, error: "no submissions" };
  const period = quarterEnd(q);
  const filings = subs.rows.filter((r) => (r.form === "13F-HR" || r.form === "13F-HR/A") && r.reportDate === period)
    .sort((a, b) => a.filingDate.localeCompare(b.filingDate));
  if (!filings.length) return { rows: null };
  const original = filings.find((f) => f.form === "13F-HR") || filings[0];
  let table = await readInfoTable(cik, original.accession);
  if (!table) return { rows: null, error: "no information table in filing" };
  let rows = table.rows;
  const amendments = filings.filter((f) => f.form === "13F-HR/A" && f.accession !== original.accession);
  for (const a of amendments) {
    const type = await amendmentType(cik, a.accession);
    const t = await readInfoTable(cik, a.accession);
    if (!t) continue;
    if (type.includes("RESTATEMENT")) rows = t.rows;           // replaces the original
    else rows = rows.concat(t.rows);                            // NEW HOLDINGS: adds to it
  }
  return { rows, filingDate: original.filingDate, amendments: amendments.length, file: table.file };
}

// ── FMP (optional) ─────────────────────────────────────────────
const fmp = (p, params) => {
  const u = new URL(`https://financialmodelingprep.com/stable/${p}`);
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  u.searchParams.set("apikey", FMP_KEY);
  return getJSON(u.toString(), `${p} ${params.cik || params.cusip || ""} ${params.year || ""}Q${params.quarter || ""}`);
};
async function fmpHoldings(cik, { year, quarter }) {
  const all = [];
  for (let page = 0; page < 20; page++) {
    const rows = await fmp("institutional-ownership/extract", { cik, year, quarter, page, limit: 100 });
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 100) break;
    await sleep(250);
  }
  if (!all.length) return { rows: null };
  return {
    rows: all.map((r) => ({
      name: r.securityName || r.name || "", title: r.titleOfClass || "", cusip: String(r.cusip || "").toUpperCase(),
      value: Number(r.marketValue ?? r.value ?? 0), shares: Number(r.sharesNumber ?? r.shares ?? 0),
      sharesType: String(r.sharesType || "SH").toUpperCase(), putCall: r.putCallShare || r.putCall || "", symbol: (r.symbol || "").toUpperCase(),
    })),
  };
}

// ── CUSIP → ticker ─────────────────────────────────────────────
let cusipMap = fs.existsSync(CUSIP_FILE) ? JSON.parse(fs.readFileSync(CUSIP_FILE, "utf8")) : {};
let cusipDirty = false;
const saveCusips = () => { if (cusipDirty) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(CUSIP_FILE, JSON.stringify(cusipMap, null, 1) + "\n"); cusipDirty = false; } };

// Primary map: the SEC's fails-to-deliver file, one zip per half-month with a
// CUSIP|SYMBOL|DESCRIPTION line for nearly every listed security. Free, one
// request, no rate limit. Loaded once per run.
let secMap = null;
function unzipSingle(buf) {
  // Minimal zip reader (one deflated entry): central directory → local header → inflateRaw.
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("not a zip");
  const cdOff = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cdOff + 10), csize = buf.readUInt32LE(cdOff + 20);
  const nameLen = buf.readUInt16LE(cdOff + 28), extraLen = buf.readUInt16LE(cdOff + 30), cmtLen = buf.readUInt16LE(cdOff + 32);
  const localOff = buf.readUInt32LE(cdOff + 42);
  const lNameLen = buf.readUInt16LE(localOff + 26), lExtraLen = buf.readUInt16LE(localOff + 28);
  const start = localOff + 30 + lNameLen + lExtraLen;
  const data = buf.subarray(start, start + csize);
  void nameLen; void extraLen; void cmtLen;
  return method === 0 ? data : zlib.inflateRawSync(data);
}
async function loadSecCusipMap() {
  if (secMap) return secMap;
  secMap = new Map();
  // Try the most recent half-month files, newest first (each posts about two weeks after its period).
  const now = new Date();
  const ym = (back) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const candidates = [...(now.getUTCDate() > 20 ? [`${ym(0)}a`] : []), `${ym(1)}b`, `${ym(1)}a`, `${ym(2)}b`, `${ym(2)}a`];
  for (const tag of candidates) {
    const url = `https://www.sec.gov/files/data/fails-deliver-data/cnsfails${tag}.zip`;
    try {
      const wait = 120 - (Date.now() - lastSec); if (wait > 0) await sleep(wait); lastSec = Date.now();
      const res = await fetch(url, { headers: { "User-Agent": SEC_UA } });
      if (!res.ok) continue;
      const txt = unzipSingle(Buffer.from(await res.arrayBuffer())).toString("latin1");
      for (const line of txt.split(/\r?\n/)) {
        const [, cusip, symbol, , desc] = line.split("|");
        if (cusip && symbol && /^[0-9A-Z]{9}$/.test(cusip) && !secMap.has(cusip)) secMap.set(cusip, { symbol: symbol.trim().toUpperCase(), name: (desc || "").trim() });
      }
      console.log(`  SEC fails-to-deliver map ${tag}: ${secMap.size} CUSIPs`);
      if (secMap.size > 1000) break;
    } catch (err) { console.warn(`  FTD ${tag}: ${err.message}`); }
  }
  return secMap;
}

let figiDown = false;
async function resolveCusips(cusips) {
  // Misses are cached with a date and retried after 60 days (new listings get a ticker eventually).
  const stale = (e) => e && !e.symbol && (!e.miss || Date.now() - Date.parse(e.miss) > 60 * 86400e3);
  let todo = [...new Set(cusips)].filter((c) => c && (!(c in cusipMap) || stale(cusipMap[c])));
  if (!todo.length) return;
  const sec = await loadSecCusipMap();
  for (const c of todo) { const hit = sec.get(c); if (hit) { cusipMap[c] = { symbol: hit.symbol.replace("/", "-"), name: hit.name, type: "sec-ftd", sector: "" }; cusipDirty = true; } }
  todo = todo.filter((c) => !cusipMap[c]?.symbol);
  saveCusips();
  if (!todo.length || figiDown) return;
  console.log(`  resolving ${todo.length} CUSIPs via OpenFIGI`);
  // OpenFIGI: 10 jobs/request without a key (25 req/min), 100 jobs/request with one.
  const batch = FIGI_KEY ? 100 : 10;
  let throttled = 0;
  for (let i = 0; i < todo.length && !figiDown; i += batch) {
    const slice = todo.slice(i, i + batch);
    let data = null;
    for (let attempt = 1; attempt <= 2 && !data; attempt++) {
      try {
        const res = await fetch("https://api.openfigi.com/v3/mapping", {
          method: "POST", headers: { "Content-Type": "application/json", ...(FIGI_KEY ? { "X-OPENFIGI-APIKEY": FIGI_KEY } : {}) },
          body: JSON.stringify(slice.map((c) => ({ idType: "ID_CUSIP", idValue: c }))),
        });
        if (res.status === 429) {
          // Shared egress IPs get throttled hard; after three throttles in a run, stop and leave the rest for next time.
          if (++throttled >= 3) { figiDown = true; console.warn("  OpenFIGI throttling; leaving remaining CUSIPs unmapped for this run"); break; }
          await sleep(FIGI_KEY ? 6500 : 61_000); continue;
        }
        if (!res.ok) throw new Error(`${res.status}`);
        data = await res.json();
      } catch (err) { if (attempt === 2) console.warn(`  OpenFIGI failed: ${err.message}`); else await sleep(3000); }
    }
    if (!data) continue; // not a confirmed miss; retried next run
    slice.forEach((c, j) => {
      const recs = data?.[j]?.data || [];
      // Prefer a US-listed common stock / ADR / ETF record; fall back to the first.
      const pick = recs.find((r) => r.exchCode === "US" && /Common Stock|ADR|ETP|REIT|Depositary|Ltd Part|MLP|Closed-End|Preferred/i.test(r.securityType || "")) || recs.find((r) => r.exchCode === "US") || recs[0];
      cusipMap[c] = pick ? { symbol: String(pick.ticker || "").replace("/", "-"), name: pick.name || "", type: pick.securityType || "", sector: pick.marketSector || "" } : { symbol: "", miss: new Date().toISOString().slice(0, 10) };
      cusipDirty = true;
    });
    saveCusips();
    if (!FIGI_KEY) await sleep(2600); // 25 requests/minute
  }
  // FMP for whatever OpenFIGI missed (capped so one run cannot burn the daily quota).
  const misses = todo.filter((c) => !cusipMap[c]?.symbol);
  if (FMP_KEY && misses.length) {
    for (const c of misses.slice(0, 60)) {
      const r = await fmp("search-cusip", { cusip: c });
      const hit = Array.isArray(r) && r.find((x) => x.symbol && !/\./.test(x.symbol)) || (Array.isArray(r) && r[0]);
      if (hit?.symbol) { cusipMap[c] = { symbol: hit.symbol.toUpperCase(), name: hit.companyName || hit.name || "", type: "fmp", sector: "" }; cusipDirty = true; }
      await sleep(300);
    }
    saveCusips();
  }
}

// ── Normalize one filing into {symbol → position} ──────────────
// Dual-class names are one company for our purposes; fold the second class into
// the ticker the book uses so a trim of GOOGL counts against GOOG.
const SHARE_CLASS_ALIASES = { GOOGL: "GOOG", "BRK-A": "BRK-B", FOXA: "FOX", NWSA: "NWS", LBTYA: "LBTYK", LBTYB: "LBTYK" };
function normalize(rows) {
  if (!rows) return { positions: new Map(), options: [], scale: 1 };
  const equity = rows.filter((r) => !r.putCall && r.sharesType !== "PRN" && r.shares > 0 && r.value > 0);
  // Some filers (Baupost, for one) still report values in $ thousands. If the
  // median implied share price is under $1 the table is in thousands.
  const implied = equity.map((r) => r.value / r.shares).sort((a, b) => a - b);
  const median = implied[Math.floor(implied.length / 2)] || 1;
  const scale = median < 1 ? 1000 : 1;
  const positions = new Map();
  const options = [];
  for (const r of rows) {
    const value = r.value * scale;
    const mapped = cusipMap[r.cusip];
    let symbol = r.symbol || mapped?.symbol || "";
    if (r.sharesType === "PRN") {                                                  // notes and convertibles: group by issuer
      const issuer = (r.name || "").toUpperCase().replace(/[^A-Z0-9& ]/g, "").split(/\s+/)[0] || r.cusip;
      symbol = `${symbol || issuer}-DEBT`;
    }
    if (!symbol) symbol = r.cusip;                                                 // unmapped: keep the CUSIP so nothing is silently dropped
    symbol = SHARE_CLASS_ALIASES[symbol] || symbol;
    const name = r.name || mapped?.name || symbol;
    if (r.putCall) { options.push({ symbol, name, type: r.putCall, value, shares: r.shares }); continue; }
    const p = positions.get(symbol);
    positions.set(symbol, { symbol, name: p?.name || name, shares: (p?.shares || 0) + r.shares, value: (p?.value || 0) + value, debt: r.sharesType === "PRN" });
  }
  return { positions, options, scale };
}

function diff(now, prev) {
  const moves = [];
  for (const [sym, h] of now) {
    const p = prev.get(sym);
    if (!p) { if (h.value >= MIN_VALUE_USD) moves.push({ symbol: sym, name: h.name, action: "new", shares: h.shares, value: h.value, change: null }); continue; }
    const chg = p.shares > 0 ? h.shares / p.shares - 1 : null;
    if (chg != null && chg >= ADD_THRESHOLD && h.value >= MIN_VALUE_USD) moves.push({ symbol: sym, name: h.name, action: "add", shares: h.shares, value: h.value, change: +chg.toFixed(4) });
    else if (chg != null && chg <= -ADD_THRESHOLD && p.value >= MIN_VALUE_USD) moves.push({ symbol: sym, name: h.name, action: "trim", shares: h.shares, value: h.value, change: +chg.toFixed(4) });
  }
  for (const [sym, p] of prev) if (!now.has(sym) && p.value >= MIN_VALUE_USD) moves.push({ symbol: sym, name: p.name, action: "exit", shares: 0, value: 0, change: -1, priorValue: p.value });
  const order = { new: 0, add: 1, trim: 2, exit: 3 };
  return moves.sort((a, b) => order[a.action] - order[b.action] || (b.value || b.priorValue || 0) - (a.value || a.priorValue || 0));
}

// ── One quarter ────────────────────────────────────────────────
const rawCache = new Map(); // `${cik}|${year}Q${q}` → holdings result (so backfill reads each filing once)
async function holdingsFor(cik, q) {
  const key = `${cik}|${q.year}Q${q.quarter}`;
  if (rawCache.has(key)) return rawCache.get(key);
  const r = SOURCE === "fmp" ? await fmpHoldings(cik, q) : await edgarHoldings(cik, q);
  rawCache.set(key, r);
  return r;
}

async function sweepQuarter(Q, funds, port) {
  const PQ = prevQuarter(Q);
  const held = new Map(port.holdings.map((h) => [h.ticker.replace(".", "-"), h]));
  const benched = new Map((port.bench || []).map((b) => [b.ticker.replace(".", "-"), b]));
  console.log(`\n13F sweep: ${qlabel(Q)} vs ${qlabel(PQ)}, ${funds.length} funds, source ${SOURCE}`);

  const report = {
    asOf: new Date().toISOString().slice(0, 10), quarter: Q, priorQuarter: PQ, source: SOURCE === "fmp" ? "FMP institutional ownership" : "SEC EDGAR 13F-HR information tables",
    rules: { addThreshold: ADD_THRESHOLD, minValueUsd: MIN_VALUE_USD, options: "excluded from the share diff, listed per fund", debt: "notes and convertibles carry a -DEBT suffix" },
    funds: [], consensus: [], overlap: { holdings: [], bench: [] }, missing: [],
  };
  const tally = new Map();

  for (const f of funds) {
    process.stdout.write(`${f.name.padEnd(26)}`);
    const nowRaw = await holdingsFor(f.cik, Q);
    if (!nowRaw.rows) { console.log(nowRaw.error ? ` ${nowRaw.error}` : " not filed yet"); report.missing.push(f.name); continue; }
    const prevRaw = await holdingsFor(f.cik, PQ);
    // Resolve tickers only for rows that can show up in the report (over the $20M line, either quarter).
    const scaleOf = (rows) => { const eq = rows.filter((r) => !r.putCall && r.sharesType !== "PRN" && r.shares > 0 && r.value > 0).map((r) => r.value / r.shares).sort((a, b) => a - b); return (eq[Math.floor(eq.length / 2)] || 1) < 1 ? 1000 : 1; };
    const need = [];
    for (const rows of [nowRaw.rows, prevRaw.rows || []]) { const s = scaleOf(rows); for (const r of rows) if (!r.symbol && r.sharesType !== "PRN" && r.value * s >= MIN_VALUE_USD / 2) need.push(r.cusip); }
    await resolveCusips(need);

    const now = normalize(nowRaw.rows), prev = normalize(prevRaw.rows);
    const moves = diff(now.positions, prev.positions);
    const total = [...now.positions.values()].reduce((a, h) => a + h.value, 0);
    const prevTotal = [...prev.positions.values()].reduce((a, h) => a + h.value, 0);
    const top = [...now.positions.values()].sort((a, b) => b.value - a.value).slice(0, TOP_N).map((h) => ({ symbol: h.symbol, name: h.name, value: Math.round(h.value), pct: total ? +(h.value / total).toFixed(4) : null }));
    const turnover = total ? +((moves.filter((m) => m.action === "new").reduce((a, m) => a + m.value, 0) + moves.filter((m) => m.action === "exit").reduce((a, m) => a + (m.priorValue || 0), 0)) / total).toFixed(3) : null;
    report.funds.push({
      name: f.name, cik: f.cik, style: f.style, filingDate: nowRaw.filingDate || null, amendments: nowRaw.amendments || 0,
      positions: now.positions.size, prevPositions: prev.positions.size || null,
      totalValue: Math.round(total), prevTotalValue: prev.positions.size ? Math.round(prevTotal) : null,
      top10Pct: total ? +(top.reduce((a, t) => a + t.value, 0) / total).toFixed(3) : null, turnover,
      valuesScaled: now.scale !== 1, top, moves, options: now.options.filter((o) => o.value >= MIN_VALUE_USD).map((o) => ({ ...o, value: Math.round(o.value) })),
    });
    for (const m of moves) {
      const t = tally.get(m.symbol) || { symbol: m.symbol, name: m.name, buys: [], sells: [], netValue: 0 };
      if (m.action === "new" || m.action === "add") { t.buys.push(`${f.name} (${m.action})`); t.netValue += m.value; }
      else { t.sells.push(`${f.name} (${m.action})`); t.netValue -= m.action === "exit" ? (m.priorValue || 0) : m.value; }
      tally.set(m.symbol, t);
    }
    const c = moves.reduce((a, m) => ((a[m.action] = (a[m.action] || 0) + 1), a), {});
    console.log(` ${String(now.positions.size).padStart(4)} positions $${(total / 1e9).toFixed(1)}B${now.scale !== 1 ? " (values ×1000)" : ""}  new ${c.new || 0}  add ${c.add || 0}  trim ${c.trim || 0}  exit ${c.exit || 0}`);
  }

  report.consensus = [...tally.values()]
    .map((t) => ({ ...t, netValue: Math.round(t.netValue), score: t.buys.length - t.sells.length }))
    .filter((t) => t.buys.length + t.sells.length >= 2)
    .sort((a, b) => b.score - a.score || b.netValue - a.netValue);
  for (const t of tally.values()) {
    if (held.has(t.symbol)) report.overlap.holdings.push({ symbol: t.symbol, sleeve: held.get(t.symbol).sleeve, buys: t.buys, sells: t.sells });
    if (benched.has(t.symbol)) report.overlap.bench.push({ symbol: t.symbol, buys: t.buys, sells: t.sells });
  }
  // Holders of our names among the filers, for the Names view (count + total value), from the top lists and moves.
  report.heldByFilers = {};
  for (const f of report.funds) {
    const seen = new Set();
    for (const t of f.top) if ((held.has(t.symbol) || benched.has(t.symbol)) && !seen.has(t.symbol)) { seen.add(t.symbol); (report.heldByFilers[t.symbol] ||= []).push({ fund: f.name, value: t.value, pct: t.pct }); }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, qfile(Q));
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  console.log(`\nConsensus (2+ funds moved):`);
  for (const t of report.consensus.slice(0, 25)) console.log(`  ${t.symbol.padEnd(8)} ${String(t.score).padStart(3)}  buys ${t.buys.length}  sells ${t.sells.length}`);
  console.log(`Overlap with holdings: ${report.overlap.holdings.map((o) => `${o.symbol} (+${o.buys.length}/−${o.sells.length})`).join(", ") || "none"}`);
  console.log(`Overlap with bench:    ${report.overlap.bench.map((o) => `${o.symbol} (+${o.buys.length}/−${o.sells.length})`).join(", ") || "none"}`);
  if (report.missing.length) console.log(`Not filed for ${qlabel(Q)}: ${report.missing.join(", ")}`);
  console.log(`Wrote ${path.relative(ROOT, out)}`);
  return report;
}

function writeIndex() {
  const files = fs.readdirSync(OUT_DIR).filter((f) => /^\d{4}-q[1-4]\.json$/.test(f)).sort();
  const quarters = files.map((f) => {
    const r = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
    return { year: r.quarter.year, quarter: r.quarter.quarter, file: f, asOf: r.asOf, filed: r.funds.length, missing: r.missing.length, source: r.source };
  });
  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), quarters }, null, 2) + "\n");
  console.log(`Index: ${quarters.map((q) => `${q.year} Q${q.quarter} (${q.filed} filed)`).join(", ")}`);
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (SOURCE === "fmp" && !FMP_KEY) { console.error("SOURCE=fmp needs FMP_API_KEY."); process.exit(1); }
  const { funds } = JSON.parse(fs.readFileSync(FUNDS_FILE, "utf8"));
  const port = JSON.parse(fs.readFileSync(PORT_FILE, "utf8"));
  let Q = positional.length === 2 ? { year: positional[0], quarter: positional[1] } : latestCompleteQuarter();
  const quarters = [];
  for (let i = 0; i < BACKFILL; i++) { quarters.unshift(Q); Q = prevQuarter(Q); }
  for (const q of quarters) await sweepQuarter(q, funds, port);
  saveCusips();
  writeIndex();
}

main().catch((e) => { console.error(e); process.exit(1); });
