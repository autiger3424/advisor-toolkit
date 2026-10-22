/* ────────────────────────────────────────────────────────────────
   MARKET BRIEF — Advisor Toolkit module

   Renders the weekday market briefs written by two scheduled tasks:
     Morning   — 7:45 am CT, pre-market, with the 7:30 data prints
     Afternoon — 3:20 pm CT, post-close, with after-hours and tomorrow
   Data: src/data/market-briefs.json, newest first, last 15 trading
   days (scripts/add-brief.mjs rolls older days off).
   Market commentary only — not investment advice.
──────────────────────────────────────────────────────────────── */

import { useState } from "react";
import briefFile from "./data/market-briefs.json";

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

const SESSION = {
  morning: { label: "Pre-market", short: "AM", color: palette.warn },
  afternoon: { label: "Post-close", short: "PM", color: palette.accent },
};

const s = {
  pill: (active) => ({
    padding: "5px 12px", borderRadius: 16, border: `1px solid ${active ? palette.accent : palette.border}`,
    background: active ? palette.accent : "transparent", color: active ? palette.bg : palette.textDim,
    fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", fontFamily: fonts.body, whiteSpace: "nowrap",
  }),
  card: { background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.display, fontSize: "0.9rem", fontWeight: 700, color: palette.accent, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${palette.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  sub: { fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: palette.textMuted, fontWeight: 700, margin: "12px 0 6px" },
  badge: (color) => ({ display: "inline-block", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", color, background: color + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontFamily: fonts.body, whiteSpace: "nowrap" }),
  meta: { fontSize: "0.72rem", color: palette.textMuted, lineHeight: 1.5, marginBottom: 12 },
  note: { background: palette.accentDim, border: `1px solid ${palette.accent}44`, borderRadius: 8, padding: "10px 12px", fontSize: "0.72rem", color: palette.warn, marginBottom: 14, lineHeight: 1.5 },
  empty: { fontSize: "0.78rem", color: palette.textMuted, padding: "10px 0", lineHeight: 1.5 },
  headline: { fontFamily: fonts.display, fontSize: "1rem", fontWeight: 700, color: palette.text, lineHeight: 1.4, margin: "6px 0 10px" },
  bullet: { fontSize: "0.78rem", color: palette.textDim, lineHeight: 1.55, paddingLeft: 12, position: "relative", marginBottom: 5 },
  mono: { fontFamily: fonts.mono, fontSize: "0.74rem" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "5px 0", borderBottom: `1px solid ${palette.border}` },
};

function fmtDate(iso, opts = { weekday: "short", month: "short", day: "numeric" }) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts);
}

function fmtTime(isoTs) {
  if (!isoTs) return "";
  return new Date(isoTs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

const moveColor = (str) => {
  if (str == null) return palette.textMuted;
  const t = String(str).trim();
  if (t.startsWith("+")) return palette.success;
  if (t.startsWith("-") || t.startsWith("−")) return palette.danger;
  return palette.text;
};

function Bullets({ items }) {
  if (!items?.length) return null;
  return items.map((b, i) => (
    <div key={i} style={s.bullet}>
      <span style={{ position: "absolute", left: 0, color: palette.accent }}>·</span>
      {b}
    </div>
  ));
}

function Levels({ items }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {items.map((l, i) => (
        <div key={i} style={{ background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: "0.58rem", color: palette.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</div>
          <div style={{ ...s.mono, color: palette.text, fontSize: "0.82rem", marginTop: 2 }}>{l.value}</div>
          {l.change && <div style={{ ...s.mono, color: moveColor(l.change), fontSize: "0.68rem" }}>{l.change}</div>}
        </div>
      ))}
    </div>
  );
}

function DataPrints({ items }) {
  if (!items?.length) return null;
  return items.map((d, i) => (
    <div key={i} style={{ padding: "7px 0", borderBottom: `1px solid ${palette.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: "0.8rem", color: palette.text, fontWeight: 600 }}>{d.name}</span>
        {d.read && <span style={s.badge(palette.accent)}>{d.read}</span>}
      </div>
      <div style={{ ...s.mono, color: palette.textDim, marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>act <span style={{ color: palette.text }}>{d.actual ?? "—"}</span></span>
        <span>est <span style={{ color: palette.textMuted }}>{d.consensus ?? "—"}</span></span>
        {d.prior && <span>prior <span style={{ color: palette.textMuted }}>{d.prior}</span></span>}
      </div>
      {d.reaction && <div style={{ fontSize: "0.72rem", color: palette.textMuted, marginTop: 3 }}>{d.reaction}</div>}
    </div>
  ));
}

function Tickers({ items }) {
  if (!items?.length) return null;
  return items.map((m, i) => (
    <div key={i} style={{ padding: "7px 0", borderBottom: `1px solid ${palette.border}`, display: "flex", gap: 10, alignItems: "baseline" }}>
      <span style={{ ...s.mono, color: palette.text, width: 54, flexShrink: 0, fontSize: "0.85rem" }}>{m.ticker}</span>
      <span style={{ ...s.mono, color: moveColor(m.move), width: 54, flexShrink: 0 }}>{m.move || ""}</span>
      <span style={{ fontSize: "0.74rem", color: palette.textDim, lineHeight: 1.45, flex: 1 }}>{m.why}</span>
    </div>
  ));
}

function Calendar({ items }) {
  if (!items?.length) return null;
  return items.map((c, i) => (
    <div key={i} style={s.row}>
      <span style={{ ...s.mono, color: palette.textMuted, width: 62, flexShrink: 0 }}>{c.time}</span>
      <span style={{ fontSize: "0.76rem", color: palette.text, flex: 1 }}>{c.item}</span>
      {c.consensus && <span style={{ ...s.mono, color: palette.textMuted }}>{c.consensus}</span>}
    </div>
  ));
}

function Brief({ b, compact, onToggle }) {
  const ses = SESSION[b.session] || SESSION.morning;
  const isAM = b.session === "morning";
  return (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={s.badge(ses.color)}>{ses.label}</span>
          <span style={{ fontSize: "0.7rem", color: palette.textMuted }}>{fmtDate(b.date)}{b.generatedAt ? ` · ${fmtTime(b.generatedAt)} CT` : ""}</span>
        </div>
        {onToggle && <span style={{ color: palette.textMuted, fontSize: "0.8rem" }}>{compact ? "▸" : "▾"}</span>}
      </div>
      <div style={s.headline}>{b.headline}</div>

      {!compact && (
        <>
          {isAM && b.data?.length > 0 && (<><div style={s.sub}>7:30 data</div><DataPrints items={b.data} /></>)}
          {isAM && b.data?.length === 0 && (<div style={{ ...s.empty, padding: "2px 0" }}>No 7:30 releases today.</div>)}

          <div style={s.sub}>{isAM ? "Futures & levels" : "Close & levels"}</div>
          <Levels items={b.levels} />

          <div style={s.sub}>{isAM ? "What's driving it" : "What decided it"}</div>
          <Bullets items={b.drivers} />

          {!isAM && b.sectors && (
            <>
              <div style={s.sub}>Sectors</div>
              <div style={{ fontSize: "0.76rem", color: palette.textDim, lineHeight: 1.5 }}>
                {typeof b.sectors === "string" ? b.sectors : (
                  <>
                    <span style={{ color: palette.success }}>▲</span> {b.sectors.leaders}
                    <span style={{ margin: "0 8px", color: palette.textMuted }}>·</span>
                    <span style={{ color: palette.danger }}>▼</span> {b.sectors.laggards}
                  </>
                )}
              </div>
            </>
          )}

          {!isAM && b.afterHours?.length > 0 && (<><div style={s.sub}>After hours</div><Tickers items={b.afterHours} /></>)}

          {b.calendar?.length > 0 && (<><div style={s.sub}>{isAM ? "Rest of today" : "Tomorrow"}</div><Calendar items={b.calendar} /></>)}

          {b.movers?.length > 0 && (<><div style={s.sub}>Movers to know</div><Tickers items={b.movers} /></>)}

          {b.sources?.length > 0 && (
            <>
              <div style={s.sub}>Sources</div>
              <div style={{ fontSize: "0.68rem", lineHeight: 1.6 }}>
                {b.sources.map((src, i) => (
                  <span key={i}>
                    {i > 0 && <span style={{ color: palette.textMuted }}> · </span>}
                    <a href={src.url} target="_blank" rel="noreferrer" style={{ color: palette.textDim, textDecoration: "none", borderBottom: `1px dotted ${palette.textMuted}` }}>{src.title}</a>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function latestBrief() {
  return (briefFile.briefs || [])[0] || null;
}

export default function MarketBrief() {
  const [view, setView] = useState("today");
  const [open, setOpen] = useState(null);
  const briefs = briefFile.briefs || [];

  if (briefs.length === 0) {
    return (
      <>
        <div style={s.note}>Market commentary only. Not investment advice, not a recommendation for any client account.</div>
        <div style={s.empty}>No briefs yet. The morning brief lands weekdays around 7:45 am CT and the afternoon brief around 3:20 pm CT; the first one fills this in.</div>
      </>
    );
  }

  const latestDate = briefs[0].date;
  const today = briefs.filter((b) => b.date === latestDate);
  const dates = [...new Set(briefs.map((b) => b.date))];
  const byDate = (d) => briefs.filter((b) => b.date === d);

  return (
    <>
      <div style={s.note}>Market commentary only. Not investment advice, not a recommendation for any client account.</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        <button style={s.pill(view === "today")} onClick={() => setView("today")}>Latest</button>
        <button style={s.pill(view === "history")} onClick={() => setView("history")}>Last {dates.length} day{dates.length === 1 ? "" : "s"}</button>
      </div>

      {view === "today" && (
        <>
          <div style={s.meta}>{fmtDate(latestDate, { weekday: "long", month: "long", day: "numeric" })}{today.length === 1 ? ` · ${SESSION[today[0].session].label.toLowerCase()} only so far` : ""}</div>
          {today.map((b) => <Brief key={b.id} b={b} />)}
        </>
      )}

      {view === "history" && dates.map((d) => (
        <div key={d}>
          <div style={{ ...s.sub, color: palette.accent, marginTop: 4 }}>{fmtDate(d, { weekday: "long", month: "short", day: "numeric" })}</div>
          {byDate(d).map((b) => (
            <Brief key={b.id} b={b} compact={open !== b.id} onToggle={() => setOpen((p) => (p === b.id ? null : b.id))} />
          ))}
        </div>
      ))}
    </>
  );
}
