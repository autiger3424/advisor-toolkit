#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   HALAL IDEAS SCREEN
   Rebuilds src/data/halal-ideas.json from live data.

   A Shariah-screened, all-equity, higher-risk idea list: 50–75 names
   spread across every permissible sector. Same plumbing as screen.mjs,
   different gates:

     1. Universe   — FMP company screener: US stocks over $3B in every
                     sector except Financial Services (mid-caps allowed
                     because the list is meant to run hotter than core).
     2. Business   — industry exclusions: banks, insurance, lenders,
                     alcohol, tobacco, gambling/casinos, defense,
                     mortgage REITs, plus a short ticker blocklist for
                     pork processors and adult content. Anything the
                     industry tag can't catch is left to Zoya.
     3. Ratios     — AAOIFI-style gates on the latest quarterly filing:
                       total debt / market cap        < 33%
                       cash + ST investments / mkt cap < 33%
                       interest income / revenue      <  5%
                     Zoya is the compliance source of truth; this step
                     only keeps names that are likely to pass there.
     4. Quality    — light: positive gross margin, price/sales ≤ 25,
                     no P/E cap (high-risk list), net downgrades ≥ 2 in
                     45 days removes a name.
     5. Momentum   — Twelve Data closes vs 200-day SMA, 52-wk, 12-wk.
     6. Select     — sector slots summing to ~68, floor 50, ceiling 75;
                     incumbents keep their slot unless they fail a rule.
     7. Diff       — New / Hold / Watch / Removed against last week.

   Env: FMP_API_KEY, TWELVE_DATA_API_KEY (required); TD_CALLS_PER_MIN,
        SCREEN_LIMIT, DRY_RUN=1 (optional).

   Run:  node scripts/halal-screen.mjs
──────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/halal-ideas.json");

const FMP_KEY = process.env.FMP_API_KEY;
const TD_KEY = process.env.TWELVE_DATA_API_KEY;
if (!FMP_KEY || !TD_KEY) {
  console.error("Missing FMP_API_KEY or TWELVE_DATA_API_KEY.");
  process.exit(1);
}

// ── Configuration ──────────────────────────────────────────────
const CFG = {
  minMarketCap: 3_000_000_000,
  candidatesPerSector: Number(process.env.SCREEN_LIMIT) || 45, // by market cap, before the ratio screen (tech gets 2x)
  maxMomentumChecks: 230,      // Twelve Data budget per run (~29 min at 8/min); ranked by market cap first
  // Slots per sector. Financials are out entirely, so tech and healthcare carry more.
  slots: {
    Technology: 18,
    Healthcare: 10,
    Industrials: 9,
    "Consumer Cyclical": 8,
    "Communication Services": 5,
    Energy: 5,
    "Basic Materials": 5,
    "Consumer Defensive": 4,
    "Real Estate": 2,
    Utilities: 2,
  },
  minTotal: 50,
  maxTotal: 75,
  maxPS: 25,                   // trailing price/sales cap; looser than core because this list runs hotter
  // AAOIFI ratio gates (Zoya's default standard). Market cap is current, not the 36-month average Zoya uses.
  shariah: { maxDebtToCap: 0.33, maxCashToCap: 0.33, maxInterestToRev: 0.05 },
  tdCallsPerMin: Number(process.env.TD_CALLS_PER_MIN) || 8,
  gradeWindowDays: 45,
  momentumWatchBand: -0.05,
  incumbentBonus: 15,
  maxSwapsPerWeek: 3,
};

const SECTORS = [
  "Technology",
  "Communication Services",
  "Healthcare",
  "Industrials",
  "Energy",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Basic Materials",
  "Real Estate",
  "Utilities",
];

// Business screen. Matched case-insensitively against FMP's industry string.
const EXCLUDED_INDUSTRY_PATTERNS = [
  /bank/i, /insurance/i, /capital markets/i, /credit services/i, /asset management/i, /financial/i, /mortgage/i,
  /alcohol/i, /brewers/i, /wineries/i, /distiller/i,
  /tobacco/i,
  /gambling/i, /casino/i,
  /aerospace & defense/i, /defense/i,
  /reit - mortgage/i,
];
// Names the industry tag won't catch: pork processors, adult content, pure-play alcohol in a generic industry.
const TICKER_BLOCKLIST = new Set(["HRL", "TSN", "SFD", "PPC", "BF-B", "STZ", "TAP", "SAM", "MO", "PM", "DKNG", "MGM", "LVS", "WYNN", "CZR", "PENN", "RSI", "GENI"]);

