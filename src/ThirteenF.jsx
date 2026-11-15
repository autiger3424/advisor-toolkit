/* ────────────────────────────────────────────────────────────────
   13F — Advisor Toolkit module

   Renders the quarterly 13F sweeps in src/data/13f/<year>-q<q>.json
   (written by scripts/sweep-13f.mjs from SEC EDGAR). Year and quarter
   are clickable; the latest quarter opens by default.

   Views:
     Summary — who filed, what the tracked funds bought and sold as a
               group, and the overlap with our holdings and bench.
     Funds   — one card per manager: book size and change, positions,
               top-10 concentration, turnover, the quarter's moves;
               tap a card for the full bought / sold lists and options.
     Names   — pick a ticker from the book and see buyers vs sellers
               and top-10 holders quarter by quarter.

   Positions are as of quarter end and ~45 days stale when public.
   Information for advisor use; every name goes through the firm's
   research before any client sees it.
──────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import portfolio from "./data/model-portfolio.json";
import fundList from "./data/13f-funds.json";

// Every quarter file on disk, newest first. The directory always exists
// (index.json and cusips.json live there), so an empty match is a clean
// empty state rather than a build error.
const ctx = require.context("./data/13f", false, /^\.\/\d{4}-q[1-4]\.json$/);
const QUARTERS = ctx.keys().map((k) => ctx(k)).sort((a, b) => b.quarter.year - a.quarter.year || b.quarter.quarter - a.quarter.quarter);

const palette = {
  bg: "#0B1120", card: "#111827", border: "#1e293b", borderLight: "#334155",
  accent: "#C9A84C", accentDim: "rgba(201,168,76,0.15)",
  text: "#e2e8f0", textDim: "#94a3b8", textMuted: "#64748b",
  success: "#4ade80", warn: "#fbbf24", danger: "#ef4444",
};
const fonts = {
  display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  body: "'Source Sans 3', 'Segoe UI', Tahoma, sans-serif",
  mono: "'DM Mono', 'Courier New', monospace",
};
const s = {
  pill: (active, disabled) => ({
    padding: "5px 12px", borderRadius: 16, border: `1px solid ${active ? palette.accent : palette.border}`,
    background: active ? palette.accent : "transparent", color: disabled ? palette.borderLight : active ? palette.bg : palette.textDim,
    fontSize: "0.7rem", fontWeight: 600, cursor: disabled ? "default" : "pointer", fontFamily: fonts.body, whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
  }),
  card: { background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.display, fontSize: "0.9rem", fontWeight: 700, color: palette.accent, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${palette.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  count: { fontFamily: fonts.mono, fontSize: "0.68rem", color: palette.textMuted, fontWeight: 400 },
  badge: (color) => ({ display: "inline-block", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", color, background: color + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontFamily: fonts.body, whiteSpace: "nowrap", marginLeft: 6 }),
  meta: { fontSize: "0.72rem", color: palette.textMuted, lineHeight: 1.5, marginBottom: 12 },
  note: { background: palette.accentDim, border: `1px solid ${palette.accent}44`, borderRadius: 8, padding: "10px 12px", fontSize: "0.72rem", color: palette.warn, marginBottom: 14, lineHeight: 1.5 },
  empty: { fontSize: "0.78rem", color: palette.textMuted, padding: "10px 0", lineHeight: 1.5 },
  stat: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: "0.56rem", letterSpacing: "0.08em", textTransform: "uppercase", color: palette.textMuted },
  statValue: (color) => ({ fontFamily: fonts.mono, fontSize: "1rem", color: color || palette.text, marginTop: 2 }),
  ruleHead: { fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: palette.accent, fontWeight: 700, marginTop: 10, marginBottom: 3 },
  row: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "0.74rem", color: palette.textDim, borderBottom: `1px solid ${palette.border}` },
  chip: (gold) => ({ fontFamily: fonts.mono, fontSize: "0.68rem", color: gold ? palette.accent : palette.textDim, background: palette.bg, border: `1px solid ${gold ? palette.accent + "66" : palette.border}`, borderRadius: 4, padding: "2px 6px" }),
};

const bn = (n) => (n == null ? "—" : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${Math.round(n).toLocaleString("en-US")}`);
const pct = (n, d = 0) => (n == null ? "—" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(d)}%`);
const ACTION_COLOR = { new: palette.success, add: palette.success, trim: palette.warn, exit: palette.danger };
const ACTION_LABEL = { new: "NEW", add: "ADD", trim: "TRIM", exit: "EXIT" };
const fmtDate = (iso) => { if (!iso) return null; const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const qlabel = (q) => `Q${q.quarter} ${q.year}`;
const isDebt = (sym) => /-DEBT$/.test(sym);
const showSym = (sym) => (isDebt(sym) ? sym.replace(/-DEBT$/, " notes") : /^[0-9A-Z]{9}$/.test(sym) && /\d/.test(sym) ? "CUSIP " + sym : sym);

const held = new Map(portfolio.holdings.map((h) => [h.ticker.replace(".", "-"), h]));
const benched = new Set((portfolio.bench || []).map((b) => b.ticker.replace(".", "-")));
const inBook = (sym) => (held.has(sym) ? held.get(sym).sleeve : benched.has(sym) ? "bench" : null);

function Tag({ children, color }) { return <span style={s.badge(color)}>{children}</span>; }

function MoveLine({ m }) {
  const book = inBook(m.symbol);
  return (
    <div style={s.row}>
      <span><span style={{ fontFamily: fonts.mono, color: book ? palette.accent : palette.text }}>{showSym(m.symbol)}</span> <span style={{ color: palette.textMuted }}>{m.name?.slice(0, 28)}</span>{book && <Tag color={palette.accent}>{book}</Tag>}</span>
      <span style={{ fontFamily: fonts.mono, fontSize: "0.66rem", whiteSpace: "nowrap" }}>
        <span style={{ color: ACTION_COLOR[m.action] }}>{ACTION_LABEL[m.action]}</span>
        {m.change != null && m.action !== "exit" && <span style={{ color: palette.textMuted }}> {pct(m.change)}</span>}
        <span style={{ color: palette.textMuted }}> · {m.action === "exit" ? `was ${bn(m.priorValue)}` : bn(m.value)}</span>
      </span>
    </div>
  );
}

function FundCard({ f, open, onToggle }) {
  const buys = f.moves.filter((m) => m.action === "new" || m.action === "add");
  const sells = f.moves.filter((m) => m.action === "trim" || m.action === "exit");
  const bookChg = f.prevTotalValue ? f.totalValue / f.prevTotalValue - 1 : null;
  return (
    <div style={s.card}>
      <div onClick={onToggle} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: fonts.display, fontSize: "0.9rem", fontWeight: 700, color: palette.text }}>{f.name}</div>
            <div style={{ fontSize: "0.66rem", color: palette.textMuted }}>{f.style}{f.filingDate ? ` · filed ${fmtDate(f.filingDate)}` : ""}{f.amendments ? ` · ${f.amendments} amendment${f.amendments > 1 ? "s" : ""}` : ""}</div>
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: "0.7rem", color: palette.textMuted, textAlign: "right", whiteSpace: "nowrap" }}>
            <span style={{ color: palette.success }}>+{buys.length}</span> / <span style={{ color: palette.danger }}>−{sells.length}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <div style={s.stat}><div style={s.statLabel}>13F book</div><div style={s.statValue()}>{bn(f.totalValue)}{bookChg != null && <span style={{ fontSize: "0.66rem", color: bookChg >= 0 ? palette.success : palette.danger, marginLeft: 6 }}>{pct(bookChg)}</span>}</div></div>
          <div style={s.stat}><div style={s.statLabel}>Positions</div><div style={s.statValue()}>{f.positions}{f.prevPositions != null && <span style={{ fontSize: "0.66rem", color: palette.textMuted, marginLeft: 6 }}>was {f.prevPositions}</span>}</div></div>
          <div style={s.stat}><div style={s.statLabel}>Top 10</div><div style={s.statValue()}>{f.top10Pct != null ? `${Math.round(f.top10Pct * 100)}%` : "—"}</div></div>
          <div style={s.stat}><div style={s.statLabel}>Turnover</div><div style={s.statValue()}>{f.turnover != null ? `${Math.round(f.turnover * 100)}%` : "—"}</div></div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {f.top.slice(0, 10).map((t) => (
            <span key={t.symbol} style={s.chip(inBook(t.symbol))} title={t.name}>
              {showSym(t.symbol)} <span style={{ color: palette.textMuted }}>{t.pct != null ? `${(t.pct * 100).toFixed(0)}%` : ""}</span>
            </span>
          ))}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {[["Bought", buys], ["Sold", sells]].map(([label, list]) => list.length > 0 && (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={s.ruleHead}>{label}</div>
              {list.map((m) => <MoveLine key={m.symbol + m.action} m={m} />)}
            </div>
          ))}
          {buys.length + sells.length === 0 && <div style={s.empty}>No position moved more than 20% above the $20M line.</div>}
          {(f.options || []).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={s.ruleHead}>Options (not in the share diff)</div>
              {f.options.map((o, i) => (
                <div key={i} style={s.row}>
                  <span><span style={{ fontFamily: fonts.mono, color: inBook(o.symbol) ? palette.accent : palette.text }}>{showSym(o.symbol)}</span> <span style={{ color: palette.textMuted }}>{o.name?.slice(0, 28)}</span></span>
                  <span style={{ fontFamily: fonts.mono, fontSize: "0.66rem" }}><span style={{ color: o.type === "Put" ? palette.danger : palette.success }}>{o.type.toUpperCase()}</span><span style={{ color: palette.textMuted }}> · {bn(o.value)}</span></span>
                </div>
              ))}
            </div>
          )}
          {f.valuesScaled && <div style={{ fontSize: "0.64rem", color: palette.textMuted, marginTop: 4 }}>This filer reports values in thousands; scaled to dollars.</div>}
        </div>
      )}
    </div>
  );
}

function ConsensusList({ title, sub, rows, color, side }) {
  return (
    <div style={s.card}>
      <div style={s.sectionTitle}><span>{title}</span><span style={s.count}>{sub}</span></div>
      {rows.length === 0 && <div style={s.empty}>Nothing yet.</div>}
      {rows.map((c) => {
        const book = inBook(c.symbol);
        const main = side === "buys" ? c.buys : c.sells;
        return (
          <div key={c.symbol} style={{ padding: "6px 0", borderBottom: `1px solid ${palette.border}`, fontSize: "0.74rem", color: palette.textDim }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span><span style={{ fontFamily: fonts.mono, color: book ? palette.accent : palette.text }}>{showSym(c.symbol)}</span> <span style={{ color: palette.textMuted }}>{c.name?.slice(0, 30)}</span>{book && <Tag color={color}>{book}</Tag>}</span>
              <span style={{ fontFamily: fonts.mono, fontSize: "0.68rem", whiteSpace: "nowrap" }}>
                <span style={{ color: palette.success }}>{c.buys.length} buy{c.buys.length === 1 ? "" : "s"}</span>
                <span style={{ color: palette.textMuted }}> / </span>
                <span style={{ color: palette.danger }}>{c.sells.length} sell{c.sells.length === 1 ? "" : "s"}</span>
              </span>
            </div>
            <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 2 }}>{main.join(", ")}</div>
          </div>
        );
      })}
    </div>
  );
}

function Summary({ r }) {
  const consensus = r.consensus || [];
  const bought = consensus.filter((c) => c.score > 0).slice(0, 20);
  const sold = consensus.filter((c) => c.score < 0).sort((a, b) => a.score - b.score).slice(0, 15);
  const overlapH = (r.overlap?.holdings || []).slice().sort((a, b) => (b.buys.length - b.sells.length) - (a.buys.length - a.sells.length));
  const overlapB = r.overlap?.bench || [];
  const book = r.funds.reduce((a, f) => a + (f.totalValue || 0), 0);
  const opened = r.funds.reduce((a, f) => a + f.moves.filter((m) => m.action === "new").length, 0);
  const closed = r.funds.reduce((a, f) => a + f.moves.filter((m) => m.action === "exit").length, 0);
  return (
    <>
      <div style={{ ...s.card, display: "flex", gap: 12 }}>
        <div style={s.stat}><div style={s.statLabel}>Filed</div><div style={s.statValue()}>{r.funds.length}<span style={{ color: palette.textMuted, fontSize: "0.7rem" }}> / {r.funds.length + (r.missing || []).length}</span></div></div>
        <div style={s.stat}><div style={s.statLabel}>13F books</div><div style={s.statValue()}>{bn(book)}</div></div>
        <div style={s.stat}><div style={s.statLabel}>Opened / closed</div><div style={s.statValue()}><span style={{ color: palette.success }}>{opened}</span><span style={{ color: palette.textMuted }}> / </span><span style={{ color: palette.danger }}>{closed}</span></div></div>
        <div style={s.stat}><div style={s.statLabel}>Our names moved</div><div style={s.statValue(palette.accent)}>{overlapH.length + overlapB.length}</div></div>
      </div>

      {overlapH.length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>Our holdings they moved</span><span style={s.count}>{overlapH.length}</span></div>
          {overlapH.map((o) => (
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

      <ConsensusList title="Most bought" sub="2+ funds, net" rows={bought} color={palette.accent} side="buys" />

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

      <ConsensusList title="Most sold" sub="2+ funds, net" rows={sold} color={palette.danger} side="sells" />

      {(r.missing || []).length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}><span>Not yet filed</span><span style={s.count}>{r.missing.length}</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {r.missing.map((n) => <span key={n} style={{ fontSize: "0.66rem", color: palette.textDim, background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 4, padding: "2px 7px" }}>{n}</span>)}
          </div>
        </div>
      )}
    </>
  );
}

function Funds({ r }) {
  const [open, setOpen] = useState(null);
  const [sort, setSort] = useState("book");
  const sorted = useMemo(() => {
    const f = [...r.funds];
    if (sort === "book") f.sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));
    if (sort === "moves") f.sort((a, b) => b.moves.length - a.moves.length);
    if (sort === "turnover") f.sort((a, b) => (b.turnover || 0) - (a.turnover || 0));
    if (sort === "name") f.sort((a, b) => a.name.localeCompare(b.name));
    return f;
  }, [r, sort]);
  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.62rem", color: palette.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort</span>
        {[["book", "Book size"], ["moves", "Most moves"], ["turnover", "Turnover"], ["name", "Name"]].map(([id, label]) => (
          <button key={id} style={s.pill(sort === id)} onClick={() => setSort(id)}>{label}</button>
        ))}
        <span style={{ ...s.count, marginLeft: "auto" }}>tap a fund for its moves · gold = in our book</span>
      </div>
      {sorted.map((f) => <FundCard key={f.cik} f={f} open={open === f.cik} onToggle={() => setOpen((p) => (p === f.cik ? null : f.cik))} />)}
      {sorted.length === 0 && <div style={s.empty}>No fund has filed for this quarter yet.</div>}
    </>
  );
}

function Names() {
  const tickers = useMemo(() => [...portfolio.holdings.map((h) => h.ticker.replace(".", "-")), ...(portfolio.bench || []).map((b) => b.ticker.replace(".", "-"))], []);
  const [sym, setSym] = useState(tickers[0]);
  const [typed, setTyped] = useState("");
  const active = (typed.trim().toUpperCase() || sym);
  const history = QUARTERS.slice().reverse().map((r) => {
    const buys = [], sells = [], holders = (r.heldByFilers || {})[active] || [];
    for (const f of r.funds) for (const m of f.moves) if (m.symbol === active) (m.action === "new" || m.action === "add" ? buys : sells).push(`${f.name} (${m.action})`);
    return { q: r.quarter, buys, sells, holders };
  });
  const book = inBook(active);
  return (
    <>
      <div style={s.card}>
        <div style={s.sectionTitle}><span>Pick a name</span><span style={s.count}>holdings and bench, or type a ticker</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {tickers.map((t) => <button key={t} style={s.pill(active === t)} onClick={() => { setSym(t); setTyped(""); }}>{t}</button>)}
        </div>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Any ticker, e.g. INTC" style={{ background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 6, color: palette.text, padding: "6px 10px", fontFamily: fonts.mono, fontSize: "0.74rem", width: "100%", boxSizing: "border-box" }} />
      </div>
      <div style={s.card}>
        <div style={s.sectionTitle}><span><span style={{ fontFamily: fonts.mono }}>{active}</span>{book && <Tag color={palette.accent}>{book}</Tag>}</span><span style={s.count}>buyers / sellers among tracked funds, by quarter</span></div>
        {history.map((h) => (
          <div key={qlabel(h.q)} style={{ padding: "8px 0", borderBottom: `1px solid ${palette.border}`, fontSize: "0.74rem", color: palette.textDim }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.mono, color: palette.text }}>{qlabel(h.q)}</span>
              <span style={{ fontFamily: fonts.mono, fontSize: "0.7rem" }}>
                <span style={{ color: palette.success }}>+{h.buys.length}</span> / <span style={{ color: palette.danger }}>−{h.sells.length}</span>
                {h.holders.length > 0 && <span style={{ color: palette.textMuted }}> · top-10 at {h.holders.length}</span>}
              </span>
            </div>
            <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 2 }}>
              {h.buys.length > 0 && <span style={{ color: palette.success }}>{h.buys.join(", ")}</span>}
              {h.buys.length > 0 && h.sells.length > 0 && " · "}
              {h.sells.length > 0 && <span style={{ color: palette.danger }}>{h.sells.join(", ")}</span>}
              {h.buys.length + h.sells.length === 0 && "no move over the 20% / $20M line"}
            </div>
            {h.holders.length > 0 && <div style={{ fontSize: "0.66rem", color: palette.textMuted, marginTop: 2 }}>Top-10 holders: {h.holders.map((x) => `${x.fund} ${x.pct != null ? (x.pct * 100).toFixed(0) + "%" : ""}`).join(", ")}</div>}
          </div>
        ))}
        {history.length === 0 && <div style={s.empty}>No quarters on disk yet.</div>}
      </div>
    </>
  );
}

export default function ThirteenF() {
  const years = useMemo(() => [...new Set(QUARTERS.map((r) => r.quarter.year))].sort((a, b) => b - a), []);
  const [year, setYear] = useState(years[0]);
  const [quarter, setQuarter] = useState(QUARTERS[0]?.quarter.quarter);
  const [view, setView] = useState("summary");
  const r = QUARTERS.find((x) => x.quarter.year === year && x.quarter.quarter === quarter);
  const available = (y) => new Set(QUARTERS.filter((x) => x.quarter.year === y).map((x) => x.quarter.quarter));

  if (QUARTERS.length === 0) {
    return (
      <div style={s.card}>
        <div style={s.sectionTitle}><span>13F sweep</span><span style={s.count}>{fundList.funds.length} funds tracked</span></div>
        <div style={s.empty}>
          No quarters on disk yet. The sweep runs the morning after each 13F deadline (and again three days later for late filers), reads every tracked fund's filing from SEC EDGAR, and writes one file per quarter here. Year and quarter become clickable once the first one lands.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {fundList.funds.map((f) => <span key={f.cik} style={{ fontSize: "0.66rem", color: palette.textDim, background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 4, padding: "2px 7px" }}>{f.name}</span>)}
        </div>
      </div>
    );
  }

  const pickYear = (y) => { setYear(y); const av = available(y); if (!av.has(quarter)) setQuarter(Math.max(...av)); };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
        {years.map((y) => <button key={y} style={s.pill(year === y)} onClick={() => pickYear(y)}>{y}</button>)}
        <span style={{ width: 1, height: 18, background: palette.border, margin: "0 4px" }} />
        {[1, 2, 3, 4].map((q) => { const ok = available(year).has(q); return <button key={q} style={s.pill(quarter === q, !ok)} disabled={!ok} onClick={() => ok && setQuarter(q)}>Q{q}</button>; })}
      </div>

      {r && (
        <div style={s.meta}>
          13F filings for {qlabel(r.quarter)} (positions as of quarter end) vs {qlabel(r.priorQuarter)}, swept {fmtDate(r.asOf)} from {r.source}. {r.funds.length} of {r.funds.length + (r.missing || []).length} tracked funds filed. Moves are new / add (+20% shares) / trim (−20%) / exit, positions under $20M ignored; options are listed per fund and kept out of the share diff.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {[["summary", "Summary"], ["funds", "Funds"], ["names", "Names"]].map(([id, label]) => (
          <button key={id} style={s.pill(view === id)} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {r && view === "summary" && <Summary r={r} />}
      {r && view === "funds" && <Funds r={r} />}
      {view === "names" && <Names />}

      <div style={{ ...s.note, marginTop: 4 }}>For advisor reference. 13F positions are six weeks stale, exclude shorts and non-US holdings, and show a fund's long book only. Every name goes through the firm's research before any client sees it.</div>
    </>
  );
}
