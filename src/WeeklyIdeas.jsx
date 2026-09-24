/* ────────────────────────────────────────────────────────────────
   WEEKLY IDEAS — Advisor Toolkit module

   Renders src/data/weekly-ideas.json: a 40–50 name idea list that
   covers every sector plus an AI momentum sleeve. The JSON is
   rewritten every Sunday night by .github/workflows/weekly-screen.yml
   (see scripts/screen.mjs). Ideas only — everything here still goes
   through the firm's own screeners before it touches a client account.
──────────────────────────────────────────────────────────────── */

import { useState } from "react";
import ideas from "./data/weekly-ideas.json";

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

const TAG = {
  New: { color: palette.success, label: "New" },
  Hold: { color: palette.textDim, label: "Hold" },
  Watch: { color: palette.warn, label: "Watch" },
  Removed: { color: palette.danger, label: "Removed" },
};

const RANK_LABEL = { 1: "Strong Buy", 2: "Buy", 3: "Hold", 4: "Sell", 5: "Strong Sell" };

const SECTOR_ORDER = [
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

const s = {
  pill: (active, color) => ({
    padding: "5px 12px",
    borderRadius: 16,
    border: `1px solid ${active ? (color || palette.accent) : palette.border}`,
    background: active ? (color || palette.accent) : "transparent",
    color: active ? (color ? "#fff" : palette.bg) : palette.textDim,
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: fonts.body,
    whiteSpace: "nowrap",
  }),
  card: { background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.display, fontSize: "0.9rem", fontWeight: 700, color: palette.accent, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${palette.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  count: { fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.textMuted, fontWeight: 400 },
  badge: (color) => ({ display: "inline-block", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", color, background: color + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontFamily: fonts.body, whiteSpace: "nowrap" }),
  meta: { fontSize: "0.72rem", color: palette.textMuted, lineHeight: 1.5, marginBottom: 12 },
  note: { background: palette.accentDim, border: `1px solid ${palette.accent}44`, borderRadius: 8, padding: "10px 12px", fontSize: "0.72rem", color: palette.warn, marginBottom: 14, lineHeight: 1.5 },
  empty: { fontSize: "0.78rem", color: palette.textMuted, padding: "10px 0", lineHeight: 1.5 },
};

const pct = (n, digits = 0) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`);
const trendColor = (n) => (n == null ? palette.textMuted : n >= 0 ? palette.success : palette.danger);

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function Row({ h, open, onToggle, showSector }) {
  const tag = TAG[h.tag] || TAG.Hold;
  const rankColor = h.zacksRank <= 2 ? palette.accent : h.zacksRank >= 4 ? palette.danger : palette.textMuted;
  const days = daysUntil(h.nextEarnings);
  const earningsSoon = days != null && days >= 0 && days <= 10;

  return (
    <div onClick={onToggle} style={{ padding: "9px 0", borderBottom: `1px solid ${palette.border}`, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 54, flexShrink: 0 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: "0.9rem", fontWeight: 500, color: palette.text }}>{h.ticker}</div>
          {h.zacksRank && (
            <div style={{ fontSize: "0.58rem", color: rankColor, fontWeight: 700, letterSpacing: "0.04em" }}>ZR {h.zacksRank}</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8rem", color: palette.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>
          <div style={{ fontSize: "0.66rem", color: palette.textMuted }}>
            {showSector ? h.sector : h.sleeve === "ai" ? "AI sleeve" : h.sector}
            {earningsSoon && <span style={{ color: palette.warn, marginLeft: 6 }}>reports {fmtDate(h.nextEarnings)}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: "0.8rem", color: trendColor(h.vs200) }}>{pct(h.vs200, 1)}</div>
          <div style={{ fontSize: "0.58rem", color: palette.textMuted }}>vs 200-day</div>
        </div>
        <span style={s.badge(tag.color)}>{tag.label}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8, marginLeft: 64, fontSize: "0.74rem", color: palette.textDim, lineHeight: 1.55 }}>
          <div>{h.reason}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 6, fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.textMuted, flexWrap: "wrap" }}>
            <span>52-wk <span style={{ color: trendColor(h.ret52w) }}>{pct(h.ret52w)}</span></span>
            {h.ret12w != null && <span>12-wk <span style={{ color: trendColor(h.ret12w) }}>{pct(h.ret12w)}</span></span>}
            {h.zacksRank && <span>Zacks {h.zacksRank} {RANK_LABEL[h.zacksRank]}</span>}
            {h.price != null && <span>${h.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
            {h.nextEarnings && <span>earnings {fmtDate(h.nextEarnings)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, items, open, toggle, showSector, emptyText }) {
  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>
        <span>{title}</span>
        <span style={s.count}>{items.length}</span>
      </div>
      {items.length === 0 && <div style={s.empty}>{emptyText}</div>}
      {items.map((h) => (
        <Row key={h.ticker} h={h} open={open === h.ticker} onToggle={() => toggle(h.ticker)} showSector={showSector} />
      ))}
    </div>
  );
}

export default function WeeklyIdeas() {
  const [view, setView] = useState("all");
  const [open, setOpen] = useState(null);
  const toggle = (t) => setOpen((p) => (p === t ? null : t));

  const holdings = ideas.holdings || [];
  const removed = ideas.removed || [];
  const ai = holdings.filter((h) => h.sleeve === "ai");
  const core = holdings.filter((h) => h.sleeve !== "ai");
  const byTag = (t) => holdings.filter((h) => h.tag === t);
  const upcoming = holdings
    .filter((h) => { const d = daysUntil(h.nextEarnings); return d != null && d >= 0 && d <= 14; })
    .sort((a, b) => a.nextEarnings.localeCompare(b.nextEarnings));

  const sectors = SECTOR_ORDER.map((sec) => ({ sec, items: core.filter((h) => h.sector === sec) }));

  const views = [
    { id: "all", label: "All" },
    { id: "changes", label: "This Week" },
    { id: "ai", label: "AI Sleeve" },
    { id: "sectors", label: "By Sector" },
  ];

  return (
    <>
      <div style={s.meta}>
        Week of {fmtDate(ideas.asOf)}, {ideas.asOf?.slice(0, 4)}. {holdings.length} ideas across {sectors.filter((x) => x.items.length).length} sectors plus a {ai.length}-name AI sleeve.
        {ideas.priceDate && ` Prices as of ${fmtDate(ideas.priceDate)}.`}
      </div>

      <div style={s.note}>Idea list only. Every name still runs through the firm's screeners and compliance review before it is considered for any client account.</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {views.map((v) => (
          <button key={v.id} style={s.pill(view === v.id)} onClick={() => { setView(v.id); setOpen(null); }}>{v.label}</button>
        ))}
      </div>

      {view === "changes" && (
        <>
          <Group title="Added" items={byTag("New")} open={open} toggle={toggle} showSector emptyText="No new names this week." />
          <Group title="Watch" items={byTag("Watch")} open={open} toggle={toggle} showSector emptyText="Nothing on watch." />
          <Group title="Removed" items={removed} open={open} toggle={toggle} showSector emptyText="No removals this week." />
          {upcoming.length > 0 && (
            <Group title="Earnings in the next two weeks" items={upcoming} open={open} toggle={toggle} showSector />
          )}
          {ideas.sectorsEmpty?.length > 0 && (
            <div style={{ ...s.empty, padding: "0 2px" }}>
              No names currently pass the screen in: {ideas.sectorsEmpty.join(", ")}. The slot stays open rather than being force-filled.
            </div>
          )}
        </>
      )}

      {view === "ai" && (
        <Group title="AI momentum sleeve" items={ai} open={open} toggle={toggle} showSector emptyText="No AI names pass this week." />
      )}

      {view === "sectors" && sectors.map(({ sec, items }) => (
        <Group key={sec} title={sec} items={items} open={open} toggle={toggle} emptyText="Nothing passes the screen in this sector right now." />
      ))}

      {view === "all" && (
        <Group title="Full list" items={[...holdings].sort((a, b) => a.ticker.localeCompare(b.ticker))} open={open} toggle={toggle} showSector />
      )}
    </>
  );
}
