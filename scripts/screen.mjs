#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   WEEKLY IDEAS SCREEN
   Rebuilds src/data/weekly-ideas.json from live data.

   Pipeline
     1. Universe  — FMP company screener: US stocks over $25B, by sector,
                    plus a fixed AI watchlist.
     2. Quality   — FMP ratios (ROE, net margin, debt/equity), sector-aware.
     3. Revisions — FMP analyst grades: net upgrades vs downgrades, 45 days.
     4. Earnings  — FMP earnings history: last surprise + next report date.
     5. Momentum  — Twelve Data daily closes: price vs 200-day SMA,
                    52-week and 12-week change. Paced for the free tier.
     6. Select    — up to 4 per sector, up to 12 in the AI sleeve,
                    incumbents get a turnover buffer, sectors left empty
                    if nothing passes.
     7. Diff      — tags every name New / Hold / Watch / Removed against
                    last week's file.

   Env
     FMP_API_KEY            required
     TWELVE_DATA_API_KEY    required
     TD_CALLS_PER_MIN       optional, default 8 (free tier)
     SCREEN_LIMIT           optional, cap names per sector for test runs
     DRY_RUN=1              optional, print JSON instead of writing it

   Run:  node scripts/screen.mjs
──────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/weekly-ideas.json");

const FMP_KEY = process.env.FMP_API_KEY;
const TD_KEY = process.env.TWELVE_DATA_API_KEY;
if (!FMP_KEY || !TD_KEY) {
  console.error("Missing FMP_API_KEY or TWELVE_DATA_API_KEY.");
  process.exit(1);
}