const ALLOWED_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "NYSE ARCA"]);

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

const pick = (obj, keys) => {
  if (!obj) return null;
  for (const k of keys) if (obj[k] != null && obj[k] !== "") return Number(obj[k]);
  return null;
};
const first = (x) => (Array.isArray(x) ? x[0] : x);

// ── Step 1–2: universe + business screen ───────────────────────
function businessFail(c) {
  if (TICKER_BLOCKLIST.has(c.ticker)) return "on the business-screen blocklist";
  if (c.sector === "Financial Services") return "conventional finance";
  const ind = c.industry || "";
  for (const re of EXCLUDED_INDUSTRY_PATTERNS) if (re.test(ind)) return `excluded industry: ${ind}`;
  return null;
}

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
      limit: 200,
    });
    const clean = (rows || [])
      .filter((r) => r.symbol && !/[-.]/.test(r.symbol))
      .filter((r) => !r.exchangeShortName || ALLOWED_EXCHANGES.has(String(r.exchangeShortName).toUpperCase()))
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .slice(0, sector === "Technology" ? CFG.candidatesPerSector * 2 : CFG.candidatesPerSector);
    for (const r of clean) {
      universe.set(r.symbol, { ticker: r.symbol, name: r.companyName || r.symbol, sector, industry: r.industry || "", marketCap: r.marketCap || null });
    }
    console.log(`universe: ${sector} → ${clean.length}`);
    await sleep(250);
  }
  for (const t of incumbents) {
    if (universe.has(t)) continue;
    const p = first(await fmp("profile", { symbol: t }));
    if (!p) continue;
    universe.set(t, { ticker: t, name: p.companyName || t, sector: p.sector || "Technology", industry: p.industry || "", marketCap: p.marketCap || p.mktCap || null });
    await sleep(250);
  }
  // One ticker per company (GOOG/GOOGL etc).
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

// ── Step 3–4: Shariah ratios + light quality from FMP ──────────
async function enrichFundamentals(c) {
  const [bs, is, ratios, grades, earnings] = await Promise.all([
    fmp("balance-sheet-statement", { symbol: c.ticker, period: "quarter", limit: 1 }),
    fmp("income-statement", { symbol: c.ticker, period: "annual", limit: 1 }),
    fmp("ratios-ttm", { symbol: c.ticker }),
    fmp("grades", { symbol: c.ticker, limit: 60 }),
    fmp("earnings", { symbol: c.ticker, limit: 8 }),
  ]);
  const b = first(bs), i = first(is), r = first(ratios);
  const cap = c.marketCap || null;
  const debt = pick(b, ["totalDebt"]) ?? ((pick(b, ["shortTermDebt"]) || 0) + (pick(b, ["longTermDebt"]) || 0));
  const cash = pick(b, ["cashAndShortTermInvestments"]) ?? ((pick(b, ["cashAndCashEquivalents"]) || 0) + (pick(b, ["shortTermInvestments"]) || 0));
  const revenue = pick(i, ["revenue"]);
  const interestIncome = pick(i, ["interestIncome"]);
  c.filingDate = b?.date || null;
  c.debtToCap = cap && debt != null ? debt / cap : null;
  c.cashToCap = cap && cash != null ? cash / cap : null;
  c.interestToRev = revenue && interestIncome != null ? interestIncome / revenue : null;

  c.roe = pick(r, ["returnOnEquityTTM", "returnOnEquity"]);
  c.margin = pick(r, ["netProfitMarginTTM", "netProfitMargin"]);
  c.grossMargin = pick(r, ["grossProfitMarginTTM", "grossProfitMargin"]);
  c.pe = pick(r, ["priceToEarningsRatioTTM", "peRatioTTM", "priceEarningsRatioTTM"]);
  c.ps = pick(r, ["priceToSalesRatioTTM", "priceSalesRatioTTM", "priceToSalesRatio"]);

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
}

