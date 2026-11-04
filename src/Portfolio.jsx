/* ────────────────────────────────────────────────────────────────
   PORTFOLIO — Advisor Toolkit module

   Renders src/data/model-portfolio.json: a 24-25 name model in two
   sleeves. Core (target 70%) is scored on a 3-5 year rubric
   (quality and durability weighted up, growth blends trailing and
   forward, Zacks Rank is a gate). Growth (target 30%) is scored on
   the original five-factor rubric with estimate momentum. 18/25 is
   the bar in both.

   Views:
     Holdings  — core and growth sleeves with weight vs target, each
                 name's score, Zacks Rank and return since entry; tap
                 a row for the factor breakdown, the other rubric's
                 score, the thesis and the sell trigger.
     Rules     — the structure, both rubrics, construction, sizing and
                 review cadence, kept here so the method travels.
     Bench     — names that score well but are kept out, and why.
     Log       — every change since inception.

   Prices and factor inputs refresh on Sundays (scripts/score-portfolio.mjs);
   Zacks Rank and durability are set by hand in reviews. Membership
   changes are decided monthly; hard triggers act the week they fire.
──────────────────────────────────────────────────────────────── */

import { useState } from "react";
import data from "./data/model-portfolio.json";
import sweep from "./data/13f-sweep.json";
import fundList from "./data/13f-funds.json";

const palette = {
  bg: "#0B1120",
  card: "#111827",
  border: "#1e293b",
  borderLight: "#334155",
  accent: "#C9A84C",
  accentDim: "rgba(201,168,76,0.15)",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textMuted: "#64748b",
  success: "#4ade80",
  warn: "#fbbf24",
  danger: "#ef4444",
};

const fonts = {
  display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  body: "'Source Sans 3', 'Segoe UI', Tahoma, sans-serif",
  mono: "'DM Mono', 'Courier New', monospace",
};

const RANK_LABEL = { 1: "Strong Buy", 2: "Buy", 3: "Hold", 4: "Sell", 5: "Strong Sell" };
const FACTOR_LABEL = { quality: "Quality", growth: "Growth", valuation: "Valuation", estimates: "Estimates", durability: "Durability" };
const SHORT_SECTOR = {
  "Communication Services": "Comm Svcs",
  "Financial Services": "Financials",
  "Consumer Cyclical": "Cons Cyclical",
  "Consumer Defensive": "Cons Defensive",
  "Basic Materials": "Materials",
};

