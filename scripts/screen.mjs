#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   WEEKLY IDEAS SCREEN — quality with growth
   Rebuilds src/data/weekly-ideas.json from live FMP data.

   Philosophy
     This is an idea reference list, not a trading list. Names earn a
     slot by being durable businesses (the quality gate) that are
     compounding (the growth score). Price momentum is NOT a removal
     trigger: a name leaves only when the fundamentals break.

   Pipeline
     1. Universe  — FMP company screener: US stocks over $25B, by sector,
                    plus a fixed AI watchlist. Incumbents always included.
     2. Quality   — the gate. ROIC, operating margin (level and 2-yr
                    trend), cash conversion, net debt/EBITDA. Sector-aware.
                    Fail the gate → not eligible (incumbents get two
                    strikes, see "removal").
     3. Growth    — the ranking. Forward 2-yr EPS and revenue growth
                    (consensus), trailing 3-yr EPS growth, estimate
                    revisions (vs this file's own estimate history) and
                    net analyst grades.
     4. Valuation — the sanity check. P/S, P/E and forward PEG caps for
                    new entrants; incumbents only on a wide P/S breach.
     5. Price     — FMP quote: price, 52-week high (Watch flag only),
                    52-week return (tiebreak only). No 200-day rule.
     6. Select    — sector slots, AI sleeve from the watchlist, incumbents
                    keep their slot unless a challenger clearly outscores
                    them (bonus + weekly swap cap).
     7. Diff      — New / Hold / Watch / Removed with a one-line reason.

   Removal triggers (fundamental only)
     • consensus EPS (next FY) cut by more than 5% over ~60 days
     • two consecutive earnings misses
     • fails the quality gate two runs in a row (one run → Watch)
     • trailing price/sales more than 25% over the cap
     • guidance cuts are not in FMP; they show up through estimate cuts

   Env
     FMP_API_KEY        required
     SCREEN_LIMIT       optional, cap names per sector for test runs
     DRY_RUN=1          optional, print JSON instead of writing it

   Run:  node scripts/screen.mjs
──────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/weekly-ideas.json");

const FMP_KEY = process.env.FMP_API_KEY;
if (!FMP_KEY) {
  console.error("Missing FMP_API_KEY.");
  process.exit(1);
}

// ── Configuration (everything tunable lives here) ──────────────
const CFG = {
  minMarketCap: 25_000_000_000,
  candidatesPerSector: Number(process.env.SCREEN_LIMIT) || 15, // by market cap (tech gets 2x)
  slots: {
    Technology: 9,
    "Financial Services": 5,
    Healthcare: 4,
    "Consumer Cyclical": 4,
    Industrials: 4,
    "Communication Services": 3,
    Energy: 2,
    "Consumer Defensive": 2,
    "Basic Materials": 2,
    "Real Estate": 2,
    Utilities: 2,
  },
  maxAiSleeve: 8,
  minTotal: 42,
  maxTotal: 50,
  incumbentBonus: 15,     // a challenger must outscore a holding by this much to take its slot
  maxSwapsPerWeek: 2,     // score-based swaps are capped; hard-rule removals always go through

  // Quality gate. Default applies unless a sector overrides a key; a key set to null is skipped.
  quality: {
    default: { minRoic: 0.10, minOpMargin: 0.10, maxMarginDrop: 0.03, minCashConv: 0.80, maxNetDebtEbitda: 3.0 },
    "Financial Services": { minRoic: null, minRoe: 0.12, minOpMargin: null, maxMarginDrop: null, minCashConv: null, maxNetDebtEbitda: null },
    "Real Estate":        { minRoic: null, minRoe: 0.04, minOpMargin: 0.20, maxMarginDrop: 0.05, minCashConv: null, maxNetDebtEbitda: 7.0 },
    Utilities:            { minRoic: 0.03, minOpMargin: 0.15, maxMarginDrop: 0.05, minCashConv: null, maxNetDebtEbitda: 6.0 },   // regulated returns run 3–5% on FMP's ROIC
    Energy:               { minRoic: 0.07, minOpMargin: 0.10, maxMarginDrop: 0.08, maxNetDebtEbitda: 2.0 },                   // cyclical; margins swing with crude
    Healthcare:           { minRoic: 0.08, minOpMargin: 0.06, maxNetDebtEbitda: 3.5 },                                        // acquirers carry goodwill; managed care runs thin
    "Consumer Defensive": { minOpMargin: 0.05 },                                                                               // retailers run thin
    "Consumer Cyclical":  { minRoic: 0.08, minOpMargin: 0.08, maxNetDebtEbitda: 3.5 },                                        // leases inflate invested capital (AMZN, hotels)
    Industrials:          { minRoic: 0.09, minOpMargin: 0.10 },
    "Basic Materials":    { minRoic: 0.08, maxMarginDrop: 0.06 },
    Technology:           { minRoic: 0.10, minOpMargin: 0.10 },
  },
  // ROIC thresholds are calibrated to FMP's definition (NOPAT / invested capital including
  // goodwill and leases), which runs lower than most broker ROIC figures.
  // Cash conversion is operating cash flow / net income (not free cash flow), averaged over
  // three fiscal years: a company spending heavily on growth capex (TSM, the hyperscalers)
  // still has real cash earnings. FCF/NI is recorded on every row for review but is not a gate.

  // Growth score weights (percentile ranks across the eligible pool).
  weights: { fwdEps: 0.40, fwdRev: 0.25, trailEps: 0.20, revisions: 0.15 },

  // Valuation caps — entry only, except P/S which removes an incumbent at 1.25x the cap.
  maxPS: 20,
  maxPE: 60,
  maxPEG: 3.0,
  incumbentPSBuffer: 1.25,

  // Removal / Watch thresholds.
  revisionCutRemove: -0.05,  // next-FY EPS consensus down more than 5% vs ~60 days ago → Removed
  revisionCutWatch: -0.02,   // down 2–5% → Watch
  revisionLookbackDays: 60,
  gateStrikesToRemove: 2,    // consecutive runs failing the quality gate
  drawdownWatch: -0.25,      // 25%+ below 52-week high → Watch (information, never a removal)
  historyWeeks: 30,          // estimate history kept per ticker in the JSON
};

const SECTORS = [
  "Technology",
  "Communication Services",
  "Healthcare",
  "Financial Services",
  "Industrials",
  "Energy",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Basic Materials",
  "Real Estate",
  "Utilities",
];

// AI watchlist. Every one of these also competes for a core slot in its own sector; the
// sleeve holds the watchlist names that did NOT make core. Same gate, same growth score.
const AI_WATCHLIST = [
  "NVDA", "AVGO", "AMD", "TSM", "MU", "MRVL", "ANET", "VRT", "DELL", "SMCI",
  "AMAT", "LRCX", "KLAC", "TER", "ONTO", "COHR", "CIEN", "CRDO", "ALAB",
  "PLTR", "SNPS", "CDNS", "CRWV", "NBIS", "ORCL", "ARM", "ASML", "MPWR",
];

const ALLOWED_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "NYSE ARCA"]);
const TICKER_EXCEPTIONS = new Set(["BRK-B", "BF-B"]);

