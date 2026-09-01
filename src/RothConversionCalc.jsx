/* ────────────────────────────────────────────────────────────────
   ROTH CONVERSION WINDOW — Advisor Toolkit module
   Matches the toolkit palette (navy #0B1120 / gold #C9A84C) and fonts.

   HOW TO ADD TO YOUR APP (3 steps):

   1. Save this file as  src/RothConversionCalc.jsx

   2. In src/AdvisorToolkit.jsx, add at the top:
        import RothConversionCalc from "./RothConversionCalc";

   3. In the Calculators tab:
      a) Add to the calculator toggle array:
           { id: "roth", label: "Roth Conversion" }
      b) Add alongside the other calcMode sections:
           {calcMode === "roth" && <RothConversionCalc />}

   Data: 2026 brackets per IRS Rev. Proc. 2025-32; 2026 IRMAA tiers.
   Update the constants below each year.
──────────────────────────────────────────────────────────────── */

import { useState, useMemo } from "react";

const palette = {
  bg: "#0B1120",
  card: "#111827",
  accent: "#C9A84C",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  success: "#4ade80",
  warn: "#fbbf24",
  line: "#1f2937",
  input: "#0f172a",
};

// ─── 2026 tax data ──────────────────────────────────────────────
const YEAR = 2026;

const BRACKETS = {
  single: [
    { rate: 0.10, top: 12400 },
    { rate: 0.12, top: 50400 },
    { rate: 0.22, top: 105700 },
    { rate: 0.24, top: 201775 },
    { rate: 0.32, top: 256225 },
    { rate: 0.35, top: 640600 },
    { rate: 0.37, top: Infinity },
  ],
  mfj: [
    { rate: 0.10, top: 24800 },
    { rate: 0.12, top: 100800 },
    { rate: 0.22, top: 211400 },
    { rate: 0.24, top: 403550 },
    { rate: 0.32, top: 512450 },
    { rate: 0.35, top: 768700 },
    { rate: 0.37, top: Infinity },
  ],
  hoh: [
    { rate: 0.10, top: 17700 },
    { rate: 0.12, top: 67450 },
    { rate: 0.22, top: 105700 },
    { rate: 0.24, top: 201775 },
    { rate: 0.32, top: 256200 },
    { rate: 0.35, top: 640600 },
    { rate: 0.37, top: Infinity },
  ],
};

const STD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };
const AGE65_ADDON = { single: 2050, mfj: 1650, hoh: 2050 }; // per person

// 2026 IRMAA MAGI tiers (single & HoH share a table)
const IRMAA = {
  single: [109000, 137000, 171000, 205000, 500000],
  mfj: [218000, 274000, 342000, 410000, 750000],
};
const PART_B_MONTHLY = [202.90, 284.10, 405.80, 527.50, 649.20, 689.90];

const FILING = [
  { id: "single", label: "Single" },
  { id: "mfj", label: "MFJ" },
  { id: "hoh", label: "HoH" },
];

// ─── math ───────────────────────────────────────────────────────
const num = (v) => {
  const n = parseFloat(String(v).replace(/[,$\s]/g, ""));
  return isNaN(n) || n < 0 ? 0 : n;
};
const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n) => (n * 100).toFixed(1) + "%";

function ordinaryTax(taxable, status) {
  let tax = 0, prev = 0;
  for (const b of BRACKETS[status]) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, b.top) - prev) * b.rate;
    prev = b.top;
  }
  return tax;
}
function bracketOf(taxable, status) {
  for (const b of BRACKETS[status]) if (taxable <= b.top) return b;
  return BRACKETS[status].at(-1);
}
function irmaaTier(magi, status) {
  const t = IRMAA[status === "mfj" ? "mfj" : "single"];
  for (let i = 0; i < t.length; i++) if (magi <= t[i]) return i;
  return t.length;
}