function shariahCheck(c) {
  const s = CFG.shariah;
  if (c.debtToCap == null || c.cashToCap == null) return "no balance sheet data";
  if (c.debtToCap > s.maxDebtToCap) return `debt ${(c.debtToCap * 100).toFixed(0)}% of market cap (limit ${s.maxDebtToCap * 100}%)`;
  if (c.cashToCap > s.maxCashToCap) return `cash and securities ${(c.cashToCap * 100).toFixed(0)}% of market cap (limit ${s.maxCashToCap * 100}%)`;
  if (c.interestToRev != null && c.interestToRev > s.maxInterestToRev) return `interest income ${(c.interestToRev * 100).toFixed(1)}% of revenue (limit ${s.maxInterestToRev * 100}%)`;
  return null;
}

function qualityCheck(c) {
  if (c.grossMargin != null && c.grossMargin <= 0) return "negative gross margin";
  if (c.ps != null && c.ps > CFG.maxPS) return `price/sales ${c.ps.toFixed(1)} above ${CFG.maxPS}`;
  if (c.downgrades - c.upgrades >= 2) return `${c.downgrades} downgrades vs ${c.upgrades} upgrades in ${CFG.gradeWindowDays} days`;
  return null;
}

// ── Step 5: momentum ───────────────────────────────────────────
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

