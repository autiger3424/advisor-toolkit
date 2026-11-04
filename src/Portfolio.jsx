/* ────────────────────────────────────────────────────────────────
   PORTFOLIO — Advisor Toolkit module

   Renders src/data/model-portfolio.json: a 25-name model built from
   the weekly Ideas list with a five-factor score (quality, growth,
   valuation, estimate momentum, durability; 18/25 is the bar).

   Views:
     Holdings  — every name with weight, score, Zacks Rank and return
                 since entry; tap a row for the factor breakdown, the
                 thesis and the sell trigger.
     Rules     — the scoring, construction, sizing and review cadence,
                 kept here so the method travels with the list.
     Bench     — names that score well but are kept out, and why.
     Log       — every change since inception.

   Prices and factor inputs refresh on Sundays (scripts/score-portfolio.mjs);
   Zacks Rank and durability are set by hand in reviews. Membership
   changes are decided monthly; hard triggers act the week they fire.
──────────────────────────────────────────────────────────────── */

import { useState } from "react";
import data from "./data/model-portfolio.json";

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
const tierColor = { A: palette.accent, B: palette.textDim, C: palette.textMuted };

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
            {h.zacksRank && <span>Zacks {h.zacksRank} {RANK_LABEL[h.zacksRank]}</span>}
            {h.aiCapex && <span style={{ color: palette.warn }}>AI capex</span>}
            {h.nextEarnings && <span>earnings {fmtDate(h.nextEarnings)}</span>}
          </div>
          {(h.pe != null || h.peg != null || h.roic != null || h.fwdEpsGrowth != null) && (
            <div style={{ display: "flex", gap: 14, marginTop: 4, fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.textMuted, flexWrap: "wrap" }}>
              {h.fwdEpsGrowth != null && <span>EPS <span style={{ color: trendColor(h.fwdEpsGrowth) }}>{pct(h.fwdEpsGrowth, 0)}</span>/yr</span>}
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
        <div><span style={{ color: palette.textMuted }}>Kept out by:</span> {b.keptOutBy}</div>
        <div><span style={{ color: palette.textMuted }}>Moves in on:</span> {b.wouldMoveIn}</div>
      </div>
    </div>
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
  const avgScore = holdings.length ? holdings.reduce((a, h) => a + h.score, 0) / holdings.length : null;

  const sectorWeights = Object.entries(
    holdings.reduce((acc, h) => { acc[h.sector] = (acc[h.sector] || 0) + (h.weight || 0); return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const views = [
    { id: "holdings", label: "Holdings" },
    { id: "rules", label: "Rules" },
    { id: "bench", label: "Bench" },
    { id: "log", label: "Log" },
  ];

  const byWeight = [...holdings].sort((a, b) => b.weight - a.weight || b.score - a.score || a.ticker.localeCompare(b.ticker));
  const tierGroups = ["A", "B", "C"].map((t) => ({ tier: t, items: byWeight.filter((h) => h.tier === t) }));

  return (
    <>
      <div style={s.meta}>
        Model portfolio, {holdings.length} names, inception {fmtDate(data.inceptionDate)}.
        {data.priceDate && ` Prices as of ${fmtDate(data.priceDate)}.`}
        {data.asOf && ` Scores as of ${fmtDate(data.asOf)}.`}
      </div>

      <div style={{ ...s.card, display: "flex", gap: 12 }}>
        <div style={s.stat}><div style={s.statLabel}>Since inception</div><div style={s.statValue(trendColor(portReturn))}>{pct(portReturn)}</div></div>
        <div style={s.stat}><div style={s.statLabel}>Avg score</div><div style={s.statValue()}>{avgScore?.toFixed(1)}</div></div>
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
          {flagged.length > 0 && (
            <div style={s.card}>
              <div style={s.sectionTitle}><span>On review</span><span style={s.count}>{flagged.length}</span></div>
              {flagged.map((h) => <Row key={h.ticker} h={h} open={open === h.ticker} onToggle={() => toggle(h.ticker)} />)}
            </div>
          )}
          {tierGroups.map(({ tier, items }) => (
            <div key={tier} style={s.card}>
              <div style={s.sectionTitle}>
                <span>Tier {tier}{tier === "C" ? " · reduced and cyclical" : ""}</span>
                <span style={s.count}>{items.length} · {items.reduce((a, h) => a + h.weight, 0)}%</span>
              </div>
              {items.map((h) => <Row key={h.ticker} h={h} open={open === h.ticker} onToggle={() => toggle(h.ticker)} />)}
            </div>
          ))}
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
          {["scoring", "construction", "sizing", "cadence", "data"].map((k) => rules[k] && (
            <div key={k}>
              <div style={s.ruleHead}>{k}</div>
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