// ── Configuration ──────────────────────────────────────────────
const CFG = {
  minMarketCap: 25_000_000_000,
  candidatesPerSector: Number(process.env.SCREEN_LIMIT) || 15, // by market cap, before momentum check (tech gets 2x)
  // Slots per sector, weighted roughly like the S&P 500 so tech carries its real weight.
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
  coreMaxPE: 60,               // valuation guardrail for core only; the AI sleeve is exempt
  tdCallsPerMin: Number(process.env.TD_CALLS_PER_MIN) || 8,
  gradeWindowDays: 45,
  momentumWatchBand: -0.05,   // between -5% and 0% below the 200-day → Watch
  incumbentBonus: 10,          // score bonus so a holding isn't swapped for a marginal upgrade
  quality: {
    default: { minRoe: 0.12, minMargin: 0.08, maxDebtEq: 3.0 },
    "Financial Services": { minRoe: 0.08 },
    "Real Estate": {},
    Utilities: { minRoe: 0.07 },
    Energy: { minRoe: 0.10, minMargin: 0.06, maxDebtEq: 1.5 },
    Healthcare: { minRoe: 0.12, minMargin: 0.03, maxDebtEq: 3.0 },        // managed care runs 3–5% margins
    "Consumer Cyclical": { minRoe: 0.12, minMargin: 0.04, maxDebtEq: 3.0 },
    "Consumer Defensive": { minRoe: 0.12, minMargin: 0.02, maxDebtEq: 3.0 }, // retailers run 2–4%
    Industrials: { minRoe: 0.12, minMargin: 0.06, maxDebtEq: 3.0 },
    Technology: { minRoe: 0.12, minMargin: 0.06, maxDebtEq: 3.0 },         // hardware/servers run thinner than software
  },
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

// AI momentum watchlist. Every one of these also competes for a core slot in its own
// sector on quality; the sleeve only holds names that did NOT make core, so a megacap
// like NVDA or AVGO lands in core tech and the sleeve stays the pure momentum bucket.
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

// Twelve Data pacing: spread calls evenly under the per-minute cap.
let lastTdCall = 0;
async function twelve(path, params = {}) {
  const gap = Math.ceil(60_000 / CFG.tdCallsPerMin) + 200;
  const wait = lastTdCall + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastTdCall = Date.now();
  const u = new URL(`https://api.twelvedata.com/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  u.searchParams.set("apikey", TD_KEY);
  return getJSON(u.toString(), { label: `td ${path} ${params.symbol}` });
}

// Field names differ slightly across FMP versions; take the first that exists.
const pick = (obj, keys) => {
  if (!obj) return null;
  for (const k of keys) if (obj[k] != null && obj[k] !== "") return Number(obj[k]);
  return null;
};

// ── Step 1: universe ───────────────────────────────────────────
async function buildUniverse() {
  const universe = new Map(); // ticker → { ticker, name, sector, marketCap }
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
  // AI watchlist: fetch profiles for anything the screener didn't return.
  for (const t of AI_WATCHLIST) {
    if (universe.has(t)) { universe.get(t).aiWatch = true; continue; }
    const prof = await fmp("profile", { symbol: t });
    const p = Array.isArray(prof) ? prof[0] : prof;
    if (!p) continue;
    universe.set(t, { ticker: t, name: p.companyName || t, sector: p.sector || "Technology", marketCap: p.marketCap || p.mktCap || null, sleeve: "core", aiWatch: true });
    await sleep(250);
  }
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

// ── Steps 2–4: fundamentals from FMP ───────────────────────────
async function enrichFundamentals(c) {
  const [ratios, grades, earnings] = await Promise.all([
    fmp("ratios-ttm", { symbol: c.ticker }),
    fmp("grades", { symbol: c.ticker, limit: 60 }),
    fmp("earnings", { symbol: c.ticker, limit: 8 }),
  ]);
  const r = Array.isArray(ratios) ? ratios[0] : ratios;
  c.roe = pick(r, ["returnOnEquityTTM", "returnOnEquity"]);
  c.margin = pick(r, ["netProfitMarginTTM", "netProfitMargin"]);
  c.debtEq = pick(r, ["debtToEquityRatioTTM", "debtEquityRatioTTM", "debtToEquity"]);
  c.pe = pick(r, ["priceToEarningsRatioTTM", "peRatioTTM", "priceEarningsRatioTTM"]);

  const cutoff = Date.now() - CFG.gradeWindowDays * 86_400_000;
  let up = 0, down = 0;
  for (const g of Array.isArray(grades) ? grades : []) {
    if (new Date(g.date).getTime() < cutoff) continue;
    const a = String(g.action || "").toLowerCase();
    if (a.includes("upgrade")) up++;
    else if (a.includes("downgrade")) down++;
  }
  c.upgrades = up;
  c.downgrades = down;

  const today = new Date().toISOString().slice(0, 10);
  const rows = (Array.isArray(earnings) ? earnings : []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const next = rows.filter((e) => e.date >= today && e.epsActual == null).sort((a, b) => a.date.localeCompare(b.date))[0];
  const last = rows.find((e) => e.epsActual != null && e.date < today);
  c.nextEarnings = next?.date || null;
  c.lastSurprise = last && last.epsEstimated != null ? (Number(last.epsActual) - Number(last.epsEstimated)) / Math.max(Math.abs(Number(last.epsEstimated)), 0.01) : null;
  c.lastEarningsDate = last?.date || null;
}

function qualityCheck(c) {
  const q = { ...CFG.quality.default, ...(CFG.quality[c.sector] || {}) };
  if (CFG.quality[c.sector] && !("minMargin" in CFG.quality[c.sector])) delete q.minMargin;
  if (CFG.quality[c.sector] && !("maxDebtEq" in CFG.quality[c.sector])) delete q.maxDebtEq;
  if (c.sector === "Real Estate") { delete q.minRoe; delete q.minMargin; delete q.maxDebtEq; }
  if (q.minRoe != null && c.roe != null && c.roe < q.minRoe) return `ROE ${(c.roe * 100).toFixed(0)}% below ${(q.minRoe * 100).toFixed(0)}%`;
  if (q.minMargin != null && c.margin != null && c.margin < q.minMargin) return `net margin ${(c.margin * 100).toFixed(0)}% below ${(q.minMargin * 100).toFixed(0)}%`;
  if (q.maxDebtEq != null && c.debtEq != null && c.debtEq > q.maxDebtEq) return `debt/equity ${c.debtEq.toFixed(1)} above ${q.maxDebtEq}`;
  return null;
}

function revisionCheck(c) {
  if (c.downgrades - c.upgrades >= 2) return `${c.downgrades} downgrades vs ${c.upgrades} upgrades in ${CFG.gradeWindowDays} days`;
  return null;
}

// ── Step 5: momentum from Twelve Data ──────────────────────────
async function enrichMomentum(c) {
  const data = await twelve("time_series", { symbol: c.ticker, interval: "1day", outputsize: 260 });
  const vals = data?.values;
  if (!Array.isArray(vals) || vals.length < 200) { c.momentumMissing = true; return; }
  const closes = vals.map((v) => Number(v.close));
  c.price = closes[0];
  c.priceDate = vals[0].datetime;
  c.sma200 = closes.slice(0, 200).reduce((a, b) => a + b, 0) / 200;
  c.vs200 = c.price / c.sma200 - 1;
  c.ret52w = closes.length > 251 ? c.price / closes[251] - 1 : c.price / closes[closes.length - 1] - 1;
  c.ret12w = closes.length > 60 ? c.price / closes[60] - 1 : null;
}

function momentumCheck(c, prevTag) {
  if (c.momentumMissing) return "no price history";
  if (c.vs200 < CFG.momentumWatchBand) return `${(c.vs200 * 100).toFixed(1)}% below 200-day`;
  if (c.vs200 < 0 && prevTag === "Watch") return `below 200-day for a second week (${(c.vs200 * 100).toFixed(1)}%)`;
  return null;
}

// Percentile-rank scoring across the pool, so one extreme mover can't dominate.
function assignScores(pool) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x ?? 0));
  const pctRank = (key) => {
    const vals = pool.map(key).filter((v) => v != null).sort((a, b) => a - b);
    return (v) => (v == null || vals.length === 0 ? 0.5 : vals.filter((x) => x <= v).length / vals.length);
  };
  const rRoe = pctRank((c) => c.roe);
  const rMargin = pctRank((c) => c.margin);
  const rSize = pctRank((c) => (c.marketCap ? Math.log(c.marketCap) : null));
  const rTrend = pctRank((c) => clamp(c.ret52w, -0.5, 0.6));
  const rRev = pctRank((c) => (c.upgrades - c.downgrades) + (c.lastSurprise != null ? Math.sign(c.lastSurprise) : 0));
  for (const c of pool) {
    const quality = (rRoe(c.roe) + rMargin(c.margin) + rSize(c.marketCap ? Math.log(c.marketCap) : null)) / 3;
    const trend = rTrend(clamp(c.ret52w, -0.5, 0.6));
    const revisions = rRev((c.upgrades - c.downgrades) + (c.lastSurprise != null ? Math.sign(c.lastSurprise) : 0));
    const confirm = c.vs200 >= 0 ? 1 : 0;
    c.score = 100 * (0.35 * quality + 0.35 * trend + 0.15 * revisions + 0.15 * confirm);
    c.momentumScore = 100 * (0.6 * trend + 0.2 * (rTrend(clamp(c.ret12w, -0.3, 0.5))) + 0.2 * confirm);
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const prev = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : { holdings: [], removed: [] };
  const prevTag = new Map((prev.holdings || []).map((h) => [h.ticker, h.tag]));
  const prevRank = new Map((prev.holdings || []).map((h) => [h.ticker, h.zacksRank ?? null]));

  console.log("Step 1: universe");
  const universe = await buildUniverse();
  const cands = [...universe.values()];
  console.log(`  ${cands.length} candidates`);

  console.log("Step 2–4: fundamentals (FMP)");
  for (const c of cands) {
    await enrichFundamentals(c);
    c.qualityFail = qualityCheck(c);
    c.revisionFail = revisionCheck(c);
    await sleep(200);
  }
  const survivors = cands.filter((c) => !c.qualityFail && !c.revisionFail);
  console.log(`  ${survivors.length} pass quality + revisions`);

  console.log(`Step 5: momentum (Twelve Data, ${CFG.tdCallsPerMin}/min → ~${Math.ceil(survivors.length / CFG.tdCallsPerMin)} min)`);
  for (const c of survivors) {
    await enrichMomentum(c);
    c.momentumFail = momentumCheck(c, prevTag.get(c.ticker));
  }

  console.log("Step 6: select");
  const passing = survivors.filter((c) => !c.momentumFail && !c.momentumMissing);
  assignScores(passing);
  const rankKey = (c) => c.score + (prevTag.has(c.ticker) ? CFG.incumbentBonus : 0);
  const chosen = [];
  const sectorsEmpty = [];
  // Core first: sector slots, quality-weighted score, valuation guardrail.
  for (const sector of SECTORS) {
    const pool = passing
      .filter((c) => c.sector === sector)
      .filter((c) => c.pe == null || (c.pe > 0 && c.pe <= CFG.coreMaxPE))
      .sort((a, b) => rankKey(b) - rankKey(a));
    const take = pool.slice(0, CFG.slots[sector] ?? 2);
    if (take.length === 0) sectorsEmpty.push(sector);
    take.forEach((c) => { c.sleeve = "core"; });
    chosen.push(...take);
  }
  const coreSet = new Set(chosen.map((c) => c.ticker));
  // Then the AI sleeve: pure momentum among watchlist names that did not make core.
  const ai = passing
    .filter((c) => c.aiWatch && !coreSet.has(c.ticker))
    .sort((a, b) => (b.momentumScore + (prevTag.has(b.ticker) ? CFG.incumbentBonus : 0)) - (a.momentumScore + (prevTag.has(a.ticker) ? CFG.incumbentBonus : 0)))
    .slice(0, CFG.maxAiSleeve);
  ai.forEach((c) => { c.sleeve = "ai"; });
  chosen.push(...ai);
  const chosenSet = new Set(chosen.map((c) => c.ticker));

  console.log("Step 7: diff and tag");
  const tagFor = (c) => {
    const reasons = [];
    if (!prevTag.has(c.ticker)) reasons.push("added by screen");
    if (c.vs200 < 0) reasons.push(`${(c.vs200 * 100).toFixed(1)}% below 200-day; remove if >5% below or below two weeks`);
    if (c.lastSurprise != null && c.lastSurprise < 0) reasons.push(`missed last earnings by ${(Math.abs(c.lastSurprise) * 100).toFixed(0)}%`);
    if (c.nextEarnings) { const d = (new Date(c.nextEarnings) - Date.now()) / 86_400_000; if (d >= 0 && d <= 10) reasons.push(`reports ${c.nextEarnings}`); }
    if (c.ret12w != null && c.ret12w <= -0.15 && c.vs200 >= 0) reasons.push(`down ${(Math.abs(c.ret12w) * 100).toFixed(0)}% over 12 weeks; still above 200-day`);
    let tag = "Hold";
    if (!prevTag.has(c.ticker)) tag = "New";
    else if (c.vs200 < 0 || (c.lastSurprise != null && c.lastSurprise < 0) || (c.ret12w != null && c.ret12w <= -0.15)) tag = "Watch";
    if (reasons.length === 0) reasons.push(`${(c.ret52w * 100).toFixed(0) > 0 ? "+" : ""}${(c.ret52w * 100).toFixed(0)}% 52-week; ${c.upgrades} up / ${c.downgrades} down grades`);
    return { tag, reason: reasons.join(". ") };
  };

  const fmtPct = (x) => (x == null ? null : Number((x * 100).toFixed(1)));
  const toRow = (c, tag, reason) => ({
    ticker: c.ticker,
    name: c.name,
    sector: c.sector,
    sleeve: c.sleeve,
    zacksRank: prevRank.get(c.ticker) ?? null, // Zacks isn't automatable; carried from the last chat review, if any
    ret52w: fmtPct(c.ret52w),
    ret12w: fmtPct(c.ret12w),
    price: c.price != null ? Number(c.price.toFixed(2)) : null,
    sma200: c.sma200 != null ? Number(c.sma200.toFixed(2)) : null,
    vs200: fmtPct(c.vs200),
    roe: fmtPct(c.roe),
    netMargin: fmtPct(c.margin),
    upgrades: c.upgrades,
    downgrades: c.downgrades,
    lastSurprise: fmtPct(c.lastSurprise),
    pe: c.pe != null ? Number(c.pe.toFixed(1)) : null,
    score: Number.isFinite(c.score) ? Number(c.score.toFixed(1)) : null,
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
    if (c) reason = c.qualityFail || c.revisionFail || c.momentumFail || (c.pe > CFG.coreMaxPE ? `P/E ${c.pe.toFixed(0)} above core cap of ${CFG.coreMaxPE}` : "outscored by another name in its sector");
    removed.push({ ...h, tag: "Removed", reason, vs200: c?.vs200 != null ? fmtPct(c.vs200) : h.vs200, price: c?.price ?? h.price });
  }

  const priceDate = holdings.map((h) => h.price && chosen.find((c) => c.ticker === h.ticker)?.priceDate).filter(Boolean).sort().pop() || null;
  const out = {
    asOf: new Date().toISOString().slice(0, 10),
    generatedBy: "scripts/screen.mjs (FMP + Twelve Data)",
    priceDate,
    rules: {
      universe: `US stocks over $${CFG.minMarketCap / 1e9}B by sector (FMP screener), top ${CFG.candidatesPerSector} per sector by market cap, plus an AI watchlist`,
      quality: "ROE, net margin, and debt/equity gates, relaxed for financials, REITs, and utilities",
      revisions: `net analyst downgrades of 2 or more in ${CFG.gradeWindowDays} days removes a name`,
      earnings: "a miss on the last report puts a name on Watch",
      momentum: "price vs 200-day SMA; Watch if within 5% below, Removed if more than 5% below or below two straight weeks",
      scoring: "percentile ranks across the pool: 35% quality (ROE, margin, size), 35% 12-month trend (capped), 15% revisions and last surprise, 15% above 200-day",
      valuation: `core names need positive earnings and trailing P/E at or below ${CFG.coreMaxPE}; the AI sleeve is exempt`,
      sizing: `sector slots weighted like the S&P (tech ${CFG.slots.Technology}, financials ${CFG.slots["Financial Services"]}, others 2–4) plus ${CFG.maxAiSleeve} pure-momentum AI names not already in core; incumbents keep their slot unless a challenger outscores them by ${CFG.incumbentBonus}+ points; sectors are left empty if nothing passes`,
    },
    sectorsEmpty,
    holdings,
    removed,
  };

  const json = JSON.stringify(out, null, 2);
  if (process.env.DRY_RUN) { console.log(json); return; }
  writeFileSync(OUT_PATH, json + "\n");
  console.log(`\nWrote ${holdings.length} holdings, ${removed.length} removed → ${OUT_PATH}`);
  console.log(`New: ${holdings.filter((h) => h.tag === "New").map((h) => h.ticker).join(", ") || "none"}`);
  console.log(`Watch: ${holdings.filter((h) => h.tag === "Watch").map((h) => h.ticker).join(", ") || "none"}`);
  console.log(`Removed: ${removed.map((h) => h.ticker).join(", ") || "none"}`);
  if (sectorsEmpty.length) console.log(`Empty sectors: ${sectorsEmpty.join(", ")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