// Momentum-tilted scoring: this list is meant to run hotter than core.
function assignScores(pool) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x ?? 0));
  const pctRank = (key) => {
    const vals = pool.map(key).filter((v) => v != null).sort((a, b) => a - b);
    return (v) => (v == null || vals.length === 0 ? 0.5 : vals.filter((x) => x <= v).length / vals.length);
  };
  const rMargin = pctRank((c) => c.margin);
  const rRoe = pctRank((c) => c.roe);
  const rTrend = pctRank((c) => clamp(c.ret52w, -0.5, 1.0));
  const rTrend12 = pctRank((c) => clamp(c.ret12w, -0.3, 0.6));
  const rRev = pctRank((c) => (c.upgrades - c.downgrades) + (c.lastSurprise != null ? Math.sign(c.lastSurprise) : 0));
  for (const c of pool) {
    const quality = (rMargin(c.margin) + rRoe(c.roe)) / 2;
    const trend = 0.65 * rTrend(clamp(c.ret52w, -0.5, 1.0)) + 0.35 * rTrend12(clamp(c.ret12w, -0.3, 0.6));
    const revisions = rRev((c.upgrades - c.downgrades) + (c.lastSurprise != null ? Math.sign(c.lastSurprise) : 0));
    const confirm = c.vs200 >= 0 ? 1 : 0;
    c.score = 100 * (0.20 * quality + 0.45 * trend + 0.20 * revisions + 0.15 * confirm);
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const prev = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : { holdings: [], removed: [] };
  const prevTag = new Map((prev.holdings || []).map((h) => [h.ticker, h.tag]));
  const prevRank = new Map((prev.holdings || []).map((h) => [h.ticker, h.zacksRank ?? null]));

  console.log("Step 1–2: universe + business screen");
  const universe = await buildUniverse([...prevTag.keys()]);
  const cands = [...universe.values()];
  for (const c of cands) c.businessFail = businessFail(c);
  const permissible = cands.filter((c) => !c.businessFail);
  console.log(`  ${cands.length} candidates, ${permissible.length} pass the business screen`);

  console.log("Step 3–4: Shariah ratios + quality (FMP)");
  for (const c of permissible) {
    await enrichFundamentals(c);
    c.shariahFail = shariahCheck(c);
    c.qualityFail = c.shariahFail ? null : qualityCheck(c);
    await sleep(200);
  }
  let survivors = permissible.filter((c) => !c.shariahFail && !c.qualityFail);
  console.log(`  ${permissible.filter((c) => !c.shariahFail).length} pass ratios, ${survivors.length} pass quality too`);

  // Twelve Data budget: incumbents first, then the largest challengers.
  const isIncumbent = (c) => prevTag.has(c.ticker);
  survivors.sort((a, b) => (isIncumbent(b) - isIncumbent(a)) || ((b.marketCap || 0) - (a.marketCap || 0)));
  const skipped = survivors.slice(CFG.maxMomentumChecks);
  survivors = survivors.slice(0, CFG.maxMomentumChecks);
  if (skipped.length) console.log(`  ${skipped.length} smaller names skipped this week (momentum budget ${CFG.maxMomentumChecks})`);

  console.log(`Step 5: momentum (Twelve Data, ${CFG.tdCallsPerMin}/min → ~${Math.ceil(survivors.length / CFG.tdCallsPerMin)} min)`);
  for (const c of survivors) {
    await enrichMomentum(c);
    c.momentumFail = momentumCheck(c, prevTag.get(c.ticker));
  }

  console.log("Step 6: select");
  const passing = survivors.filter((c) => !c.momentumFail && !c.momentumMissing);
  assignScores(passing);
  let swapsLeft = CFG.maxSwapsPerWeek;
  const swapped = [];

  function fill(pool, slots, scoreOf) {
    const ranked = [...pool].sort((a, b) => scoreOf(b) - scoreOf(a));
    const keep = ranked.filter(isIncumbent);
    const challengers = ranked.filter((c) => !isIncumbent(c));
    const out = [...keep];
    while (out.length < slots && challengers.length) out.push(challengers.shift());
    for (const ch of challengers) {
      if (swapsLeft <= 0) break;
      const weakest = out.filter(isIncumbent).sort((a, b) => scoreOf(a) - scoreOf(b))[0];
      if (!weakest || scoreOf(ch) < scoreOf(weakest) + CFG.incumbentBonus) break;
      out.splice(out.indexOf(weakest), 1, ch);
      swapped.push({ ticker: weakest.ticker, by: ch.ticker, gap: scoreOf(ch) - scoreOf(weakest) });
      swapsLeft--;
    }
    return out;
  }

  const chosen = [];
  const sectorsEmpty = [];
  for (const sector of SECTORS) {
    const take = fill(passing.filter((c) => c.sector === sector), CFG.slots[sector] ?? 2, (c) => c.score);
    if (take.length === 0) sectorsEmpty.push(sector);
    chosen.push(...take);
  }
  if (chosen.length < CFG.minTotal) {
    const have = new Set(chosen.map((c) => c.ticker));
    const bench = passing.filter((c) => !have.has(c.ticker)).sort((a, b) => b.score - a.score);
    while (chosen.length < CFG.minTotal && bench.length) { const c = bench.shift(); c.backfilled = true; chosen.push(c); }
  }
  while (chosen.length > CFG.maxTotal) {
    const idx = chosen.map((c, i) => [c, i]).filter(([c]) => !isIncumbent(c)).sort((a, b) => a[0].score - b[0].score)[0];
    if (!idx) break;
    chosen.splice(idx[1], 1);
  }
  const chosenSet = new Set(chosen.map((c) => c.ticker));
  console.log(`  ${chosen.length} selected, ${swapped.length} score-based swap(s) (cap ${CFG.maxSwapsPerWeek})`);

  console.log("Step 7: diff and tag");
  const nearLimit = (c) => c.debtToCap > 0.28 || c.cashToCap > 0.28 || (c.interestToRev != null && c.interestToRev > 0.04);
  const tagFor = (c) => {
    const reasons = [];
    if (!prevTag.has(c.ticker)) reasons.push(c.backfilled ? `added to keep the list at ${CFG.minTotal}+ names` : "added by screen");
    if (nearLimit(c)) reasons.push(`near a Shariah ratio limit (debt ${(c.debtToCap * 100).toFixed(0)}%, cash ${(c.cashToCap * 100).toFixed(0)}%); confirm in Zoya`);
    if (c.vs200 < 0) reasons.push(`${(c.vs200 * 100).toFixed(1)}% below 200-day; remove if >5% below or below two weeks`);
    if (c.lastSurprise != null && c.lastSurprise < 0) reasons.push(`missed last earnings by ${(Math.abs(c.lastSurprise) * 100).toFixed(0)}%`);
    if (c.nextEarnings) { const d = (new Date(c.nextEarnings) - Date.now()) / 86_400_000; if (d >= 0 && d <= 10) reasons.push(`reports ${c.nextEarnings}`); }
    if (c.ret12w != null && c.ret12w <= -0.15 && c.vs200 >= 0) reasons.push(`down ${(Math.abs(c.ret12w) * 100).toFixed(0)}% over 12 weeks; still above 200-day`);
    let tag = "Hold";
    if (!prevTag.has(c.ticker)) tag = "New";
    else if (nearLimit(c) || c.vs200 < 0 || (c.lastSurprise != null && c.lastSurprise < 0) || (c.ret12w != null && c.ret12w <= -0.15)) tag = "Watch";
    if (reasons.length === 0) reasons.push(`${(c.ret52w * 100).toFixed(0) > 0 ? "+" : ""}${(c.ret52w * 100).toFixed(0)}% 52-week; ${c.upgrades} up / ${c.downgrades} down grades`);
    return { tag, reason: reasons.join(". ") };
  };

  const fmtPct = (x) => (x == null ? null : Number((x * 100).toFixed(1)));
  const toRow = (c, tag, reason) => ({
    ticker: c.ticker,
    name: c.name,
    sector: c.sector,
    industry: c.industry || null,
    sleeve: "halal",
    zacksRank: prevRank.get(c.ticker) ?? null,
    ret52w: fmtPct(c.ret52w),
    ret12w: fmtPct(c.ret12w),
    price: c.price != null ? Number(c.price.toFixed(2)) : null,
    sma200: c.sma200 != null ? Number(c.sma200.toFixed(2)) : null,
    vs200: fmtPct(c.vs200),
    roe: fmtPct(c.roe),
    netMargin: fmtPct(c.margin),
    debtToCap: fmtPct(c.debtToCap),
    cashToCap: fmtPct(c.cashToCap),
    interestToRev: fmtPct(c.interestToRev),
    filingDate: c.filingDate,
    upgrades: c.upgrades,
    downgrades: c.downgrades,
    lastSurprise: fmtPct(c.lastSurprise),
    pe: c.pe != null ? Number(c.pe.toFixed(1)) : null,
    ps: c.ps != null ? Number(c.ps.toFixed(1)) : null,
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
    if (c) {
      const sw = swapped.find((s) => s.ticker === h.ticker);
      reason = c.businessFail || c.shariahFail || c.qualityFail || c.momentumFail
        || (sw ? `replaced by ${sw.by}, which outscored it by ${sw.gap.toFixed(0)} points` : `trimmed at the ${CFG.maxTotal}-name ceiling`);
    }
    removed.push({ ...h, tag: "Removed", reason, vs200: c?.vs200 != null ? fmtPct(c.vs200) : h.vs200, price: c?.price ?? h.price });
  }

  const priceDate = holdings.map((h) => h.price && chosen.find((c) => c.ticker === h.ticker)?.priceDate).filter(Boolean).sort().pop() || null;
  const s = CFG.shariah;
  const out = {
    asOf: new Date().toISOString().slice(0, 10),
    generatedBy: "scripts/halal-screen.mjs (FMP + Twelve Data)",
    priceDate,
    standard: "AAOIFI ratio screen on the latest quarterly filing; Zoya is the compliance source of truth",
    rules: {
      universe: `US stocks over $${CFG.minMarketCap / 1e9}B in every sector except Financial Services, top ${CFG.candidatesPerSector} per sector by market cap (tech 2x)`,
      business: "excluded by industry: banks, insurance, lenders, alcohol, tobacco, gambling and casinos, aerospace and defense, mortgage REITs; blocklist for pork processors and casino operators",
      ratios: `total debt under ${s.maxDebtToCap * 100}% of market cap, cash and short-term investments under ${s.maxCashToCap * 100}% of market cap, interest income under ${s.maxInterestToRev * 100}% of revenue`,
      quality: `positive gross margin, trailing price/sales at or below ${CFG.maxPS}, no P/E cap; net analyst downgrades of 2 or more in ${CFG.gradeWindowDays} days removes a name`,
      momentum: "price vs 200-day SMA; Watch if within 5% below, Removed if more than 5% below or below two straight weeks",
      scoring: "percentile ranks: 45% trend (12-month and 12-week), 20% revisions and last surprise, 20% quality (margin, ROE), 15% above 200-day",
      sizing: `sector slots: tech ${CFG.slots.Technology}, healthcare ${CFG.slots.Healthcare}, industrials ${CFG.slots.Industrials}, consumer cyclical ${CFG.slots["Consumer Cyclical"]}, others 2–5; sectors are left empty if nothing passes`,
      stability: `${CFG.minTotal}–${CFG.maxTotal} names at all times; a holding leaves only when it fails a hard rule (ratio, business, momentum, revisions) or, at most ${CFG.maxSwapsPerWeek} times a week, when a challenger outscores it by ${CFG.incumbentBonus}+ points`,
      purification: "non-compliant income share is not computed here; use Zoya's per-holding purification figure annually",
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