// ─── component ──────────────────────────────────────────────────
export default function RothConversionCalc() {
  const [status, setStatus] = useState("mfj");
  const [agi, setAgi] = useState("");
  const [muni, setMuni] = useState("");
  const [ltcg, setLtcg] = useState("");
  const [age65, setAge65] = useState(0);
  const [dedOverride, setDedOverride] = useState("");

  const m = useMemo(() => {
    const AGI = num(agi);
    const MUNI = num(muni);
    const LTCG = Math.min(num(ltcg), AGI);
    const seniors = Math.min(age65, status === "mfj" ? 2 : 1);
    const stdDed = STD_DEDUCTION[status] + seniors * AGE65_ADDON[status];
    const deduction = dedOverride !== "" ? num(dedOverride) : stdDed;

    const ordTaxable = Math.max(0, AGI - LTCG - deduction);
    const magiNow = AGI + MUNI;
    const baseTax = ordinaryTax(ordTaxable, status);
    const curBracket = bracketOf(ordTaxable, status);

    const windows = BRACKETS[status]
      .filter((b) => b.top !== Infinity && b.top > ordTaxable)
      .map((b) => {
        const conversion = b.top - ordTaxable;
        const tax = ordinaryTax(b.top, status) - baseTax;
        const newMagi = magiNow + conversion;
        return {
          rate: b.rate, top: b.top, conversion, tax,
          effRate: tax / conversion,
          newMagi,
          tierNow: irmaaTier(magiNow, status),
          tierAfter: irmaaTier(newMagi, status),
        };
      });

    const tiers = IRMAA[status === "mfj" ? "mfj" : "single"];
    const tierNow = irmaaTier(magiNow, status);
    const nextLine = tierNow < tiers.length ? tiers[tierNow] : null;

    return {
      AGI, deduction, stdDed, ordTaxable, magiNow, curBracket, windows,
      tierNow, nextLine,
      irmaaRoom: nextLine !== null ? Math.max(0, nextLine - magiNow) : null,
    };
  }, [status, agi, muni, ltcg, age65, dedOverride]);

  const hasInput = num(agi) > 0;
  const chartMax = m.windows.length ? m.windows.at(-1).top : 100000;

  const S = styles;

  return (
    <div style={S.wrap}>
      <div style={S.title}>Roth Conversion Window</div>
      <div style={S.subtitle}>
        Bracket-fill amounts for TY{YEAR}, with the tax cost and IRMAA check for each.
      </div>

      {/* Filing status */}
      <div style={S.segRow}>
        {FILING.map((f) => (
          <button
            key={f.id}
            onClick={() => { setStatus(f.id); setAge65(0); }}
            style={{ ...S.seg, ...(status === f.id ? S.segOn : {}) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div style={S.inputGrid}>
        <Field label="AGI — 1040 line 11">
          <input style={S.input} inputMode="decimal" placeholder="185,000"
            value={agi} onChange={(e) => setAgi(e.target.value)} />
        </Field>
        <Field label="Tax-exempt muni interest — line 2a">
          <input style={S.input} inputMode="decimal" placeholder="0"
            value={muni} onChange={(e) => setMuni(e.target.value)} />
        </Field>
        <Field label="LTCG + qualified divs in AGI">
          <input style={S.input} inputMode="decimal" placeholder="0"
            value={ltcg} onChange={(e) => setLtcg(e.target.value)} />
        </Field>
        <Field label="Age 65+ taxpayers">
          <select style={S.input} value={age65}
            onChange={(e) => setAge65(Number(e.target.value))}>
            <option value={0}>None</option>
            <option value={1}>One</option>
            {status === "mfj" && <option value={2}>Both</option>}
          </select>
        </Field>
        <Field label={"Deduction (blank = std " + fmt(m.stdDed) + ")"} full>
          <input style={S.input} inputMode="decimal"
            placeholder={"Standard: " + fmt(m.stdDed)}
            value={dedOverride} onChange={(e) => setDedOverride(e.target.value)} />
        </Field>
      </div>

      {!hasInput && (
        <div style={S.empty}>Enter the client's AGI to see conversion windows.</div>
      )}

      {hasInput && (
        <>
          {/* Position */}
          <div style={S.statRow}>
            <Stat label="Ordinary taxable" value={fmt(m.ordTaxable)} />
            <Stat label="Marginal bracket" value={Math.round(m.curBracket.rate * 100) + "%"} gold />
            <Stat label="MAGI (AGI + muni)" value={fmt(m.magiNow)} />
            <Stat label="IRMAA tier"
              value={m.tierNow === 0 ? "Standard" : "Tier " + m.tierNow} />
          </div>

          {m.irmaaRoom !== null && (
            <div style={S.irmaaNote}>
              <span style={{ color: palette.accent, fontWeight: 700 }}>
                {fmt(m.irmaaRoom)}
              </span>{" "}
              of MAGI headroom before the next IRMAA line at {fmt(m.nextLine)}
            </div>
          )}

          {/* Bracket-fill bar */}
          <div style={S.barTrack}>
            {BRACKETS[status]
              .filter((b) => b.top !== Infinity && b.top <= chartMax)
              .map((b, i, arr) => {
                const prev = i === 0 ? 0 : arr[i - 1].top;
                const width = ((b.top - prev) / chartMax) * 100;
                const fill = Math.min(Math.max(m.ordTaxable - prev, 0), b.top - prev);
                const fillPct = (fill / (b.top - prev)) * 100 || 0;
                return (
                  <div key={b.rate} style={{ ...S.band, width: width + "%" }}>
                    <div style={{ ...S.bandFill, width: fillPct + "%" }} />
                    <span style={S.bandLabel}>{Math.round(b.rate * 100)}</span>
                  </div>
                );
              })}
          </div>
          <div style={S.legend}>
            <span><i style={{ ...S.dot, background: palette.accent }} /> income used</span>
            <span><i style={{ ...S.dot, background: "#1e293b", border: "1px solid #334155" }} /> headroom</span>
          </div>

          {/* Windows */}
          {m.windows.map((w) => {
            const crossed = w.tierAfter > w.tierNow;
            const addedB = crossed
              ? (PART_B_MONTHLY[Math.min(w.tierAfter, 5)] -
                 PART_B_MONTHLY[Math.min(w.tierNow, 5)]) * 12
              : 0;
            return (
              <div key={w.rate} style={S.window}>
                <div style={S.winHead}>
                  <div>
                    <div style={S.winTitle}>Fill the {Math.round(w.rate * 100)}% bracket</div>
                    <div style={S.winSub}>to {fmt(w.top)} taxable</div>
                  </div>
                  <div style={S.winAmt}>{fmt(w.conversion)}</div>
                </div>
                <div style={S.winFacts}>
                  <span>Fed tax <b style={S.b}>{fmt(w.tax)}</b></span>
                  <span>Eff. rate <b style={S.b}>{pct(w.effRate)}</b></span>
                  <span>New MAGI <b style={S.b}>{fmt(w.newMagi)}</b></span>
                </div>
                {crossed ? (
                  <div style={S.warnBox}>
                    ⚠ Crosses to IRMAA tier {w.tierAfter} — ≈{fmt(addedB)}/yr more Part B
                    per person (+ Part D surcharge), assessed two years later
                  </div>
                ) : (
                  <div style={S.okLine}>✓ Stays in current IRMAA tier</div>
                )}
              </div>
            );
          })}

          <div style={S.foot}>
            Federal only, {YEAR} brackets (Rev. Proc. 2025-32). Not modeled: state
            tax, 0%→15% LTCG bump, Social Security taxation, NIIT interaction, ACA
            cliffs, senior bonus deduction phase-out. IRMAA shown with the {YEAR}
            table as a proxy — actual surcharges use MAGI from two years prior.
            Verify in tax software before recommending.
          </div>
        </>
      )}
    </div>
  );
}

// ─── small pieces ───────────────────────────────────────────────
function Field({ label, children, full }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5,
      gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, gold }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color: gold ? palette.accent : palette.text }}>
        {value}
      </div>
    </div>
  );
}

// ─── styles ─────────────────────────────────────────────────────
const styles = {
  wrap: {
    background: palette.card, borderRadius: 14, padding: "18px 16px",
    color: palette.text, fontFamily: "'Source Sans 3', sans-serif",
  },
  title: {
    fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700,
    color: palette.accent,
  },
  subtitle: { fontSize: 13, color: palette.textDim, margin: "4px 0 14px", lineHeight: 1.5 },
  segRow: { display: "flex", gap: 8, marginBottom: 14 },
  seg: {
    flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #334155",
    background: palette.input, color: palette.textDim, fontSize: 14,
    fontWeight: 600, cursor: "pointer",
  },
  segOn: { background: palette.accent, borderColor: palette.accent, color: "#0B1120" },
  inputGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 12px" },
  fieldLabel: { fontSize: 12, color: palette.textDim, lineHeight: 1.3 },
  input: {
    font: "inherit", fontFamily: "'DM Mono', monospace", fontSize: 15,
    padding: "10px 11px", borderRadius: 8, border: "1px solid #334155",
    background: palette.input, color: palette.text, width: "100%", boxSizing: "border-box",
  },
  empty: { textAlign: "center", color: palette.textDim, padding: "26px 0 10px", fontSize: 14 },
  statRow: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "18px 0 0",
  },
  stat: { background: palette.input, borderRadius: 10, padding: "10px 12px" },
  statLabel: { fontSize: 11, color: palette.textDim, marginBottom: 2 },
  statValue: { fontFamily: "'DM Mono', monospace", fontSize: 17, fontWeight: 600 },
  irmaaNote: {
    marginTop: 12, fontSize: 13, lineHeight: 1.5, background: palette.input,
    border: "1px solid #334155", borderRadius: 10, padding: "9px 12px",
    color: palette.text,
  },
  barTrack: {
    display: "flex", height: 40, borderRadius: 8, overflow: "hidden",
    border: "1px solid #334155", marginTop: 16,
  },
  band: { position: "relative", background: "#1e293b", borderRight: "1px solid " + palette.card },
  bandFill: { position: "absolute", inset: "0 auto 0 0", background: palette.accent },
  bandLabel: {
    position: "absolute", bottom: 3, right: 5, fontSize: 10,
    fontFamily: "'DM Mono', monospace", color: palette.textDim,
  },
  legend: { display: "flex", gap: 16, marginTop: 7, fontSize: 12, color: palette.textDim },
  dot: { display: "inline-block", width: 9, height: 9, borderRadius: 3, marginRight: 5 },
  window: { borderTop: "1px solid " + palette.line, marginTop: 16, paddingTop: 13 },
  winHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  winTitle: { fontSize: 15, fontWeight: 700 },
  winSub: { fontSize: 12, color: palette.textDim, marginTop: 1 },
  winAmt: {
    fontFamily: "'DM Mono', monospace", fontSize: 21, fontWeight: 600,
    color: palette.accent, whiteSpace: "nowrap",
  },
  winFacts: {
    display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5,
    color: palette.textDim, marginTop: 7,
  },
  b: { color: palette.text, fontFamily: "'DM Mono', monospace", fontWeight: 500 },
  warnBox: {
    marginTop: 9, fontSize: 12.5, lineHeight: 1.5, borderRadius: 8,
    padding: "8px 11px", background: "rgba(251,191,36,0.09)",
    border: "1px solid rgba(251,191,36,0.35)", color: palette.warn,
  },
  okLine: { marginTop: 9, fontSize: 12.5, color: palette.success },
  foot: {
    marginTop: 18, fontSize: 11, lineHeight: 1.6, color: palette.textDim,
    borderTop: "1px solid " + palette.line, paddingTop: 12,
  },
};