const s = {
  pill: (active) => ({
    padding: "5px 12px", borderRadius: 16, border: `1px solid ${active ? palette.accent : palette.border}`,
    background: active ? palette.accent : "transparent", color: active ? palette.bg : palette.textDim,
    fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", fontFamily: fonts.body, whiteSpace: "nowrap",
  }),
  card: { background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.display, fontSize: "0.9rem", fontWeight: 700, color: palette.accent, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${palette.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  count: { fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.textMuted, fontWeight: 400 },
  badge: (color) => ({ display: "inline-block", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", color, background: color + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontFamily: fonts.body, whiteSpace: "nowrap" }),
  meta: { fontSize: "0.72rem", color: palette.textMuted, lineHeight: 1.5, marginBottom: 12 },
  note: { background: palette.accentDim, border: `1px solid ${palette.accent}44`, borderRadius: 8, padding: "10px 12px", fontSize: "0.72rem", color: palette.warn, marginBottom: 14, lineHeight: 1.5 },
  empty: { fontSize: "0.78rem", color: palette.textMuted, padding: "10px 0", lineHeight: 1.5 },
  stat: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: "0.56rem", letterSpacing: "0.08em", textTransform: "uppercase", color: palette.textMuted },
  statValue: (color) => ({ fontFamily: fonts.mono, fontSize: "1rem", color: color || palette.text, marginTop: 2 }),
  rule: { fontSize: "0.76rem", color: palette.textDim, lineHeight: 1.6 },
  ruleHead: { fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: palette.accent, fontWeight: 700, marginTop: 10, marginBottom: 3 },
};

const pct = (n, digits = 1) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`);
const trendColor = (n) => (n == null ? palette.textMuted : n >= 0 ? palette.success : palette.danger);
const money = (n) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const scoreColor = (n) => (n >= 18 ? palette.success : n >= 16 ? palette.warn : palette.danger);
const tierColor = { A: palette.accent, B: palette.textDim, C: palette.textMuted, G: palette.warn };
const RULE_ORDER = ["structure", "coreScoring", "growthScoring", "scoring", "construction", "sizing", "cadence", "data"];
const RULE_LABEL = { coreScoring: "core scoring", growthScoring: "growth scoring" };

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function Row({ h, open, onToggle }) {
  const rankColor = h.zacksRank <= 2 ? palette.accent : h.zacksRank >= 4 ? palette.danger : palette.textMuted;
  const days = daysUntil(h.nextEarnings);
  const earningsSoon = days != null && days >= 0 && days <= 10;
  const f = h.factors || {};
  const flagged = (h.flags || []).length > 0;

  return (
    <div onClick={onToggle} style={{ padding: "9px 0", borderBottom: `1px solid ${palette.border}`, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 54, flexShrink: 0 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: "0.9rem", fontWeight: 500, color: palette.text }}>{h.ticker}</div>
          {h.zacksRank && <div style={{ fontSize: "0.58rem", color: rankColor, fontWeight: 700, letterSpacing: "0.04em" }}>ZR {h.zacksRank}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8rem", color: palette.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>
          <div style={{ fontSize: "0.66rem", color: palette.textMuted }}>
            <span style={{ color: tierColor[h.tier] || palette.textMuted, fontWeight: 700 }}>{h.tier}</span> · {h.weight}% · {SHORT_SECTOR[h.sector] || h.sector}
            {earningsSoon && <span style={{ color: palette.warn, marginLeft: 6 }}>reports {fmtDate(h.nextEarnings)?.replace(/, \d{4}$/, "")}</span>}
            {flagged && <span style={{ color: palette.danger, marginLeft: 6 }}>review</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: "0.8rem", color: trendColor(h.returnSinceEntry) }}>{pct(h.returnSinceEntry)}</div>
          <div style={{ fontSize: "0.58rem", color: palette.textMuted }}>since entry</div>
        </div>
        <span style={s.badge(scoreColor(h.score))}>{h.score}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8, marginLeft: 64, fontSize: "0.74rem", color: palette.textDim, lineHeight: 1.55 }}>
          <div>{h.why}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, fontFamily: fonts.mono, fontSize: "0.66rem", color: palette.textMuted, flexWrap: "wrap" }}>
            {Object.keys(FACTOR_LABEL).map((k) => (
              <span key={k}>{FACTOR_LABEL[k].slice(0, 3)} <span style={{ color: f[k] >= 4 ? palette.success : f[k] <= 2 ? palette.danger : palette.text }}>{f[k] ?? "—"}</span></span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 4, fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.textMuted, flexWrap: "wrap" }}>
            <span>entry {money(h.entryPrice)} on {fmtDate(h.entryDate)}</span>
            <span>now {money(h.price)}</span>
            {h.zacksRank && <span>Zacks {h.zacksRank} {RANK_LABEL[h.zacksRank]}{h.zacksGate ? " · gate" : ""}</span>}
            {h.altScore != null && <span>{h.altScoreRubric} rubric <span style={{ color: scoreColor(h.altScore) }}>{h.altScore}</span></span>}
            {h.aiCapex && <span style={{ color: palette.warn }}>AI capex</span>}
            {h.nextEarnings && <span>earnings {fmtDate(h.nextEarnings)}</span>}
          </div>
          {(h.pe != null || h.peg != null || h.roic != null || h.fwdEpsGrowth != null || h.growthTrail3y != null || h.growthFwd2y != null) && (
            <div style={{ display: "flex", gap: 14, marginTop: 4, fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.textMuted, flexWrap: "wrap" }}>
              {h.growthTrail3y != null && <span>3y EPS <span style={{ color: trendColor(h.growthTrail3y) }}>{pct(h.growthTrail3y, 0)}</span>/yr</span>}
              {(h.growthFwd2y ?? h.fwdEpsGrowth) != null && <span>fwd EPS <span style={{ color: trendColor(h.growthFwd2y ?? h.fwdEpsGrowth) }}>{pct(h.growthFwd2y ?? h.fwdEpsGrowth, 0)}</span>/yr</span>}
              {h.fwdRevGrowth != null && <span>rev <span style={{ color: trendColor(h.fwdRevGrowth) }}>{pct(h.fwdRevGrowth, 0)}</span>/yr</span>}
              {h.roic != null ? <span>ROIC {h.roic.toFixed(0)}%</span> : h.roe != null && <span>ROE {h.roe.toFixed(0)}%</span>}
              {h.pe != null && <span>P/E {h.pe.toFixed(0)}</span>}
              {h.peg != null && <span>PEG {h.peg.toFixed(1)}</span>}
              {h.revision != null && <span>est <span style={{ color: trendColor(h.revision) }}>{pct(h.revision, 1)}</span></span>}
            </div>
          )}
          {(h.flags || []).length > 0 && (
            <div style={{ marginTop: 6, color: palette.danger }}>{h.flags.join(" · ")}</div>
          )}
          {h.thesis ? (
            <div style={{ marginTop: 6 }}><span style={{ color: palette.accent, fontWeight: 700 }}>Thesis.</span> {h.thesis}</div>
          ) : (
            <div style={{ marginTop: 6, color: palette.textMuted, fontStyle: "italic" }}>Thesis not written yet.</div>
          )}
          {h.sellTrigger ? (
            <div style={{ marginTop: 3 }}><span style={{ color: palette.danger, fontWeight: 700 }}>Sell if.</span> {h.sellTrigger}</div>
          ) : (
            <div style={{ marginTop: 3, color: palette.textMuted, fontStyle: "italic" }}>Sell trigger not set.</div>
          )}
        </div>
      )}
    </div>
  );
}

function BenchRow({ b }) {
  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${palette.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 54, flexShrink: 0, fontFamily: fonts.mono, fontSize: "0.9rem", color: palette.text }}>{b.ticker}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8rem", color: palette.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
          <div style={{ fontSize: "0.66rem", color: palette.textMuted }}>{SHORT_SECTOR[b.sector] || b.sector}</div>
        </div>
        <span style={s.badge(scoreColor(b.score))}>{b.score}</span>
      </div>
      <div style={{ marginLeft: 64, marginTop: 4, fontSize: "0.72rem", color: palette.textDim, lineHeight: 1.5 }}>
        {(b.sleeveEligible || b.coreScore != null) && (
          <div style={{ fontFamily: fonts.mono, fontSize: "0.66rem", color: palette.textMuted }}>
            {b.sleeveEligible && <span>{b.sleeveEligible} candidate</span>}
            {b.coreScore != null && <span> · core {b.coreScore}</span>}
            {b.growthScore != null && <span> · growth {b.growthScore}</span>}
          </div>
        )}
        <div><span style={{ color: palette.textMuted }}>Kept out by:</span> {b.keptOutBy}</div>
        <div><span style={{ color: palette.textMuted }}>Moves in on:</span> {b.wouldMoveIn}</div>
      </div>
    </div>
  );
}

const bn = (n) => (n == null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toLocaleString("en-US")}`);
const ACTION_COLOR = { new: palette.success, add: palette.success, trim: palette.warn, exit: palette.danger };
const ACTION_LABEL = { new: "NEW", add: "ADD", trim: "TRIM", exit: "EXIT" };

function Tag({ children, color }) {
  return <span style={{ ...s.badge(color), marginLeft: 6 }}>{children}</span>;
}

function FundCard({ f, open, onToggle, inBook }) {
  const buys = f.moves.filter((m) => m.action === "new" || m.action === "add");
  const sells = f.moves.filter((m) => m.action === "trim" || m.action === "exit");
  return (
    <div style={s.card}>
      <div onClick={onToggle} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: "0.9rem", fontWeight: 700, color: palette.text }}>{f.name}</div>
            <div style={{ fontSize: "0.66rem", color: palette.textMuted }}>{f.style} · {f.positions} positions · {bn(f.totalValue)}</div>
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: "0.7rem", color: palette.textMuted, textAlign: "right" }}>
            <span style={{ color: palette.success }}>+{buys.length}</span> / <span style={{ color: palette.danger }}>−{sells.length}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {f.top.slice(0, 10).map((t) => (
            <span key={t.symbol} style={{ fontFamily: fonts.mono, fontSize: "0.68rem", color: inBook(t.symbol) ? palette.accent : palette.textDim, background: palette.bg, border: `1px solid ${inBook(t.symbol) ? palette.accent + "66" : palette.border}`, borderRadius: 4, padding: "2px 6px" }}>
              {t.symbol} <span style={{ color: palette.textMuted }}>{t.pct != null ? `${(t.pct * 100).toFixed(0)}%` : ""}</span>
            </span>
          ))}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {[["Bought", buys], ["Sold", sells]].map(([label, list]) => list.length > 0 && (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={s.ruleHead}>{label}</div>
              {list.slice(0, 15).map((m) => (
                <div key={m.symbol + m.action} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.74rem", color: palette.textDim, borderBottom: `1px solid ${palette.border}` }}>
                  <span><span style={{ fontFamily: fonts.mono, color: inBook(m.symbol) ? palette.accent : palette.text }}>{m.symbol}</span> <span style={{ color: palette.textMuted }}>{m.name?.slice(0, 28)}</span>{inBook(m.symbol) && <Tag color={palette.accent}>{inBook(m.symbol)}</Tag>}</span>
                  <span style={{ fontFamily: fonts.mono, fontSize: "0.66rem", whiteSpace: "nowrap" }}>
                    <span style={{ color: ACTION_COLOR[m.action] }}>{ACTION_LABEL[m.action]}</span>
                    {m.change != null && m.action !== "exit" && <span style={{ color: palette.textMuted }}> {m.change > 0 ? "+" : ""}{(m.change * 100).toFixed(0)}%</span>}
                    {m.action !== "exit" && <span style={{ color: palette.textMuted }}> · {bn(m.value)}</span>}
                  </span>
                </div>
              ))}
              {list.length > 15 && <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 3 }}>+{list.length - 15} more</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThirteenF({ holdings, bench }) {
  const [openFund, setOpenFund] = useState(null);
  const held = new Map(holdings.map((h) => [h.ticker.replace(".", "-"), h]));
  const benched = new Set(bench.map((b) => b.ticker.replace(".", "-")));
  const inBook = (sym) => (held.has(sym) ? held.get(sym).sleeve : benched.has(sym) ? "bench" : null);
  const q = sweep.quarter;

  if (!q || !(sweep.funds || []).length) {
    return (
      <div style={s.card}>
        <div style={s.sectionTitle}><span>13F sweep</span><span style={s.count}>{fundList.funds.length} funds</span></div>
        <div style={s.empty}>
          No sweep yet. The first run lands the morning after the Nov 14 deadline (Q3 2026 filings) and then after each quarterly 13F deadline. It pulls every fund's top positions and the quarter's new buys, adds, trims and exits, then cross-references them against the holdings and the bench.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {fundList.funds.map((f) => <span key={f.cik} style={{ fontSize: "0.66rem", color: palette.textDim, background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 4, padding: "2px 7px" }}>{f.name}</span>)}
        </div>
      </div>
    );
  }

  const consensus = sweep.consensus || [];
  const bought = consensus.filter((c) => c.score > 0).slice(0, 20);
  const sold = consensus.filter((c) => c.score < 0).sort((a, b) => a.score - b.score).slice(0, 12);
  const overlapH = sweep.overlap?.holdings || [];
  const overlapB = sweep.overlap?.bench || [];

  return (
    <>
      <div style={s.meta}>
        13F filings for Q{q.quarter} {q.year} vs Q{sweep.priorQuarter.quarter} {sweep.priorQuarter.year}, swept {fmtDate(sweep.asOf)}. {sweep.funds.length} funds filed{sweep.missing?.length ? `; not yet filed: ${sweep.missing.join(", ")}` : ""}. Positions are as of quarter end, 45 days stale by the time they're public.
      </div>

      {overlapH.length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>Our holdings they moved</span><span style={s.count}>{overlapH.length}</span></div>
          {overlapH.sort((a, b) => (b.buys.length - b.sells.length) - (a.buys.length - a.sells.length)).map((o) => (
            <div key={o.symbol} style={{ padding: "6px 0", borderBottom: `1px solid ${palette.border}`, fontSize: "0.74rem", color: palette.textDim }}>
              <span style={{ fontFamily: fonts.mono, color: palette.accent }}>{o.symbol}</span><Tag color={palette.textMuted}>{o.sleeve}</Tag>
              <span style={{ marginLeft: 8, color: palette.success }}>+{o.buys.length}</span> <span style={{ color: palette.danger }}>−{o.sells.length}</span>
              <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 2 }}>
                {o.buys.length > 0 && <span style={{ color: palette.success }}>{o.buys.join(", ")}</span>}
                {o.buys.length > 0 && o.sells.length > 0 && " · "}
                {o.sells.length > 0 && <span style={{ color: palette.danger }}>{o.sells.join(", ")}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={s.card}>
        <div style={s.sectionTitle}><span>Most bought</span><span style={s.count}>2+ funds</span></div>
        {bought.length === 0 && <div style={s.empty}>No name was bought by two or more funds.</div>}
        {bought.map((c) => (
          <div key={c.symbol} style={{ padding: "6px 0", borderBottom: `1px solid ${palette.border}`, fontSize: "0.74rem", color: palette.textDim }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span><span style={{ fontFamily: fonts.mono, color: inBook(c.symbol) ? palette.accent : palette.text }}>{c.symbol}</span> <span style={{ color: palette.textMuted }}>{c.name?.slice(0, 30)}</span>{inBook(c.symbol) && <Tag color={palette.accent}>{inBook(c.symbol)}</Tag>}</span>
              <span style={{ fontFamily: fonts.mono, fontSize: "0.68rem" }}><span style={{ color: palette.success }}>{c.buys.length} buy{c.buys.length > 1 ? "s" : ""}</span>{c.sells.length > 0 && <span style={{ color: palette.danger }}> / {c.sells.length} sell{c.sells.length > 1 ? "s" : ""}</span>}</span>
            </div>
            <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 2 }}>{c.buys.join(", ")}</div>
          </div>
        ))}
      </div>

      {overlapB.length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>Bench names they moved</span><span style={s.count}>{overlapB.length}</span></div>
          {overlapB.map((o) => (
            <div key={o.symbol} style={{ padding: "6px 0", borderBottom: `1px solid ${palette.border}`, fontSize: "0.74rem", color: palette.textDim }}>
              <span style={{ fontFamily: fonts.mono, color: palette.accent }}>{o.symbol}</span>
              <span style={{ marginLeft: 8, color: palette.success }}>+{o.buys.length}</span> <span style={{ color: palette.danger }}>−{o.sells.length}</span>
              <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 2 }}>{[...o.buys, ...o.sells].join(", ")}</div>
            </div>
          ))}
        </div>
      )}

      {sold.length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>Most sold</span><span style={s.count}>2+ funds</span></div>
          {sold.map((c) => (
            <div key={c.symbol} style={{ padding: "6px 0", borderBottom: `1px solid ${palette.border}`, fontSize: "0.74rem", color: palette.textDim }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><span style={{ fontFamily: fonts.mono, color: inBook(c.symbol) ? palette.accent : palette.text }}>{c.symbol}</span> <span style={{ color: palette.textMuted }}>{c.name?.slice(0, 30)}</span>{inBook(c.symbol) && <Tag color={palette.danger}>{inBook(c.symbol)}</Tag>}</span>
                <span style={{ fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.danger }}>{c.sells.length} sell{c.sells.length > 1 ? "s" : ""}</span>
              </div>
              <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 2 }}>{c.sells.join(", ")}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...s.sectionTitle, border: "none", marginTop: 4 }}><span>By fund</span><span style={s.count}>tap for the quarter's moves · gold = in our book</span></div>
      {sweep.funds.map((f) => <FundCard key={f.cik} f={f} open={openFund === f.cik} onToggle={() => setOpenFund((p) => (p === f.cik ? null : f.cik))} inBook={inBook} />)}
    </>
  );
}

export default function Portfolio() {
  const [view, setView] = useState("holdings");
  const [open, setOpen] = useState(null);
  const toggle = (t) => setOpen((p) => (p === t ? null : t));

  const holdings = data.holdings || [];
  const bench = data.bench || [];
  const log = (data.changelog || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const rules = data.rules || {};

  const totalWeight = holdings.reduce((a, h) => a + (h.weight || 0), 0);
  const portReturn = totalWeight ? holdings.reduce((a, h) => a + (h.weight || 0) * (h.returnSinceEntry ?? 0), 0) / totalWeight : null;
  const aiWeight = holdings.filter((h) => h.aiCapex).reduce((a, h) => a + (h.weight || 0), 0);
  const techWeight = holdings.filter((h) => h.sector === "Technology").reduce((a, h) => a + (h.weight || 0), 0);
  const flagged = holdings.filter((h) => (h.flags || []).length > 0);

  const sectorWeights = Object.entries(
    holdings.reduce((acc, h) => { acc[h.sector] = (acc[h.sector] || 0) + (h.weight || 0); return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const views = [
    { id: "holdings", label: "Holdings" },
    { id: "rules", label: "Rules" },
    { id: "bench", label: "Bench" },
    { id: "13f", label: "13F" },
    { id: "log", label: "Log" },
  ];

  const byWeight = [...holdings].sort((a, b) => b.weight - a.weight || b.score - a.score || a.ticker.localeCompare(b.ticker));
  const structure = data.structure || {};
  const target = structure.target || { core: 70, growth: 30 };
  const sleeves = [
    { id: "core", label: "Core", sub: "durability 4+, 3–5 year rubric", items: byWeight.filter((h) => h.sleeve === "core") },
    { id: "growth", label: "Growth", sub: "2–3% each, momentum rubric, hard triggers", items: byWeight.filter((h) => h.sleeve === "growth") },
  ];
  const sleeveWeight = (id) => holdings.filter((h) => h.sleeve === id).reduce((a, h) => a + (h.weight || 0), 0);
  const portfolioFlags = data.portfolioFlags || [];

  return (
    <>
      <div style={s.meta}>
        Model portfolio, {holdings.length} names, inception {fmtDate(data.inceptionDate)}.
        {data.priceDate && ` Prices as of ${fmtDate(data.priceDate)}.`}
        {data.asOf && ` Scores as of ${fmtDate(data.asOf)}.`}
      </div>

      <div style={{ ...s.card, display: "flex", gap: 12 }}>
        <div style={s.stat}><div style={s.statLabel}>Since inception</div><div style={s.statValue(trendColor(portReturn))}>{pct(portReturn)}</div></div>
        <div style={s.stat}><div style={s.statLabel}>Core / Growth</div><div style={s.statValue()}>{sleeveWeight("core")}<span style={{ color: palette.textMuted }}>/</span>{sleeveWeight("growth")}</div></div>
        <div style={s.stat}><div style={s.statLabel}>Tech</div><div style={s.statValue()}>{techWeight}%</div></div>
        <div style={s.stat}><div style={s.statLabel}>AI capex</div><div style={s.statValue(aiWeight > 50 ? palette.danger : palette.text)}>{aiWeight}%</div></div>
      </div>

      <div style={s.note}>Model for advisor reference. Every name goes through the firm's research and compliance review before it is considered for any client account.</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {views.map((v) => (
          <button key={v.id} style={s.pill(view === v.id)} onClick={() => { setView(v.id); setOpen(null); }}>{v.label}</button>
        ))}
      </div>

      {view === "holdings" && (
        <>
          {portfolioFlags.length > 0 && (
            <div style={{ ...s.note, color: palette.danger, borderColor: palette.danger + "66", background: palette.danger + "14" }}>{portfolioFlags.join(" · ")}</div>
          )}
          {flagged.length > 0 && (
            <div style={s.card}>
              <div style={s.sectionTitle}><span>On review</span><span style={s.count}>{flagged.length}</span></div>
              {flagged.map((h) => <Row key={h.ticker} h={h} open={open === h.ticker} onToggle={() => toggle(h.ticker)} />)}
            </div>
          )}
          {sleeves.map(({ id, label, sub, items }) => {
            const w = items.reduce((a, h) => a + h.weight, 0);
            const openSlots = structure.openSlots?.[id] || 0;
            return (
              <div key={id} style={s.card}>
                <div style={s.sectionTitle}>
                  <span>{label} <span style={{ fontFamily: fonts.body, fontSize: "0.66rem", fontWeight: 400, color: palette.textMuted }}>{sub}</span></span>
                  <span style={s.count}>{items.length} · {w}% <span style={{ color: palette.borderLight }}>of {target[id]}</span></span>
                </div>
                {items.map((h) => <Row key={h.ticker} h={h} open={open === h.ticker} onToggle={() => toggle(h.ticker)} />)}
                {openSlots > 0 && (
                  <div style={{ ...s.empty, fontStyle: "italic" }}>{openSlots} open slot{openSlots > 1 ? "s" : ""}. {structure.note}</div>
                )}
                {id === "growth" && structure.growthSleeveDrawdown != null && (
                  <div style={{ marginTop: 6, fontFamily: fonts.mono, fontSize: "0.66rem", color: palette.textMuted }}>
                    sleeve {pct(structure.growthSleeveReturn)} since entry · {pct(structure.growthSleeveDrawdown)} from high-water · trims at −20%
                  </div>
                )}
              </div>
            );
          })}
          <div style={s.card}>
            <div style={s.sectionTitle}><span>By sector</span></div>
            {sectorWeights.map(([sec, w]) => (
              <div key={sec} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "0.76rem", color: palette.textDim }}>
                <span>{sec}</span><span style={{ fontFamily: fonts.mono }}>{w}%</span>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "rules" && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>How the list is run</span></div>
          {RULE_ORDER.map((k) => rules[k] && (
            <div key={k}>
              <div style={s.ruleHead}>{RULE_LABEL[k] || k}</div>
              <div style={s.rule}>{rules[k]}</div>
            </div>
          ))}
        </div>
      )}

      {view === "bench" && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>Bench</span><span style={s.count}>{bench.length}</span></div>
          {bench.length === 0 && <div style={s.empty}>Nothing on the bench.</div>}
          {bench.map((b) => <BenchRow key={b.ticker} b={b} />)}
        </div>
      )}

      {view === "13f" && <ThirteenF holdings={holdings} bench={bench} />}

      {view === "log" && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>Changes</span><span style={s.count}>{log.length}</span></div>
          {log.map((e, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: i < log.length - 1 ? `1px solid ${palette.border}` : "none", fontSize: "0.76rem", color: palette.textDim, lineHeight: 1.5 }}>
              <div style={{ fontFamily: fonts.mono, fontSize: "0.66rem", color: palette.textMuted }}>{fmtDate(e.date)}</div>
              <div>{e.action}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
