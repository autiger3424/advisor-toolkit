#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   SCORE PORTFOLIO — weekly refresh of src/data/model-portfolio.json

   Runs on Sundays (GitHub Action) or by hand:
     FMP_API_KEY=... node scripts/score-portfolio.mjs

   For every holding it pulls FMP fundamentals, estimates and the
   latest price, then recomputes the five-factor score:

     Quality     ROIC (ROE for financials, REITs, utilities), operating
                 margin, net debt / EBITDA, 3-year FCF conversion
     Growth      forward EPS growth (2-year CAGR of consensus), bumped by
                 forward revenue growth over 20%, cut if under 7%
     Valuation   PEG, penalized above 15x sales
     Estimates   Zacks Rank (set by hand in reviews, stored in the file)
                 plus the change in next-FY consensus vs ~60 days ago
     Durability  set by hand, never touched here

   It never adds or removes a name. It updates prices, return since
   entry, factor inputs, the score, and flags for the monthly review:
     • score under 18
     • Zacks Rank 4 or worse
     • next-FY consensus cut more than 5% in ~60 days
   Membership and weights change only in the monthly review; hard
   triggers are acted on the week they fire, by hand.
──────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "..", "src", "data", "model-portfolio.json");
const FMP_KEY = process.env.FMP_API_KEY;
if (!FMP_KEY) {
  console.error("FMP_API_KEY is not set.");
  process.exit(1);
}

const CFG = {
  bar: 18,
  revisionLookbackDays: 60,
  revisionCutFlag: -0.05,
  aiCapexCap: 50,
  historyKeep: 30,
  financialSectors: new Set(["Financial Services", "Real Estate", "Utilities"]),
};

// ── HTTP helpers (same shape as screen.mjs) ────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, { retries = 3, label = "" } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.warn(`  rate limited (${label}), waiting 65s`);
        await sleep(65_000);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (data && typeof data === "object" && !Array.isArray(data) && (data.status === "error" || data["Error Message"])) {
        throw new Error(data.message || data["Error Message"]);
      }
      return data;
    } catch (err) {
      if (attempt === retries) {
        console.warn(`  failed ${label}: ${err.message}`);
        return null;
      }
      await sleep(1500 * attempt);
    }
  }
  return null;
}

const fmp = (p, params = {}) => {
  const u = new URL(`https://financialmodelingprep.com/stable/${p}`);
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  u.searchParams.set("apikey", FMP_KEY);
  return getJSON(u.toString(), { label: `${p} ${params.symbol || ""}` });
};

const first = (x) => (Array.isArray(x) ? x[0] : x) || null;
const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const pick = (obj, keys) => {
  if (!obj) return null;
  for (const k of keys) if (obj[k] != null && obj[k] !== "") return num(obj[k]);
  return null;
};
const cagr = (end, start, years) => (end != null && start != null && start > 0 && end > 0 && years > 0 ? Math.pow(end / start, 1 / years) - 1 : null);
const fmtPct = (x) => (x == null ? null : Number((x * 100).toFixed(1)));
const fmt1 = (x) => (x == null ? null : Number(x.toFixed(1)));
const fmt2 = (x) => (x == null ? null : Number(x.toFixed(2)));
const clamp = (n) => Math.max(1, Math.min(5, n));
// FMP wants BRK-B; the file keeps the dotted form people type.
const fmpSymbol = (t) => t.replace(".", "-");