// ── HTTP helpers ───────────────────────────────────────────────
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

const fmp = (path, params = {}) => {
  const u = new URL(`https://financialmodelingprep.com/stable/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  u.searchParams.set("apikey", FMP_KEY);
  return getJSON(u.toString(), { label: `${path} ${params.symbol || params.sector || ""}` });
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
const pctStr = (x, d = 0) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;

// ── Step 1: universe ───────────────────────────────────────────
async function buildUniverse(incumbents = []) {
  const universe = new Map();
  for (const sector of SECTORS) {
    const rows = await fmp("company-screener", {
      marketCapMoreThan: CFG.minMarketCap,
      sector,
      country: "US",
      isEtf: "false",
      isFund: "false",
      isActivelyTrading: "true",
      limit: 100,
    });
    const clean = (rows || [])
      .filter((r) => r.symbol && (TICKER_EXCEPTIONS.has(r.symbol) || !/[-.]/.test(r.symbol)))
      .filter((r) => !r.exchangeShortName || ALLOWED_EXCHANGES.has(String(r.exchangeShortName).toUpperCase()))
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .slice(0, sector === "Technology" ? CFG.candidatesPerSector * 2 : CFG.candidatesPerSector);
    for (const r of clean) {
      universe.set(r.symbol, { ticker: r.symbol, name: r.companyName || r.symbol, sector, marketCap: r.marketCap || null, sleeve: "core" });
    }
    console.log(`universe: ${sector} → ${clean.length}`);
    await sleep(250);
  }
  const addByProfile = async (t, aiWatch) => {
    if (universe.has(t)) { if (aiWatch) universe.get(t).aiWatch = true; return; }
    const p = first(await fmp("profile", { symbol: t }));
    if (!p) return;
    universe.set(t, { ticker: t, name: p.companyName || t, sector: p.sector || "Technology", marketCap: p.marketCap || p.mktCap || null, sleeve: "core", aiWatch });
    await sleep(250);
  };
  for (const t of AI_WATCHLIST) await addByProfile(t, true);
  for (const t of incumbents) await addByProfile(t, AI_WATCHLIST.includes(t));
  // Dual share classes (GOOG/GOOGL, FOX/FOXA): keep one ticker per company.
  const byName = new Map();
  for (const c of universe.values()) {
    const key = (c.name || c.ticker).toLowerCase().replace(/[^a-z]/g, "").slice(0, 12);
    const held = byName.get(key);
    if (!held || (c.marketCap || 0) > (held.marketCap || 0) || (c.ticker.length > held.ticker.length)) {
      if (held) universe.delete(held.ticker);
      byName.set(key, c);
    } else {
      universe.delete(c.ticker);
    }
  }
  return universe;
}

// ── Steps 2–5: fundamentals, estimates, price from FMP ─────────
async function enrich(c) {
  const [km, ratios, inc, cf, est, grades, earnings, quote] = await Promise.all([
    fmp("key-metrics-ttm", { symbol: c.ticker }),
    fmp("ratios-ttm", { symbol: c.ticker }),
    fmp("income-statement", { symbol: c.ticker, period: "annual", limit: 4 }),
    fmp("cash-flow-statement", { symbol: c.ticker, period: "annual", limit: 3 }),
    fmp("analyst-estimates", { symbol: c.ticker, period: "annual", limit: 8 }),
    fmp("grades", { symbol: c.ticker, limit: 60 }),
    fmp("earnings", { symbol: c.ticker, limit: 10 }),
    fmp("quote", { symbol: c.ticker }),
  ]);
  const k = first(km), r = first(ratios), q = first(quote);

  // Quality inputs
  c.roic = pick(k, ["returnOnInvestedCapitalTTM", "roicTTM"]);
  c.roe = pick(k, ["returnOnEquityTTM", "roeTTM"]) ?? pick(r, ["returnOnEquityTTM"]);
  c.opMargin = pick(r, ["operatingProfitMarginTTM", "operatingMarginTTM"]);
  c.netMargin = pick(r, ["netProfitMarginTTM", "netMarginTTM"]);
  c.cashConvTtm = pick(k, ["incomeQualityTTM"]);                  // operating cash flow / net income, trailing 12 months
  c.netDebtEbitda = pick(k, ["netDebtToEBITDATTM"]);
  c.pe = pick(r, ["priceToEarningsRatioTTM", "peRatioTTM"]);
  c.ps = pick(r, ["priceToSalesRatioTTM", "priceSalesRatioTTM"]);

  // Annual statements, newest first
  const years = (Array.isArray(inc) ? inc : []).filter((y) => y.revenue != null).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const fy0 = years[0] || null;
  c.lastFyDate = fy0?.date || null;
  const opm = (y) => (y && y.revenue > 0 && y.operatingIncome != null ? y.operatingIncome / y.revenue : null);
  c.opMarginChange2y = opm(fy0) != null && opm(years[2]) != null ? opm(fy0) - opm(years[2]) : null;
  c.epsFy0 = num(fy0?.epsDiluted ?? fy0?.eps);
  c.trailEpsGrowth = years.length >= 4 ? cagr(num(years[0].epsDiluted ?? years[0].eps), num(years[3].epsDiluted ?? years[3].eps), 3) : null;
  c.trailRevGrowth = years.length >= 4 ? cagr(num(years[0].revenue), num(years[3].revenue), 3) : null;

  const cfs = (Array.isArray(cf) ? cf : []).filter((y) => y.netIncome != null);
  const niSum = cfs.reduce((a, y) => a + num(y.netIncome), 0);
  const fcfSum = cfs.reduce((a, y) => a + (num(y.freeCashFlow) ?? 0), 0);
  c.fcfToNi = cfs.length && niSum > 0 ? fcfSum / niSum : null;
  const ocfSum = cfs.reduce((a, y) => a + (num(y.operatingCashFlow ?? y.netCashProvidedByOperatingActivities) ?? 0), 0);
  // 3-year average, so one year of receivables build (NVDA, GOOG in 2025) doesn't fail a great business.
  c.cashConv = cfs.length && niSum > 0 ? ocfSum / niSum : c.cashConvTtm;

  // Forward consensus: the two fiscal years after the last reported one.
  const fwd = (Array.isArray(est) ? est : [])
    .filter((e) => c.lastFyDate && String(e.date) > c.lastFyDate && num(e.epsAvg) != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const fy1 = fwd[0] || null, fy2 = fwd[1] || null;
  c.epsFy1 = num(fy1?.epsAvg);
  c.epsFy2 = num(fy2?.epsAvg);
  c.revFy2 = num(fy2?.revenueAvg);
  c.fy1Label = fy1 ? String(fy1.date).slice(0, 4) : null;
  c.analysts = num(fy1?.numAnalystsEps);
  c.fwdEpsGrowth = fy2 ? cagr(c.epsFy2, c.epsFy0, 2) : fy1 ? cagr(c.epsFy1, c.epsFy0, 1) : null;
  c.fwdRevGrowth = fy2 ? cagr(c.revFy2, num(fy0?.revenue), 2) : fy1 ? cagr(num(fy1.revenueAvg), num(fy0?.revenue), 1) : null;
  c.peg = c.pe != null && c.pe > 0 && c.fwdEpsGrowth != null && c.fwdEpsGrowth > 0 ? c.pe / (c.fwdEpsGrowth * 100) : null;

  // Analyst grades, last 60 days
  const cutoff = Date.now() - 60 * 86_400_000;
  let up = 0, down = 0;
  for (const g of Array.isArray(grades) ? grades : []) {
    if (new Date(g.date).getTime() < cutoff) continue;
    const a = String(g.action || "").toLowerCase();
    if (a.includes("upgrade")) up++;
    else if (a.includes("downgrade")) down++;
  }
  c.upgrades = up;
  c.downgrades = down;

  // Earnings: next date, last two surprises
  const today = new Date().toISOString().slice(0, 10);
  const rows = (Array.isArray(earnings) ? earnings : []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const next = rows.filter((e) => e.date >= today && e.epsActual == null).sort((a, b) => a.date.localeCompare(b.date))[0];
  const reported = rows.filter((e) => e.epsActual != null && e.epsEstimated != null && e.date < today);
  const surprise = (e) => (num(e.epsActual) - num(e.epsEstimated)) / Math.max(Math.abs(num(e.epsEstimated)), 0.01);
  c.nextEarnings = next?.date || null;
  c.lastSurprise = reported[0] ? surprise(reported[0]) : null;
  c.prevSurprise = reported[1] ? surprise(reported[1]) : null;
  c.lastEarningsDate = reported[0]?.date || null;

  // Price (FMP quote; intraday on the plan, final by the Sunday run)
  c.price = num(q?.price);
  c.yearHigh = num(q?.yearHigh);
  c.vsHigh = c.price != null && c.yearHigh ? c.price / c.yearHigh - 1 : null;
  c.priceDate = q?.timestamp ? new Date(q.timestamp * 1000).toISOString().slice(0, 10) : today;
  if (c.marketCap == null) c.marketCap = num(q?.marketCap);
  // 52-week return: FMP quote-change if available, else carried from last week.
  const chg = first(await fmp("stock-price-change", { symbol: c.ticker }));
  c.ret52w = chg && num(chg["1Y"]) != null ? num(chg["1Y"]) / 100 : null;
}

// Estimate revisions: this run's next-FY consensus vs the value this file recorded ~60 days ago.
function revisionFromHistory(c, history) {
  const h = (history[c.ticker] || []).filter((x) => x.fy === c.fy1Label && x.eps != null);
  if (!h.length || c.epsFy1 == null) return null;
  const target = Date.now() - CFG.revisionLookbackDays * 86_400_000;
  const base = h.slice().sort((a, b) => Math.abs(new Date(a.date) - target) - Math.abs(new Date(b.date) - target))[0];
  const ageDays = (Date.now() - new Date(base.date)) / 86_400_000;
  if (ageDays < 21) return null;                       // not enough history yet to call it a revision
  if (!(Math.abs(base.eps) > 0.05)) return null;
  return { pct: c.epsFy1 / base.eps - 1, days: Math.round(ageDays) };
}

// ── Quality gate ───────────────────────────────────────────────
function qualityCheck(c) {
  const q = { ...CFG.quality.default, ...(CFG.quality[c.sector] || {}) };
  const p = (x) => `${(x * 100).toFixed(1)}%`;
  if (q.minRoic != null && c.roic != null && c.roic < q.minRoic) return `ROIC ${p(c.roic)} below ${p(q.minRoic)}`;
  if (q.minRoe != null && c.roe != null && c.roe < q.minRoe) return `ROE ${p(c.roe)} below ${p(q.minRoe)}`;
  if (q.minOpMargin != null && c.opMargin != null && c.opMargin < q.minOpMargin) return `operating margin ${p(c.opMargin)} below ${p(q.minOpMargin)}`;
  if (q.maxMarginDrop != null && c.opMarginChange2y != null && c.opMarginChange2y < -q.maxMarginDrop) return `operating margin down ${(Math.abs(c.opMarginChange2y) * 100).toFixed(1)} pts over 2 years`;
  if (q.minCashConv != null && c.cashConv != null && c.cashConv < q.minCashConv) return `cash conversion ${p(c.cashConv)} of net income, below ${p(q.minCashConv)}`;
  if (q.maxNetDebtEbitda != null && c.netDebtEbitda != null && c.netDebtEbitda > q.maxNetDebtEbitda) return `net debt ${c.netDebtEbitda.toFixed(1)}x EBITDA, above ${q.maxNetDebtEbitda}x`;
  if (c.epsFy0 != null && c.epsFy0 <= 0) return "no positive earnings in the last fiscal year";
  return null;
}

function valuationCheck(c, incumbent) {
  if (c.ps != null && c.ps > CFG.maxPS * (incumbent ? CFG.incumbentPSBuffer : 1)) return `price/sales ${c.ps.toFixed(1)} above ${CFG.maxPS}`;
  if (incumbent) return null;
  if (c.pe != null && (c.pe <= 0 || c.pe > CFG.maxPE)) return `trailing P/E ${c.pe.toFixed(0)} outside 0–${CFG.maxPE}`;
  if (c.peg != null && c.peg > CFG.maxPEG) return `PEG ${c.peg.toFixed(1)} above ${CFG.maxPEG}`;
  if (c.fwdEpsGrowth == null && c.trailEpsGrowth == null) return "no growth data";
  return null;
}

// Fundamental removal triggers for incumbents.
function removalCheck(c, prevRow) {
  const strikes = (prevRow?.gateStrikes || 0) + (c.qualityFail ? 1 : 0);
  if (c.qualityFail && strikes >= CFG.gateStrikesToRemove) return `${c.qualityFail} (${strikes} runs in a row)`;
  if (c.revision && c.revision.pct <= CFG.revisionCutRemove) return `${c.fy1Label} EPS consensus cut ${pctStr(c.revision.pct, 1)} over ${c.revision.days} days`;
  if (c.lastSurprise != null && c.lastSurprise < 0 && c.prevSurprise != null && c.prevSurprise < 0) return `missed earnings two quarters running (${pctStr(c.lastSurprise)}, ${pctStr(c.prevSurprise)})`;
  const v = valuationCheck(c, true);
  if (v) return v;
  return null;
}

// ── Growth score ───────────────────────────────────────────────
function assignScores(pool) {
  const clamp = (x, lo, hi) => (x == null ? null : Math.max(lo, Math.min(hi, x)));
  const pctRank = (key) => {
    const vals = pool.map(key).filter((v) => v != null).sort((a, b) => a - b);
    return (v) => (v == null || vals.length === 0 ? 0.4 : vals.filter((x) => x <= v).length / vals.length);
  };
  const kFwdEps = (c) => clamp(c.fwdEpsGrowth, -0.3, 0.8);
  const kFwdRev = (c) => clamp(c.fwdRevGrowth, -0.2, 0.6);
  const kTrail = (c) => clamp(c.trailEpsGrowth, -0.3, 0.8);
  const kRev = (c) => (c.revision ? clamp(c.revision.pct, -0.15, 0.15) * 10 : 0) + (c.upgrades - c.downgrades) * 0.25 + (c.lastSurprise != null ? Math.sign(c.lastSurprise) * 0.25 : 0);
  const rFwdEps = pctRank(kFwdEps), rFwdRev = pctRank(kFwdRev), rTrail = pctRank(kTrail), rRev = pctRank(kRev);
  const w = CFG.weights;
  for (const c of pool) {
    c.score = 100 * (w.fwdEps * rFwdEps(kFwdEps(c)) + w.fwdRev * rFwdRev(kFwdRev(c)) + w.trailEps * rTrail(kTrail(c)) + w.revisions * rRev(kRev(c)));
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const prev = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : { holdings: [], removed: [] };
  const prevRows = new Map((prev.holdings || []).map((h) => [h.ticker, h]));
  const history = prev.estimateHistory || {};

  console.log("Step 1: universe");
  const universe = await buildUniverse([...prevRows.keys()]);
  const cands = [...universe.values()];
  console.log(`  ${cands.length} candidates`);

  console.log("Steps 2–5: fundamentals, estimates, price (FMP)");
  for (const c of cands) {
    await enrich(c);
    c.revision = revisionFromHistory(c, history);
    c.qualityFail = qualityCheck(c);
    const incumbent = prevRows.has(c.ticker);
    c.valuationFail = valuationCheck(c, incumbent);
    c.removeReason = incumbent ? removalCheck(c, prevRows.get(c.ticker)) : null;
    c.gateStrikes = c.qualityFail ? (prevRows.get(c.ticker)?.gateStrikes || 0) + 1 : 0;
    await sleep(150);
  }
  // Eligible: new names must clear the gate and the valuation caps; incumbents stay unless a removal trigger fires.
  const eligible = cands.filter((c) => (prevRows.has(c.ticker) ? !c.removeReason : !c.qualityFail && !c.valuationFail));
  console.log(`  ${eligible.length} eligible (${cands.filter((c) => c.qualityFail).length} fail the quality gate)`);

  console.log("Step 6: select");
  assignScores(eligible);
  const isIncumbent = (c) => prevRows.has(c.ticker);
  const prevSleeve = new Map((prev.holdings || []).map((h) => [h.ticker, h.sleeve]));
  let swapsLeft = CFG.maxSwapsPerWeek;
  const swapped = [];
  const byScore = (a, b) => (b.score - a.score) || ((b.ret52w ?? 0) - (a.ret52w ?? 0)); // 52-week return is the tiebreak only

  function fill(pool, slots) {
    const ranked = [...pool].sort(byScore);
    const keep = ranked.filter(isIncumbent);
    const challengers = ranked.filter((c) => !isIncumbent(c));
    const out = [...keep];
    while (out.length < slots && challengers.length) out.push(challengers.shift());
    for (const ch of challengers) {
      if (swapsLeft <= 0) break;
      const weakest = out.filter(isIncumbent).sort((a, b) => a.score - b.score)[0];
      if (!weakest || ch.score < weakest.score + CFG.incumbentBonus) break;
      out.splice(out.indexOf(weakest), 1, ch);
      swapped.push({ ticker: weakest.ticker, by: ch.ticker, gap: ch.score - weakest.score });
      swapsLeft--;
    }
    return out;
  }

  const chosen = [];
  const sectorsEmpty = [];
  for (const sector of SECTORS) {
    const pool = eligible.filter((c) => c.sector === sector && prevSleeve.get(c.ticker) !== "ai");
    const take = fill(pool, CFG.slots[sector] ?? 2);
    if (take.length === 0) sectorsEmpty.push(sector);
    take.forEach((c) => { c.sleeve = "core"; });
    chosen.push(...take);
  }
  const coreSet = new Set(chosen.map((c) => c.ticker));
  const aiPool = eligible.filter((c) => c.aiWatch && !coreSet.has(c.ticker));
  const ai = fill(aiPool, CFG.maxAiSleeve);
  ai.forEach((c) => { c.sleeve = "ai"; });
  chosen.push(...ai);
  if (chosen.length < CFG.minTotal) {
    const have = new Set(chosen.map((c) => c.ticker));
    const bench = eligible.filter((c) => !have.has(c.ticker)).sort(byScore);
    while (chosen.length < CFG.minTotal && bench.length) { const c = bench.shift(); c.sleeve = "core"; c.backfilled = true; chosen.push(c); }
  }
  while (chosen.length > CFG.maxTotal) {
    const idx = chosen.map((c, i) => [c, i]).filter(([c]) => !isIncumbent(c)).sort((a, b) => a[0].score - b[0].score)[0];
    if (!idx) break;
    chosen.splice(idx[1], 1);
  }
  const chosenSet = new Set(chosen.map((c) => c.ticker));
  console.log(`  ${chosen.length} selected, ${swapped.length} score-based swap(s) (cap ${CFG.maxSwapsPerWeek})`);

  console.log("Step 7: diff and tag");
  const tagFor = (c) => {
    const reasons = [];
    const flags = [];
    const isNew = !prevRows.has(c.ticker);
    if (isNew) reasons.push(c.backfilled ? "added to keep the list at 42+ names" : "added by screen");
    if (c.qualityFail) flags.push(`${c.qualityFail}; removed if it fails again next run`);
    if (c.revision && c.revision.pct <= CFG.revisionCutWatch && c.revision.pct > CFG.revisionCutRemove) flags.push(`${c.fy1Label} EPS consensus trimmed ${pctStr(c.revision.pct, 1)} over ${c.revision.days} days`);
    if (c.lastSurprise != null && c.lastSurprise < 0) flags.push(`missed last earnings by ${(Math.abs(c.lastSurprise) * 100).toFixed(0)}%; a second miss removes it`);
    if (c.vsHigh != null && c.vsHigh <= CFG.drawdownWatch) flags.push(`${(Math.abs(c.vsHigh) * 100).toFixed(0)}% below its 52-week high (price only, not a removal trigger)`);
    if (c.nextEarnings) { const d = (new Date(c.nextEarnings) - Date.now()) / 86_400_000; if (d >= 0 && d <= 10) reasons.push(`reports ${c.nextEarnings}`); }
    const tag = isNew ? "New" : flags.length ? "Watch" : "Hold";
    reasons.push(...flags);
    if (!flags.length) {
      const bits = [];
      if (c.fwdEpsGrowth != null) bits.push(`EPS growth ${pctStr(c.fwdEpsGrowth)}/yr expected through ${c.fy1Label ? Number(c.fy1Label) + (c.epsFy2 != null ? 1 : 0) : "next FY"}`);
      if (c.fwdRevGrowth != null) bits.push(`revenue ${pctStr(c.fwdRevGrowth)}/yr`);
      if (c.roic != null) bits.push(`ROIC ${(c.roic * 100).toFixed(0)}%`);
      else if (c.roe != null) bits.push(`ROE ${(c.roe * 100).toFixed(0)}%`);
      if (c.revision) bits.push(`estimates ${pctStr(c.revision.pct, 1)} in ${c.revision.days}d`);
      if (bits.length) reasons.push(bits.join("; "));
    }
    return { tag, reason: reasons.join(". ") };
  };

  const toRow = (c, tag, reason) => ({
    ticker: c.ticker,
    name: c.name,
    sector: c.sector,
    sleeve: c.sleeve,
    zacksRank: prevRows.get(c.ticker)?.zacksRank ?? null, // Zacks isn't automatable; carried from the last chat review, if any
    price: fmt2(c.price),
    ret52w: fmtPct(c.ret52w) ?? prevRows.get(c.ticker)?.ret52w ?? null,
    vsHigh: fmtPct(c.vsHigh),
    fwdEpsGrowth: fmtPct(c.fwdEpsGrowth),
    fwdRevGrowth: fmtPct(c.fwdRevGrowth),
    trailEpsGrowth: fmtPct(c.trailEpsGrowth),
    epsFy1: fmt2(c.epsFy1),
    fy1: c.fy1Label,
    revision: c.revision ? fmtPct(c.revision.pct) : null,
    roic: fmtPct(c.roic),
    roe: fmtPct(c.roe),
    opMargin: fmtPct(c.opMargin),
    netMargin: fmtPct(c.netMargin),
    cashConv: fmtPct(c.cashConv),
    fcfToNi: fmtPct(c.fcfToNi),
    netDebtEbitda: fmt1(c.netDebtEbitda),
    pe: fmt1(c.pe),
    ps: fmt1(c.ps),
    peg: fmt1(c.peg),
    upgrades: c.upgrades,
    downgrades: c.downgrades,
    lastSurprise: fmtPct(c.lastSurprise),
    gateStrikes: c.gateStrikes || 0,
    score: Number.isFinite(c.score) ? fmt1(c.score) : null,
    tag,
    reason,
    nextEarnings: c.nextEarnings,
  });

  const holdings = chosen.map((c) => { const { tag, reason } = tagFor(c); return toRow(c, tag, reason); });

  const removed = [];
  for (const h of prev.holdings || []) {
    if (chosenSet.has(h.ticker)) continue;
    const c = universe.get(h.ticker);
    let reason = "no longer in screen universe";
    if (c) {
      const sw = swapped.find((s) => s.ticker === h.ticker);
      reason = c.removeReason || (sw ? `replaced by ${sw.by}, which outscored it by ${sw.gap.toFixed(0)} points` : "trimmed at the 50-name ceiling");
    }
    removed.push({ ...toRow(c || h, "Removed", reason), zacksRank: h.zacksRank ?? null });
  }

  // Estimate history: record this run's next-FY consensus for every candidate so future runs can measure revisions.
  const today = new Date().toISOString().slice(0, 10);
  const nextHistory = {};
  const keepSince = new Date(Date.now() - CFG.historyWeeks * 7 * 86_400_000).toISOString().slice(0, 10);
  for (const c of cands) {
    const old = (history[c.ticker] || []).filter((x) => x.date >= keepSince && x.date !== today);
    const entry = c.epsFy1 != null ? [{ date: today, fy: c.fy1Label, eps: fmt2(c.epsFy1) }] : [];
    if (old.length || entry.length) nextHistory[c.ticker] = [...old, ...entry];
  }

  const priceDate = chosen.map((c) => c.priceDate).filter(Boolean).sort().pop() || null;
  const q = CFG.quality.default;
  const out = {
    asOf: today,
    generatedBy: "scripts/screen.mjs (FMP, quality + growth)",
    priceDate,
    rules: {
      universe: `US stocks over $${CFG.minMarketCap / 1e9}B by sector (FMP screener), top ${CFG.candidatesPerSector} per sector by market cap, plus an AI watchlist; current holdings always re-screened`,
      quality: `gate: ROIC ≥ ${q.minRoic * 100}% (financials ROE ≥ 12%), operating margin ≥ ${q.minOpMargin * 100}% and not down more than ${q.maxMarginDrop * 100} pts over 2 years, 3-yr operating cash flow ≥ ${q.minCashConv * 100}% of net income, net debt ≤ ${q.maxNetDebtEbitda}x EBITDA; relaxed for financials, REITs, utilities and thin-margin sectors`,
      growth: `score = percentile ranks: ${CFG.weights.fwdEps * 100}% forward 2-yr EPS growth, ${CFG.weights.fwdRev * 100}% forward revenue growth, ${CFG.weights.trailEps * 100}% trailing 3-yr EPS growth, ${CFG.weights.revisions * 100}% estimate revisions and analyst grades`,
      valuation: `new entrants need price/sales ≤ ${CFG.maxPS}, trailing P/E between 0 and ${CFG.maxPE}, PEG ≤ ${CFG.maxPEG}; a holding leaves only if price/sales passes ${CFG.maxPS * CFG.incumbentPSBuffer}`,
      removal: `fundamental only: next-FY EPS consensus cut more than ${Math.abs(CFG.revisionCutRemove) * 100}% in ~${CFG.revisionLookbackDays} days, two straight earnings misses, or failing the quality gate ${CFG.gateStrikesToRemove} runs in a row; no price-based removals`,
      watch: `one earnings miss, an estimate trim of ${Math.abs(CFG.revisionCutWatch) * 100}–${Math.abs(CFG.revisionCutRemove) * 100}%, one quality-gate strike, or a price ${Math.abs(CFG.drawdownWatch) * 100}%+ below the 52-week high (information only)`,
      sizing: `sector slots weighted like the S&P (tech ${CFG.slots.Technology}, financials ${CFG.slots["Financial Services"]}, others 2–4) plus up to ${CFG.maxAiSleeve} AI-watchlist names not already in core, screened on the same rules; sectors are left empty if nothing passes`,
      stability: `${CFG.minTotal}–${CFG.maxTotal} names; a holding leaves only on a removal trigger or, at most ${CFG.maxSwapsPerWeek} times a week, when a challenger outscores it by ${CFG.incumbentBonus}+ points; 52-week return breaks ties only`,
    },
    sectorsEmpty,
    holdings,
    removed,
    estimateHistory: nextHistory,
  };

  const json = JSON.stringify(out, null, 2);
  if (process.env.DRY_RUN) { console.log(json); return; }
  writeFileSync(OUT_PATH, json + "\n");
  console.log(`\nWrote ${holdings.length} holdings, ${removed.length} removed → ${OUT_PATH}`);
  console.log(`New: ${holdings.filter((h) => h.tag === "New").map((h) => h.ticker).join(", ") || "none"}`);
  console.log(`Watch: ${holdings.filter((h) => h.tag === "Watch").map((h) => h.ticker).join(", ") || "none"}`);
  console.log(`Removed: ${removed.map((h) => `${h.ticker} (${h.reason})`).join("; ") || "none"}`);
  if (sectorsEmpty.length) console.log(`Empty sectors: ${sectorsEmpty.join(", ")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
