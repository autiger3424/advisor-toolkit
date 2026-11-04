#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   SWEEP 13F — what the funds in src/data/13f-funds.json bought and
   sold last quarter, cross-referenced against the model portfolio.

   Runs after each 13F deadline (Feb 14, May 15, Aug 14, Nov 14) via
   .github/workflows/sweep-13f.yml, or by hand:
     FMP_API_KEY=... node scripts/sweep-13f.mjs            # latest complete quarter
     FMP_API_KEY=... node scripts/sweep-13f.mjs 2026 3     # a specific quarter

   Source: FMP institutional-ownership endpoints (13F-HR from EDGAR).
   For each fund it pulls the quarter and the prior quarter, then
   classifies every position:
     new     held now, not last quarter
     add     shares up 20%+
     trim    shares down 20%+
     exit    held last quarter, gone now
   Output: src/data/13f-sweep.json with per-fund moves, a consensus
   table (how many funds bought / sold each ticker), and the overlap
   with the model portfolio's holdings and bench.

   It changes nothing in the portfolio. The report is for the monthly
   review and the ideas list.
──────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNDS_FILE = path.join(__dirname, "..", "src", "data", "13f-funds.json");
const PORT_FILE = path.join(__dirname, "..", "src", "data", "model-portfolio.json");
const OUT_FILE = path.join(__dirname, "..", "src", "data", "13f-sweep.json");
const FMP_KEY = process.env.FMP_API_KEY;
if (!FMP_KEY) {
  console.error("FMP_API_KEY is not set.");
  process.exit(1);
}

const ADD_THRESHOLD = 0.20;
const MIN_VALUE_USD = 20_000_000; // ignore positions under $20M so index-like noise stays out

// ── Quarter selection ──────────────────────────────────────────
function latestCompleteQuarter(now = new Date()) {
  // 13F for quarter ending Q is due 45 days after quarter end. Treat a
  // quarter as "complete" once its deadline has passed.
  const y = now.getUTCFullYear();
  const deadlines = [
    { year: y - 1, quarter: 4, due: Date.UTC(y, 1, 15) },      // Dec 31 → Feb 14
    { year: y, quarter: 1, due: Date.UTC(y, 4, 16) },          // Mar 31 → May 15
    { year: y, quarter: 2, due: Date.UTC(y, 7, 15) },          // Jun 30 → Aug 14
    { year: y, quarter: 3, due: Date.UTC(y, 10, 15) },         // Sep 30 → Nov 14
  ];
  let pick = { year: y - 1, quarter: 3 };
  for (const d of deadlines) if (now.getTime() >= d.due) pick = { year: d.year, quarter: d.quarter };
  return pick;
}
const prevQuarter = ({ year, quarter }) => (quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 });

const argYear = Number(process.argv[2]), argQ = Number(process.argv[3]);
const Q = argYear && argQ ? { year: argYear, quarter: argQ } : latestCompleteQuarter();
const PQ = prevQuarter(Q);

// ── HTTP ───────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const fmp = (p, params) => {
  const u = new URL(`https://financialmodelingprep.com/stable/${p}`);
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  u.searchParams.set("apikey", FMP_KEY);
  return getJSON(u.toString(), `${p} ${params.cik || ""} ${params.year || ""}Q${params.quarter || ""}`);
};

// FMP's 13F extract returns one row per position: symbol, securityName,
// sharesNumber, marketValue, cusip, ... Field names have drifted between
// API versions, so read defensively.
const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
function normalize(rows) {
  const out = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const sym = (r.symbol || r.ticker || "").toUpperCase();
    if (!sym) continue;
    const shares = num(r.sharesNumber ?? r.shares ?? r.sharesHeld);
    const value = num(r.marketValue ?? r.value ?? r.valueUsd);
    if (shares == null) continue;
    const prev = out.get(sym);
    out.set(sym, { symbol: sym, name: r.securityName || r.name || sym, shares: (prev?.shares || 0) + shares, value: (prev?.value || 0) + (value || 0) });
  }
  return out;
}

async function holdings(cik, { year, quarter }) {
  // Pages of up to 100 rows.
  const all = [];
  for (let page = 0; page < 20; page++) {
    const rows = await fmp("institutional-ownership/extract", { cik, year, quarter, page, limit: 100 });
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 100) break;
    await sleep(250);
  }
  return normalize(all);
}