// ── Fundamentals, estimates, price ─────────────────────────────
async function enrich(h) {
  const sym = fmpSymbol(h.ticker);
  const [km, ratios, inc, cf, est, quote] = await Promise.all([
    fmp("key-metrics-ttm", { symbol: sym }),
    fmp("ratios-ttm", { symbol: sym }),
    fmp("income-statement", { symbol: sym, period: "annual", limit: 4 }),
    fmp("cash-flow-statement", { symbol: sym, period: "annual", limit: 3 }),
    fmp("analyst-estimates", { symbol: sym, period: "annual", limit: 8 }),
    fmp("quote", { symbol: sym }),
  ]);
  const k = first(km), r = first(ratios), q = first(quote);
  const out = {};

  out.roic = pick(k, ["returnOnInvestedCapitalTTM", "roicTTM"]);
  out.roe = pick(k, ["returnOnEquityTTM", "roeTTM"]) ?? pick(r, ["returnOnEquityTTM"]);
  out.opMargin = pick(r, ["operatingProfitMarginTTM", "operatingMarginTTM"]);
  out.netDebtEbitda = pick(k, ["netDebtToEBITDATTM"]);
  out.pe = pick(r, ["priceToEarningsRatioTTM", "peRatioTTM"]);
  out.ps = pick(r, ["priceToSalesRatioTTM", "priceSalesRatioTTM"]);

  const years = (Array.isArray(inc) ? inc : []).filter((y) => y.revenue != null).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const fy0 = years[0] || null;
  const lastFyDate = fy0?.date || null;
  const epsFy0 = num(fy0?.epsDiluted ?? fy0?.eps);

  const cfs = (Array.isArray(cf) ? cf : []).filter((y) => y.netIncome != null);
  const niSum = cfs.reduce((a, y) => a + num(y.netIncome), 0);
  const fcfSum = cfs.reduce((a, y) => a + (num(y.freeCashFlow) ?? 0), 0);
  out.fcfToNi = cfs.length && niSum > 0 ? fcfSum / niSum : null;

  const fwd = (Array.isArray(est) ? est : [])
    .filter((e) => lastFyDate && String(e.date) > lastFyDate && num(e.epsAvg) != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const fy1 = fwd[0] || null, fy2 = fwd[1] || null;
  out.epsFy1 = num(fy1?.epsAvg);
  out.fy1 = fy1 ? String(fy1.date).slice(0, 4) : null;
  const epsFy2 = num(fy2?.epsAvg), revFy2 = num(fy2?.revenueAvg);
  out.fwdEpsGrowth = fy2 ? cagr(epsFy2, epsFy0, 2) : fy1 ? cagr(out.epsFy1, epsFy0, 1) : null;
  out.fwdRevGrowth = fy2 ? cagr(revFy2, num(fy0?.revenue), 2) : fy1 ? cagr(num(fy1.revenueAvg), num(fy0?.revenue), 1) : null;
  out.peg = out.pe != null && out.pe > 0 && out.fwdEpsGrowth != null && out.fwdEpsGrowth > 0 ? out.pe / (out.fwdEpsGrowth * 100) : null;

  out.price = num(q?.price);
  out.priceDate = q?.timestamp ? new Date(q.timestamp * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return out;
}

// Next-FY consensus vs the value this file recorded ~60 days ago.
function revisionFromHistory(h, epsFy1, fy1) {
  const hist = (h.history || []).filter((x) => x.fy === fy1 && x.eps != null);
  if (!hist.length || epsFy1 == null) return null;
  const target = Date.now() - CFG.revisionLookbackDays * 86_400_000;
  const base = hist.slice().sort((a, b) => Math.abs(new Date(a.date) - target) - Math.abs(new Date(b.date) - target))[0];
  const ageDays = (Date.now() - new Date(base.date)) / 86_400_000;
  if (ageDays < 21) return null;
  if (!(Math.abs(base.eps) > 0.05)) return null;
  return { pct: epsFy1 / base.eps - 1, days: Math.round(ageDays) };
}

// ── Scoring (mirrors the Nov 4, 2026 rubric) ───────────────────
function scoreQuality(h, f) {
  const fin = CFG.financialSectors.has(h.sector);
  const m = fin ? f.roe : f.roic;
  if (m == null) return h.factors?.quality ?? 3; // keep last if FMP has nothing
  let q = m >= 0.35 ? 5 : m >= 0.20 ? 4 : m >= 0.12 ? 3 : m >= 0.08 ? 2 : 1;
  if (!fin && f.netDebtEbitda != null && f.netDebtEbitda > 3) q -= 1;
  if (f.fcfToNi != null && f.fcfToNi < 0.6 && !CFG.financialSectors.has(h.sector)) q -= 1;
  if (f.opMargin != null && f.opMargin >= 0.40) q += 1;
  return clamp(q);
}
function scoreGrowth(f, prev) {
  const g = f.fwdEpsGrowth;
  if (g == null) return prev ?? 3;
  let s = g >= 0.30 ? 5 : g >= 0.20 ? 4 : g >= 0.14 ? 3 : g >= 0.09 ? 2 : 1;
  if (f.fwdRevGrowth != null && f.fwdRevGrowth >= 0.20) s += 1;
  if (f.fwdRevGrowth != null && f.fwdRevGrowth < 0.07) s -= 1;
  return clamp(s);
}
function scoreValuation(f, prev) {
  if (f.peg == null) return prev ?? 2;
  let s = f.peg <= 0.8 ? 5 : f.peg <= 1.2 ? 4 : f.peg <= 1.8 ? 3 : f.peg <= 2.6 ? 2 : 1;
  if (f.ps != null && f.ps > 15) s -= 1;
  return clamp(s);
}
function scoreEstimates(h, rev) {
  const r = h.zacksRank;
  let s = r ? { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 }[r] : 3;
  if (rev && rev.pct >= 0.03) s += 1;
  if (rev && rev.pct < -0.01) s -= 1;
  return clamp(s);
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  let priceDate = null;

  for (const h of data.holdings) {
    process.stdout.write(`${h.ticker.padEnd(6)}`);
    const f = await enrich(h);
    const rev = revisionFromHistory(h, f.epsFy1, f.fy1);

    const factors = {
      quality: scoreQuality(h, f),
      growth: scoreGrowth(f, h.factors?.growth),
      valuation: scoreValuation(f, h.factors?.valuation),
      estimates: scoreEstimates(h, rev),
      durability: h.factors?.durability ?? 3,
    };
    const score = Object.values(factors).reduce((a, b) => a + b, 0);

    const flags = [];
    if (score < CFG.bar) flags.push(`score ${score} under ${CFG.bar}`);
    if (h.zacksRank >= 4) flags.push(`Zacks Rank ${h.zacksRank}`);
    if (rev && rev.pct <= CFG.revisionCutFlag) flags.push(`next-FY consensus cut ${(rev.pct * 100).toFixed(1)}% in ${rev.days} days`);

    Object.assign(h, {
      factors, score, flags,
      roic: fmtPct(f.roic), roe: fmtPct(f.roe), opMargin: fmtPct(f.opMargin), netDebtEbitda: fmt1(f.netDebtEbitda),
      fcfToNi: fmtPct(f.fcfToNi), pe: fmt1(f.pe), ps: fmt1(f.ps), peg: fmt2(f.peg),
      fwdEpsGrowth: fmtPct(f.fwdEpsGrowth), fwdRevGrowth: fmtPct(f.fwdRevGrowth),
      epsFy1: fmt2(f.epsFy1), fy1: f.fy1, revision: rev ? fmtPct(rev.pct) : null,
    });
    if (f.price != null) {
      h.price = fmt2(f.price);
      h.priceDate = f.priceDate;
      h.returnSinceEntry = h.entryPrice ? fmtPct(f.price / h.entryPrice - 1) : null;
      priceDate = priceDate && priceDate > f.priceDate ? priceDate : f.priceDate;
    }
    h.history = [...(h.history || []), { date: today, fy: f.fy1, eps: fmt2(f.epsFy1), score, price: h.price }].slice(-CFG.historyKeep);

    console.log(` ${String(score).padStart(2)}  ${h.returnSinceEntry != null ? (h.returnSinceEntry > 0 ? "+" : "") + h.returnSinceEntry + "%" : "—"}${flags.length ? "  ⚑ " + flags.join("; ") : ""}`);
    await sleep(250);
  }

  const aiWeight = data.holdings.filter((h) => h.aiCapex).reduce((a, h) => a + (h.weight || 0), 0);
  data.portfolioFlags = aiWeight > CFG.aiCapexCap ? [`AI-capex names at ${aiWeight}%, over the ${CFG.aiCapexCap}% cap`] : [];
  data.asOf = today;
  if (priceDate) data.priceDate = priceDate;
  data.generatedBy = "scripts/score-portfolio.mjs (FMP fundamentals and prices; Zacks Rank and durability by hand)";

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
  const flagged = data.holdings.filter((h) => h.flags.length);
  console.log(`\nWrote ${FILE}. ${flagged.length} name(s) flagged for review${flagged.length ? ": " + flagged.map((h) => h.ticker).join(", ") : ""}.`);
  if (data.portfolioFlags.length) console.log(data.portfolioFlags.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