function diff(now, prev) {
  const moves = [];
  for (const [sym, h] of now) {
    const p = prev.get(sym);
    if (!p) { if ((h.value || 0) >= MIN_VALUE_USD) moves.push({ symbol: sym, name: h.name, action: "new", shares: h.shares, value: h.value, change: null }); continue; }
    const chg = p.shares > 0 ? h.shares / p.shares - 1 : null;
    if (chg != null && chg >= ADD_THRESHOLD && (h.value || 0) >= MIN_VALUE_USD) moves.push({ symbol: sym, name: h.name, action: "add", shares: h.shares, value: h.value, change: chg });
    else if (chg != null && chg <= -ADD_THRESHOLD && (p.value || 0) >= MIN_VALUE_USD) moves.push({ symbol: sym, name: h.name, action: "trim", shares: h.shares, value: h.value, change: chg });
  }
  for (const [sym, p] of prev) {
    if (!now.has(sym) && (p.value || 0) >= MIN_VALUE_USD) moves.push({ symbol: sym, name: p.name, action: "exit", shares: 0, value: 0, change: -1 });
  }
  const order = { new: 0, add: 1, trim: 2, exit: 3 };
  return moves.sort((a, b) => order[a.action] - order[b.action] || (b.value || 0) - (a.value || 0));
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const { funds } = JSON.parse(fs.readFileSync(FUNDS_FILE, "utf8"));
  const port = JSON.parse(fs.readFileSync(PORT_FILE, "utf8"));
  const held = new Map(port.holdings.map((h) => [h.ticker.replace(".", "-"), h]));
  const benched = new Map((port.bench || []).map((b) => [b.ticker.replace(".", "-"), b]));

  console.log(`13F sweep: ${Q.year} Q${Q.quarter} vs ${PQ.year} Q${PQ.quarter}, ${funds.length} funds\n`);
  const report = { asOf: new Date().toISOString().slice(0, 10), quarter: Q, priorQuarter: PQ, funds: [], consensus: [], overlap: { holdings: [], bench: [] }, missing: [] };
  const tally = new Map(); // symbol → { buys: [fund], sells: [fund], newPositions, exits, netValue }

  for (const f of funds) {
    process.stdout.write(`${f.name.padEnd(26)}`);
    const [now, prev] = [await holdings(f.cik, Q), await holdings(f.cik, PQ)];
    if (now.size === 0) { console.log(" no filing yet"); report.missing.push(f.name); continue; }
    const moves = diff(now, prev);
    const totalValue = [...now.values()].reduce((a, h) => a + (h.value || 0), 0);
    const top = [...now.values()].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 10).map((h) => ({ symbol: h.symbol, value: h.value, pct: totalValue ? h.value / totalValue : null }));
    report.funds.push({ name: f.name, cik: f.cik, style: f.style, positions: now.size, totalValue, top, moves });
    for (const m of moves) {
      const t = tally.get(m.symbol) || { symbol: m.symbol, name: m.name, buys: [], sells: [], netValue: 0 };
      if (m.action === "new" || m.action === "add") { t.buys.push(`${f.name} (${m.action})`); t.netValue += m.value || 0; }
      else { t.sells.push(`${f.name} (${m.action})`); t.netValue -= m.value || 0; }
      tally.set(m.symbol, t);
    }
    const counts = moves.reduce((a, m) => ((a[m.action] = (a[m.action] || 0) + 1), a), {});
    console.log(` ${String(now.size).padStart(3)} positions  new ${counts.new || 0}  add ${counts.add || 0}  trim ${counts.trim || 0}  exit ${counts.exit || 0}`);
    await sleep(300);
  }

  report.consensus = [...tally.values()]
    .map((t) => ({ ...t, score: t.buys.length - t.sells.length }))
    .filter((t) => t.buys.length + t.sells.length >= 2)
    .sort((a, b) => b.score - a.score || b.netValue - a.netValue);

  for (const t of tally.values()) {
    if (held.has(t.symbol)) report.overlap.holdings.push({ symbol: t.symbol, sleeve: held.get(t.symbol).sleeve, buys: t.buys, sells: t.sells });
    if (benched.has(t.symbol)) report.overlap.bench.push({ symbol: t.symbol, buys: t.buys, sells: t.sells });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2) + "\n");

  console.log(`\nConsensus (2+ funds moved):`);
  for (const t of report.consensus.slice(0, 25)) console.log(`  ${t.symbol.padEnd(7)} ${String(t.score).padStart(3)}  buys ${t.buys.length}  sells ${t.sells.length}`);
  console.log(`\nOverlap with holdings: ${report.overlap.holdings.map((o) => `${o.symbol} (+${o.buys.length}/−${o.sells.length})`).join(", ") || "none"}`);
  console.log(`Overlap with bench:    ${report.overlap.bench.map((o) => `${o.symbol} (+${o.buys.length}/−${o.sells.length})`).join(", ") || "none"}`);
  if (report.missing.length) console.log(`\nNo ${Q.year} Q${Q.quarter} filing yet: ${report.missing.join(", ")}`);
  console.log(`\nWrote ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
