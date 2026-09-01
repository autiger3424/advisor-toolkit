import { useState, useEffect, useRef } from "react";

// ─── DATA ───────────────────────────────────────────────────────────────────

const trustData = [
  {
    id: "revocable", name: "Revocable Living Trust", tagline: "Flexibility & Probate Avoidance", icon: "🔄", category: "foundational",
    bestFor: "Most individuals and families",
    taxBenefit: "None — assets remain in your taxable estate",
    assetProtection: "None — grantor retains full control",
    overview: "The cornerstone of most estate plans. You transfer assets into the trust during your lifetime, maintain full control, and can amend or revoke it at any time. Upon death, assets pass directly to beneficiaries without probate.",
    keyBenefits: ["Avoids the time, cost, and publicity of probate", "Provides continuity of asset management if you become incapacitated", "Maintains privacy — unlike wills, trusts are not public record", "Can be amended or revoked at any time during your lifetime"],
    considerations: ["Does not reduce estate taxes", "Offers no creditor protection during your lifetime", "Must be properly funded — assets not transferred into the trust still go through probate"],
    strategy: "Use as the foundation of your estate plan. Pair with a pour-over will to catch any assets not transferred during your lifetime. Retitle real estate, bank accounts, and investment accounts into the trust.",
  },
  {
    id: "bypass", name: "Bypass Trust (Credit Shelter)", tagline: "Maximize Spousal Exemptions", icon: "⚖️", category: "tax",
    bestFor: "Married couples seeking to preserve both spouses' estate tax exemptions",
    taxBenefit: "Shelters assets up to the exemption from future taxation in survivor's estate",
    assetProtection: "Moderate — held separately from surviving spouse's estate",
    overview: "Created upon the first spouse's death. Assets up to the federal estate tax exemption are placed into this irrevocable trust. The surviving spouse can receive income and principal, but because they don't own the assets outright, those assets are excluded from their estate.",
    keyBenefits: ["Preserves the deceased spouse's full estate tax exemption", "Surviving spouse can still benefit from trust income and principal", "Assets appreciate outside the surviving spouse's taxable estate", "Protects from surviving spouse's creditors and future remarriage", "Directs ultimate distribution to children or other beneficiaries"],
    considerations: ["Portability election (since 2011) reduces urgency for some couples", "No second step-up in basis at surviving spouse's death", "Requires proper funding through a formula clause", "Surviving spouse's access may be limited to ascertainable standard", "Ongoing trust administration and tax filings required"],
    strategy: "Despite portability, bypass trusts remain valuable for protecting appreciation from estate tax, shielding assets from the surviving spouse's creditors, and ensuring assets pass to intended beneficiaries — particularly important in blended families. Consider pairing with a QTIP trust.",
  },
  {
    id: "irrevocable", name: "Irrevocable Trust", tagline: "Tax Reduction & Asset Protection", icon: "🔒", category: "tax",
    bestFor: "High-net-worth individuals seeking tax and creditor protection",
    taxBenefit: "Removes assets from taxable estate",
    assetProtection: "Strong — assets are no longer legally yours",
    overview: "Once established, you give up ownership and control of the assets. This separation is what creates powerful tax and asset protection benefits. The trust becomes its own legal entity with its own tax ID.",
    keyBenefits: ["Removes assets from your taxable estate, potentially reducing estate taxes", "Shields assets from creditors and lawsuits", "Can protect assets for Medicaid planning purposes", "Locks in current valuation for appreciating assets"],
    considerations: ["Loss of control — changes are extremely difficult", "Cannot easily access the assets once transferred", "Trust income may be taxed at higher rates", "Requires careful selection of a trustee"],
    strategy: "Transfer appreciating assets early to maximize estate tax savings. Consider using during periods of low interest rates when asset valuations may be more favorable. Often used in combination with other trust structures.",
  },
  {
    id: "ilit", name: "Irrevocable Life Insurance Trust", tagline: "Tax-Free Life Insurance Proceeds", icon: "🛡️", category: "tax",
    bestFor: "Individuals with large life insurance policies and taxable estates",
    taxBenefit: "Excludes life insurance proceeds from estate",
    assetProtection: "Proceeds protected from beneficiaries' creditors",
    overview: "An ILIT owns your life insurance policy so the death benefit is not included in your taxable estate. Without an ILIT, life insurance proceeds — while income-tax-free — are still subject to estate tax for large estates.",
    keyBenefits: ["Keeps life insurance proceeds out of your taxable estate", "Provides liquidity for estate tax payments without increasing the estate", "Protects proceeds from beneficiaries' creditors", "Can be structured to benefit multiple generations"],
    considerations: ["Existing policies transferred in are subject to a 3-year lookback rule", "Annual premium payments must be structured as gifts (Crummey notices)", "Cannot change beneficiaries or borrow against the policy", "Requires ongoing administration"],
    strategy: "Ideal for estates exceeding the federal estate tax exemption. Purchase new policies within the ILIT to avoid the 3-year lookback. Use annual gift tax exclusions to fund premium payments.",
  },
  {
    id: "grat", name: "Grantor Retained Annuity Trust", tagline: "Transfer Appreciating Assets Tax-Free", icon: "📈", category: "tax",
    bestFor: "Owners of rapidly appreciating assets",
    taxBenefit: "Transfers appreciation above IRS hurdle rate gift-tax-free",
    assetProtection: "Limited — primarily a tax planning tool",
    overview: "You transfer assets into the trust and receive annuity payments back over a set term. If the assets appreciate faster than the IRS-assumed rate (Section 7520 rate), the excess growth passes to beneficiaries free of gift and estate tax.",
    keyBenefits: ["Can transfer significant wealth with minimal or zero gift tax", "Particularly effective for rapidly appreciating assets", "Can be structured as a zeroed-out GRAT with virtually no gift tax cost", "Rolling short-term GRATs can reduce mortality risk"],
    considerations: ["If you die during the trust term, assets revert to your estate", "Less effective in high interest rate environments", "Complex to administer and value", "No benefit if assets don't outperform the Section 7520 rate"],
    strategy: "Best used with assets you believe will significantly appreciate — such as pre-IPO stock, real estate in growing markets, or business interests before a liquidity event. Consider a series of short-term (2-year) rolling GRATs to minimize mortality risk.",
  },
  {
    id: "qprt", name: "Qualified Personal Residence Trust", tagline: "Transfer Your Home at a Discount", icon: "🏠", category: "tax",
    bestFor: "Homeowners wanting to transfer residence to heirs tax-efficiently",
    taxBenefit: "Transfers home at a fraction of its market value for gift tax",
    assetProtection: "Moderate — home leaves your estate after the term",
    overview: "You transfer your home into the trust while retaining the right to live in it for a set number of years. When the term ends, the home passes to your beneficiaries. The gift value is discounted because you retained use of the home.",
    keyBenefits: ["Transfers your home at a significantly discounted gift tax value", "You continue living in the home during the trust term", "All future appreciation is excluded from your estate", "Particularly effective for expensive primary or vacation homes"],
    considerations: ["If you die during the trust term, the home returns to your estate", "After the term, you must pay fair market rent to continue living there", "Beneficiaries receive your cost basis (no step-up)", "Less beneficial in high interest rate environments"],
    strategy: "Set the retained term based on your life expectancy to maximize the discount while minimizing mortality risk. Works best when established at younger ages and in low interest rate environments.",
  },
  {
    id: "special_needs", name: "Special Needs Trust", tagline: "Protect Benefits While Providing Support", icon: "💙", category: "protection",
    bestFor: "Families with disabled or special needs dependents",
    taxBenefit: "Varies by structure",
    assetProtection: "Assets not counted for government benefit eligibility",
    overview: "Designed to supplement — not replace — government benefits like SSI and Medicaid. The trust holds assets for a disabled beneficiary without disqualifying them from means-tested programs.",
    keyBenefits: ["Preserves eligibility for SSI, Medicaid, and other need-based benefits", "Provides supplemental funding for quality-of-life expenses", "Can be funded by family, lawsuit settlements, or inheritances", "Professional trustee can ensure proper administration"],
    considerations: ["Distributions must be carefully managed to avoid disqualifying the beneficiary", "First-party SNTs require Medicaid payback upon beneficiary's death", "Requires a trustee knowledgeable about benefits rules", "Annual accounting and administration required"],
    strategy: "Establish a third-party SNT funded by parents or family (no Medicaid payback required). Name the SNT as beneficiary in your will and other trusts rather than leaving assets directly to the disabled individual.",
  },
  {
    id: "dynasty", name: "Dynasty Trust", tagline: "Multi-Generational Wealth Transfer", icon: "👑", category: "wealth",
    bestFor: "Ultra-high-net-worth families focused on legacy",
    taxBenefit: "Avoids estate tax at each generational transfer — potentially forever",
    assetProtection: "Strong — protected from beneficiaries' creditors and divorces",
    overview: "Designed to last for multiple generations (or perpetually in states that allow it), a dynasty trust shields wealth from estate tax at each generational transfer. Combined with GST tax exemption, this can preserve family wealth indefinitely.",
    keyBenefits: ["Avoids estate and GST taxes across multiple generations", "Protects from beneficiaries' creditors, lawsuits, and divorces", "Can provide structured distributions to prevent wealth from undermining motivation", "Allows centralized management of family assets"],
    considerations: ["Extremely complex to establish and administer", "Requires careful trustee selection for long-term management", "State law determines maximum trust duration", "Annual trustee fees over decades can be significant"],
    strategy: "Establish in a dynasty-friendly state (Nevada, South Dakota, Delaware) that allows perpetual trusts and has no state income tax on trust income. Allocate your GST exemption to maximize tax-free growth.",
  },
  {
    id: "crt", name: "Charitable Remainder Trust", tagline: "Income Stream + Charitable Impact", icon: "🎁", category: "charitable",
    bestFor: "Charitably inclined individuals with highly appreciated assets",
    taxBenefit: "Immediate income tax deduction; defer/avoid capital gains",
    assetProtection: "Assets leave your estate",
    overview: "You transfer appreciated assets into the trust and receive an income stream for a set period or your lifetime. When the trust terminates, the remaining assets go to your chosen charity. You receive an immediate charitable income tax deduction.",
    keyBenefits: ["Immediate partial income tax deduction", "Avoids capital gains on sale of appreciated assets inside the trust", "Provides steady income stream for life or a term of years", "Reduces estate size and supports causes you care about"],
    considerations: ["Remainder must eventually go to charity — heirs don't receive it", "Minimum 10% of initial value must go to charity", "Complex valuation and administration requirements", "Income stream is taxable to you"],
    strategy: "Fund with highly appreciated stock or real estate. Pair with an ILIT — use a portion of the income stream to fund a life insurance policy that replaces the charitable gift for your heirs ('wealth replacement' strategy).",
  },
  {
    id: "clat", name: "Charitable Lead Annuity Trust", tagline: "Give Now, Transfer Later Tax-Free", icon: "🌱", category: "charitable",
    bestFor: "Wealthy families wanting to transfer assets while supporting charity",
    taxBenefit: "Can zero out gift/estate tax on assets transferred to heirs",
    assetProtection: "Assets leave your estate during the trust term",
    overview: "The mirror image of a CRT. The charity receives income payments for a set period, and when the trust term ends, the remaining assets pass to your heirs. If the assets outperform the IRS assumed rate, significant wealth transfers to heirs tax-free.",
    keyBenefits: ["Can transfer appreciating assets to heirs with minimal gift or estate tax", "Supports charitable causes during the trust term", "Particularly effective in low interest rate environments", "Can be structured to completely zero out the taxable gift"],
    considerations: ["Charity must receive payments first — heirs wait", "If assets underperform, less passes to heirs", "Complex setup and administration", "Irrevocable once established"],
    strategy: "Best suited for assets expected to appreciate significantly above the Section 7520 rate. Consider during market downturns when valuations are depressed. Combine with a family foundation as the charitable recipient.",
  },
  {
    id: "spendthrift", name: "Spendthrift Trust", tagline: "Protect Heirs from Themselves", icon: "🔐", category: "protection",
    bestFor: "Beneficiaries who may struggle with financial management",
    taxBenefit: "Varies based on underlying trust structure",
    assetProtection: "Strong — creditors cannot reach trust assets before distribution",
    overview: "Includes provisions that prevent beneficiaries from pledging or assigning their interest, and protects trust assets from beneficiaries' creditors. Distributions are controlled by the trustee based on terms you set.",
    keyBenefits: ["Protects assets from beneficiaries' poor financial decisions", "Shields trust assets from beneficiaries' creditors, divorces, and lawsuits", "Allows structured distributions (e.g., for education, health, milestones)", "Can include incentive provisions tied to responsible behavior"],
    considerations: ["Once distributed, funds lose their protection", "Beneficiaries may resent the restrictions", "Requires a trustworthy and capable trustee", "Some creditors (IRS, child support) can still access funds"],
    strategy: "Include spendthrift provisions in virtually every trust you create — it's an easy layer of protection. Define distribution standards carefully: consider milestone-based distributions (age 25 for education, age 30 for home purchase, age 35 for unrestricted).",
  },
];

const trustCategories = {
  foundational: { label: "Foundational", color: "#2D6A4F", bg: "#D8F3DC" },
  tax: { label: "Tax", color: "#7B2D8B", bg: "#F3E5F5" },
  protection: { label: "Protection", color: "#1565C0", bg: "#E3F2FD" },
  wealth: { label: "Wealth Transfer", color: "#BF360C", bg: "#FBE9E7" },
  charitable: { label: "Charitable", color: "#F57F17", bg: "#FFF8E1" },
};

const taxData = {
  incomeBrackets2025: [
    { rate: "10%", single: "$0 – $11,925", mfj: "$0 – $23,850" },
    { rate: "12%", single: "$11,926 – $48,475", mfj: "$23,851 – $96,950" },
    { rate: "22%", single: "$48,476 – $103,350", mfj: "$96,951 – $206,700" },
    { rate: "24%", single: "$103,351 – $197,300", mfj: "$206,701 – $394,600" },
    { rate: "32%", single: "$197,301 – $250,525", mfj: "$394,601 – $501,050" },
    { rate: "35%", single: "$250,526 – $626,350", mfj: "$501,051 – $751,600" },
    { rate: "37%", single: "Over $626,350", mfj: "Over $751,600" },
  ],
  capitalGains2025: [
    { rate: "0%", single: "Up to $48,350", mfj: "Up to $96,700" },
    { rate: "15%", single: "$48,351 – $533,400", mfj: "$96,701 – $600,050" },
    { rate: "20%", single: "Over $533,400", mfj: "Over $600,050" },
  ],
  keyLimits2025: [
    { item: "Federal Estate Tax Exemption", value: "$13.99M / person" },
    { item: "Annual Gift Tax Exclusion", value: "$19,000 / recipient" },
    { item: "GST Tax Exemption", value: "$13.99M" },
    { item: "Standard Deduction (Single)", value: "$15,000" },
    { item: "Standard Deduction (MFJ)", value: "$30,000" },
    { item: "AMT Exemption (Single)", value: "$88,100" },
    { item: "AMT Exemption (MFJ)", value: "$137,000" },
    { item: "SALT Deduction Cap", value: "$10,000" },
    { item: "Section 199A QBI Threshold (Single)", value: "$197,300" },
    { item: "Section 199A QBI Threshold (MFJ)", value: "$394,600" },
    { item: "Net Investment Income Tax (NIIT)", value: "3.8% above $200K/$250K" },
    { item: "Social Security Wage Base", value: "$176,100" },
    { item: "Medicare Surtax Threshold", value: "$200K Single / $250K MFJ" },
  ],
};

const retirementData = {
  contributionLimits2025: [
    { account: "Traditional / Roth IRA", under50: "$7,000", over50: "$8,000", note: "Roth phase-out: $150K–$165K (S) / $236K–$246K (MFJ)" },
    { account: "401(k) / 403(b) / 457", under50: "$23,500", over50: "$31,000", note: "Ages 60-63: $34,750 catch-up" },
    { account: "SIMPLE IRA", under50: "$16,500", over50: "$20,000", note: "Ages 60-63: $21,750" },
    { account: "SEP IRA", under50: "25% comp or $70,000", over50: "Same", note: "No catch-up provision" },
    { account: "Solo 401(k)", under50: "$70,000 total", over50: "$77,500 total", note: "Employee + employer contributions" },
    { account: "HSA (Self-only)", under50: "$4,300", over50: "$5,300", note: "Must have HDHP; age 55+ catch-up" },
    { account: "HSA (Family)", under50: "$8,550", over50: "$9,550", note: "Must have HDHP; age 55+ catch-up" },
  ],
  rmdRules: [
    { item: "RMD Start Age", value: "73 (born 1951-1959) / 75 (born 1960+)" },
    { item: "Penalty for Missed RMD", value: "25% excise tax (10% if corrected timely)" },
    { item: "Roth IRA RMDs", value: "None during owner's lifetime" },
    { item: "Inherited IRA (Non-spouse)", value: "10-year rule for most; annual RMDs may apply" },
    { item: "Inherited IRA (Spouse)", value: "Can roll over to own IRA or use 10-year rule" },
    { item: "Inherited IRA (EDB)", value: "Stretch allowed for eligible designated beneficiaries" },
    { item: "Roth Conversions", value: "No income limits; taxable as ordinary income" },
    { item: "72(t) / SEPP", value: "Penalty-free early access via substantially equal payments" },
    { item: "Qualified Charitable Distribution", value: "Up to $105,000/year from IRA; age 70½+" },
  ],
};

const checklistData = [
  {
    title: "Core Documents",
    items: [
      { text: "Revocable living trust drafted and funded", critical: true },
      { text: "Pour-over will in place", critical: true },
      { text: "Durable financial power of attorney", critical: true },
      { text: "Healthcare power of attorney / proxy", critical: true },
      { text: "HIPAA authorization", critical: false },
      { text: "Living will / advance directive", critical: true },
      { text: "Letter of intent / personal wishes", critical: false },
    ],
  },
  {
    title: "Beneficiary & Title Review",
    items: [
      { text: "Review all beneficiary designations (IRAs, 401k, life insurance)", critical: true },
      { text: "Verify asset titling aligns with trust", critical: true },
      { text: "Confirm TOD/POD designations on accounts", critical: false },
      { text: "Review joint tenancy and community property titling", critical: false },
      { text: "Update designations after life changes (marriage, divorce, birth, death)", critical: true },
    ],
  },
  {
    title: "Tax & Wealth Transfer Planning",
    items: [
      { text: "Assess estate size relative to federal exemption ($13.99M)", critical: true },
      { text: "Evaluate need for irrevocable trust strategies (ILIT, GRAT, etc.)", critical: false },
      { text: "Review annual gifting strategy using $19,000 exclusion", critical: false },
      { text: "Consider charitable giving vehicles (CRT, CLT, DAF)", critical: false },
      { text: "Evaluate state estate/inheritance tax exposure", critical: true },
      { text: "Plan for potential 2026 exemption sunset", critical: true },
    ],
  },
  {
    title: "Business & Special Situations",
    items: [
      { text: "Buy-sell agreement in place and funded", critical: true },
      { text: "Business succession plan documented", critical: true },
      { text: "Special needs trust for disabled dependents", critical: false },
      { text: "Guardian designations for minor children", critical: true },
      { text: "Digital assets inventory and access plan", critical: false },
      { text: "Pet trust or care instructions", critical: false },
    ],
  },
  {
    title: "Insurance & Liquidity",
    items: [
      { text: "Life insurance coverage adequate for estate needs", critical: true },
      { text: "ILIT established if estate exceeds exemption", critical: false },
      { text: "Long-term care insurance evaluated", critical: false },
      { text: "Disability insurance reviewed", critical: false },
      { text: "Liquidity plan for estate tax payment", critical: true },
    ],
  },
  {
    title: "Ongoing Maintenance",
    items: [
      { text: "Annual review of estate plan", critical: true },
      { text: "Review after major life events", critical: true },
      { text: "Confirm executor/trustee willingness and capacity", critical: false },
      { text: "Update document storage and access information", critical: false },
      { text: "Review state law changes affecting estate plan", critical: false },
    ],
  },
];

const irmaaData = {
  year: 2026,
  lookbackYear: 2024,
  standardPartB: 202.90,
  brackets: [
    { single: "≤ $109,000", mfj: "≤ $218,000", partB: 202.90, partBSurcharge: 0, partDSurcharge: 0 },
    { single: "$109,001 – $137,000", mfj: "$218,001 – $274,000", partB: 284.10, partBSurcharge: 81.20, partDSurcharge: 14.50 },
    { single: "$137,001 – $171,000", mfj: "$274,001 – $342,000", partB: 405.80, partBSurcharge: 202.90, partDSurcharge: 37.50 },
    { single: "$171,001 – $205,000", mfj: "$342,001 – $410,000", partB: 527.50, partBSurcharge: 324.60, partDSurcharge: 60.40 },
    { single: "$205,001 – $499,999", mfj: "$410,001 – $749,999", partB: 649.20, partBSurcharge: 446.30, partDSurcharge: 83.30 },
    { single: "≥ $500,000", mfj: "≥ $750,000", partB: 689.90, partBSurcharge: 487.00, partDSurcharge: 91.00 },
  ],
  keyFacts: [
    { item: "Standard Part B Premium", value: "$202.90/mo" },
    { item: "IRMAA Lookback Period", value: "2 years (2024 income → 2026 premiums)" },
    { item: "MAGI Includes", value: "AGI + tax-exempt interest (muni bonds)" },
    { item: "Part A Deductible", value: "$1,736 per benefit period" },
    { item: "Part B Deductible", value: "$283 annually" },
    { item: "Structure Type", value: "Cliff — $1 over triggers full tier surcharge" },
    { item: "Appeal Form", value: "SSA-44 (Life-Changing Event)" },
    { item: "QCD Limit (age 70½+)", value: "$105,000/year from IRA" },
  ],
};

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

const fonts = {
  display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  body: "'Source Sans 3', 'Segoe UI', Tahoma, sans-serif",
  mono: "'DM Mono', 'Courier New', monospace",
};

const ssData = {
  fraByBirth: [
    { born: "1943–1954", fra: "66", delayed8pct: "Age 70 = 132% of PIA" },
    { born: "1955", fra: "66 + 2 months", delayed8pct: "Age 70 = 130.7%" },
    { born: "1956", fra: "66 + 4 months", delayed8pct: "Age 70 = 129.3%" },
    { born: "1957", fra: "66 + 6 months", delayed8pct: "Age 70 = 128%" },
    { born: "1958", fra: "66 + 8 months", delayed8pct: "Age 70 = 126.7%" },
    { born: "1959", fra: "66 + 10 months", delayed8pct: "Age 70 = 125.3%" },
    { born: "1960 or later", fra: "67", delayed8pct: "Age 70 = 124%" },
  ],
  claimingImpact: [
    { age: "62", single: "70% of PIA", mfj: "Spousal: 32.5% of worker's PIA" },
    { age: "63", single: "75%", mfj: "Spousal: 35%" },
    { age: "64", single: "80%", mfj: "Spousal: 37.5%" },
    { age: "65", single: "86.7%", mfj: "Spousal: 41.7%" },
    { age: "66", single: "93.3%", mfj: "Spousal: 45.8%" },
    { age: "67 (FRA)", single: "100%", mfj: "Spousal: 50%" },
    { age: "68", single: "108%", mfj: "N/A — spousal doesn't grow" },
    { age: "69", single: "116%", mfj: "N/A" },
    { age: "70", single: "124%", mfj: "N/A" },
  ],
  keyFigures2026: [
    { item: "Max Benefit at FRA (age 67)", value: "$4,152/mo" },
    { item: "Max Benefit at Age 70", value: "$5,251/mo" },
    { item: "2026 COLA", value: "2.8%" },
    { item: "Taxable Wage Base", value: "$184,500" },
    { item: "Earnings Test (under FRA)", value: "$24,480/yr ($1 per $2 over)" },
    { item: "Earnings Test (FRA year)", value: "$65,160/yr ($1 per $3 over)" },
    { item: "Work Credit Value", value: "$1,890 per credit (4 max/yr)" },
    { item: "Spousal Benefit (at FRA)", value: "Up to 50% of worker's PIA" },
    { item: "Survivor Benefit", value: "Up to 100% of deceased's benefit" },
  ],
  taxationThresholds: [
    { filing: "Single", threshold50: "$25,000 – $34,000", threshold85: "Above $34,000" },
    { filing: "MFJ", threshold50: "$32,000 – $44,000", threshold85: "Above $44,000" },
    { filing: "MFS (lived together)", threshold50: "N/A", threshold85: "All taxable (85%)" },
  ],
};

const medicareEnrollment = {
  periods: [
    { period: "Initial Enrollment (IEP)", window: "7-month window around 65th birthday", details: "3 months before + birthday month + 3 months after turning 65. Coverage start depends on when you sign up within this window." },
    { period: "General Enrollment (GEP)", window: "Jan 1 – Mar 31 each year", details: "Coverage begins July 1. Late enrollment penalties may apply for Part B and Part D." },
    { period: "Special Enrollment (SEP)", window: "Varies by qualifying event", details: "Triggered by loss of employer coverage, moving, or other qualifying events. Generally 8 months for Part B after employer coverage ends." },
    { period: "Open Enrollment (OEP)", window: "Oct 15 – Dec 7 each year", details: "Switch Medicare Advantage plans, return to Original Medicare, or change Part D plans. Changes effective Jan 1." },
    { period: "Medicare Advantage OEP", window: "Jan 1 – Mar 31 each year", details: "Current MA enrollees can switch to another MA plan or drop back to Original Medicare + Part D." },
    { period: "Medigap Open Enrollment", window: "6 months from Part B effective date", details: "Guaranteed issue — cannot be denied or charged more for pre-existing conditions. One-time window." },
  ],
  penalties: [
    { type: "Part B Late Penalty", calc: "10% of standard premium per 12-month delay period", note: "Permanent — lasts as long as you have Part B. Waived if covered by employer group health plan." },
    { type: "Part D Late Penalty", calc: "1% of national base premium × months without creditable coverage", note: "Permanent. National base beneficiary premium for 2026: $36.78/mo." },
    { type: "Part A Late Penalty", calc: "10% of premium for 2× the years you delayed", note: "Only applies to those who must pay Part A premiums (fewer than 40 work credits)." },
  ],
};

const stateDeathTax = {
  estateTaxStates: [
    { state: "CT", exemption: "$15M", topRate: "12%", note: "Matches federal; flat rate" },
    { state: "DC", exemption: "$4.71M", topRate: "16%", note: "Indexed for inflation" },
    { state: "HI", exemption: "$5.49M", topRate: "20%", note: "Indexed for inflation" },
    { state: "IL", exemption: "$4M", topRate: "16%", note: "Not indexed" },
    { state: "ME", exemption: "$6.8M", topRate: "12%", note: "Indexed for inflation" },
    { state: "MD", exemption: "$5M", topRate: "16%", note: "Also has inheritance tax" },
    { state: "MA", exemption: "$2M", topRate: "16%", note: "Not indexed; no portability" },
    { state: "MN", exemption: "$3M", topRate: "16%", note: "Not indexed" },
    { state: "NY", exemption: "$7.35M", topRate: "16%", note: "105% cliff — full estate taxed if over" },
    { state: "OR", exemption: "$1M", topRate: "16%", note: "Lowest exemption in US" },
    { state: "RI", exemption: "$1.84M", topRate: "16%", note: "Indexed for inflation" },
    { state: "VT", exemption: "$5M", topRate: "16%", note: "Flat rate; not indexed" },
    { state: "WA", exemption: "$3.08M", topRate: "20%", note: "Top rate drops from 35% mid-2026" },
  ],
  inheritanceTaxStates: [
    { state: "KY", topRate: "16%", exemptRelatives: "Spouse, children, grandchildren, parents, siblings" },
    { state: "MD", topRate: "10%", exemptRelatives: "Spouse, children, grandchildren, parents, siblings" },
    { state: "NE", topRate: "15%", exemptRelatives: "Spouse; reduced rates for close relatives" },
    { state: "NJ", topRate: "16%", exemptRelatives: "Spouse, children, grandchildren, parents" },
    { state: "PA", topRate: "15%", exemptRelatives: "Spouse; children at 4.5%" },
  ],
};

const giftTaxData = {
  keyRules2026: [
    { item: "Annual Exclusion", value: "$19,000 per donee", detail: "Per donor, per recipient. Married couples can split gifts: $38,000/donee." },
    { item: "Lifetime Exemption", value: "$15M per person", detail: "Unified with estate tax exemption. Gifts above annual exclusion count against this." },
    { item: "Gift Tax Rate", value: "Up to 40%", detail: "Applied to taxable gifts exceeding the lifetime exemption." },
    { item: "Annual Exclusion for Spouses (Non-citizen)", value: "$190,000", detail: "Special higher annual exclusion for gifts to non-citizen spouses." },
    { item: "529 Superfunding", value: "$95,000 lump sum", detail: "5 years of annual exclusions at once ($19K × 5). No additional gifts to same donee for 5 years." },
    { item: "Tuition & Medical Exclusion", value: "Unlimited", detail: "Direct payments to institutions for tuition or medical providers — no limit, doesn't use exclusion." },
    { item: "Charitable Gifts", value: "Unlimited", detail: "No gift tax on charitable donations. Income tax deduction limits may apply." },
  ],
  strategies: [
    "Annual exclusion gifts — $19K/person/year ($38K for married couples splitting) to unlimited recipients",
    "Direct tuition payments — pay schools directly, unlimited, doesn't count against exclusion",
    "Direct medical payments — pay providers directly, unlimited, doesn't count against exclusion",
    "529 superfunding — front-load 5 years of gifts ($95K) in one year; $190K for couples",
    "Gifts to irrevocable trusts — use Crummey powers to qualify for annual exclusion",
    "GRATs/CLATs — transfer appreciating assets with minimal or zero gift tax",
    "Intra-family loans — lend at AFR; appreciation above AFR rate passes tax-free",
    "Family LLC/LP discounts — gift minority interests at valuation discounts",
  ],
};

const palette = {
  bg: "#0B1120",
  card: "#111827",
  cardHover: "#1a2438",
  border: "#1e293b",
  borderLight: "#334155",
  accent: "#C9A84C",
  accentDim: "rgba(201,168,76,0.15)",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textMuted: "#64748b",
  white: "#f8fafc",
  success: "#4ade80",
  warn: "#fbbf24",
};

function AdvisorToolkit() {
  const [activeTab, setActiveTab] = useState("trusts");
  const [trustFilter, setTrustFilter] = useState("all");
  const [selectedTrust, setSelectedTrust] = useState(null);
  const [calcMode, setCalcMode] = useState("compound");
  const [calcInputs, setCalcInputs] = useState({ principal: 100000, rate: 7, years: 20, monthly: 500 });
  const [rmdInputs, setRmdInputs] = useState({ balance: 500000, age: 75 });
  const [teyInputs, setTeyInputs] = useState({ muniYield: 3.5, fedRate: 35, stateRate: 5 });
  const [mortgageInputs, setMortgageInputs] = useState({ price: 350000, down: 70000, rate: 6.5, term: 30, tax: 3000, insurance: 1500, pmi: 0 });
  const [carInputs, setCarInputs] = useState({ price: 35000, down: 5000, rate: 5.9, term: 60, tradeIn: 0 });
  const [taxSubTab, setTaxSubTab] = useState("brackets");
  const [retireSubTab, setRetireSubTab] = useState("limits");
  const [checkStates, setCheckStates] = useState({});
  const [ssSubTab, setSsSubTab] = useState("keyfigs");
  const [estateSubTab, setEstateSubTab] = useState("statemap");

  const tabs = [
    { id: "trusts", label: "Trusts", icon: "📜" },
    { id: "tax", label: "Tax Ref", icon: "📊" },
    { id: "retire", label: "Retire", icon: "🏦" },
    { id: "ss", label: "Soc Sec", icon: "🏛️" },
    { id: "estate", label: "Estate", icon: "⚰️" },
    { id: "checklist", label: "Lists", icon: "✅" },
    { id: "calc", label: "Calc", icon: "🧮" },
  ];

  const s = {
    root: { fontFamily: fonts.body, background: palette.bg, color: palette.text, minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 80, fontSize: 14 },
    header: { padding: "20px 16px 12px", borderBottom: `1px solid ${palette.border}` },
    headerTitle: { fontFamily: fonts.display, fontSize: "1.35rem", fontWeight: 700, color: palette.accent, margin: 0, letterSpacing: "0.02em" },
    headerSub: { fontSize: "0.7rem", color: palette.textMuted, margin: "2px 0 0", letterSpacing: "0.15em", textTransform: "uppercase" },
    nav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: palette.card, borderTop: `1px solid ${palette.border}`, display: "flex", zIndex: 100, padding: "6px 0 env(safe-area-inset-bottom, 8px)" },
    navBtn: (active) => ({ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 4px", border: "none", background: "none", color: active ? palette.accent : palette.textMuted, cursor: "pointer", fontSize: "0.65rem", fontWeight: active ? 700 : 500, fontFamily: fonts.body, transition: "color 0.2s" }),
    navIcon: { fontSize: "1.1rem" },
    section: { padding: "16px" },
    card: { background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 10, padding: "14px", marginBottom: 10, cursor: "pointer", transition: "all 0.2s" },
    pill: (active, color) => ({ padding: "5px 12px", borderRadius: 16, border: `1px solid ${active ? (color || palette.accent) : palette.border}`, background: active ? (color || palette.accent) : "transparent", color: active ? (color ? "#fff" : palette.bg) : palette.textDim, fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", fontFamily: fonts.body, whiteSpace: "nowrap" }),
    table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "0.78rem" },
    th: { textAlign: "left", padding: "8px 10px", color: palette.accent, borderBottom: `2px solid ${palette.accent}`, fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em" },
    td: { padding: "8px 10px", borderBottom: `1px solid ${palette.border}`, color: palette.text },
    badge: (color) => ({ display: "inline-block", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", color: color, background: color + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontFamily: fonts.body }),
    input: { width: "100%", padding: "10px 12px", background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 8, color: palette.text, fontSize: "0.85rem", fontFamily: fonts.body, outline: "none", boxSizing: "border-box" },
    label: { display: "block", fontSize: "0.7rem", color: palette.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 },
    disclaimer: { background: palette.accentDim, border: `1px solid ${palette.accent}44`, borderRadius: 8, padding: "10px 12px", fontSize: "0.72rem", color: palette.warn, marginBottom: 16, lineHeight: 1.5 },
  };

  // ─ Calculators ──

  const compoundResult = () => {
    const { principal, rate, years, monthly } = calcInputs;
    const r = (rate / 100) / 12;
    const n = years * 12;
    const fvPrincipal = principal * Math.pow(1 + r, n);
    const fvMonthly = monthly * ((Math.pow(1 + r, n) - 1) / r);
    return { total: fvPrincipal + fvMonthly, principal: principal + monthly * n, interest: (fvPrincipal + fvMonthly) - (principal + monthly * n) };
  };

  const rmdLifeTable = { 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9 };

  const rmdResult = () => {
    const age = Math.max(73, Math.min(95, rmdInputs.age));
    const factor = rmdLifeTable[age] || 8.9;
    const rmd = rmdInputs.balance / factor;
    return { rmd, factor, monthlyEquiv: rmd / 12 };
  };

  const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  // ─ Trust Detail ──

  const trust = selectedTrust ? trustData.find(t => t.id === selectedTrust) : null;

  // ─ Render ──

  return (
    <div style={s.root}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={s.header}>
        <h1 style={s.headerTitle}>Advisor Toolkit</h1>
        <p style={s.headerSub}>Financial Planning Resource Hub</p>
      </div>

      <div style={s.section}>
        <div style={s.disclaimer}>⚠️ For educational and reference use only. Not legal, tax, or investment advice. Verify all figures with current IRS publications and qualified counsel.</div>

        {/* ════════ TRUSTS ════════ */}
        {activeTab === "trusts" && !selectedTrust && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <button style={s.pill(trustFilter === "all")} onClick={() => setTrustFilter("all")}>All</button>
              {Object.entries(trustCategories).map(([k, v]) => (
                <button key={k} style={s.pill(trustFilter === k, v.color)} onClick={() => setTrustFilter(k)}>{v.label}</button>
              ))}
            </div>
            {(trustFilter === "all" ? trustData : trustData.filter(t => t.category === trustFilter)).map(t => {
              const cat = trustCategories[t.category];
              return (
                <div key={t.id} style={s.card} onClick={() => setSelectedTrust(t.id)}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={s.badge(cat.color)}>{cat.label}</span>
                      </div>
                      <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.white }}>{t.name}</div>
                      <div style={{ fontSize: "0.78rem", color: palette.textDim, fontStyle: "italic", marginTop: 2 }}>{t.tagline}</div>
                    </div>
                    <span style={{ color: palette.textMuted, fontSize: "0.8rem" }}>›</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {activeTab === "trusts" && selectedTrust && trust && (
          <>
            <button onClick={() => setSelectedTrust(null)} style={{ background: "none", border: "none", color: palette.accent, fontSize: "0.8rem", cursor: "pointer", padding: 0, marginBottom: 12, fontFamily: fonts.body }}>← Back to all trusts</button>
            <div style={{ ...s.card, cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${palette.border}` }}>
                <span style={{ fontSize: "1.6rem" }}>{trust.icon}</span>
                <div>
                  <div style={{ fontFamily: fonts.display, fontSize: "1.15rem", fontWeight: 700, color: palette.accent }}>{trust.name}</div>
                  <div style={{ fontSize: "0.78rem", color: palette.textDim, fontStyle: "italic" }}>{trust.tagline}</div>
                </div>
              </div>
              {[{ l: "Best For", v: trust.bestFor }, { l: "Tax Benefit", v: trust.taxBenefit }, { l: "Asset Protection", v: trust.assetProtection }].map(f => (
                <div key={f.l} style={{ background: palette.bg, borderRadius: 6, padding: "8px 10px", marginBottom: 6 }}>
                  <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.12em", color: palette.textMuted, fontWeight: 700, marginBottom: 2 }}>{f.l}</div>
                  <div style={{ fontSize: "0.8rem", color: palette.text }}>{f.v}</div>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.white, marginBottom: 6 }}>Overview</div>
                <div style={{ fontSize: "0.8rem", color: palette.textDim, lineHeight: 1.65 }}>{trust.overview}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: palette.success, marginBottom: 6 }}>✓ Benefits</div>
                  {trust.keyBenefits.map((b, i) => <div key={i} style={{ fontSize: "0.75rem", color: palette.textDim, padding: "4px 0", borderBottom: i < trust.keyBenefits.length - 1 ? `1px solid ${palette.border}` : "none", lineHeight: 1.5 }}>{b}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: palette.warn, marginBottom: 6 }}>⚠ Considerations</div>
                  {trust.considerations.map((c, i) => <div key={i} style={{ fontSize: "0.75rem", color: palette.textDim, padding: "4px 0", borderBottom: i < trust.considerations.length - 1 ? `1px solid ${palette.border}` : "none", lineHeight: 1.5 }}>{c}</div>)}
                </div>
              </div>
              <div style={{ marginTop: 14, background: palette.accentDim, borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${palette.accent}` }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>💡 Strategic Application</div>
                <div style={{ fontSize: "0.78rem", color: palette.text, lineHeight: 1.65 }}>{trust.strategy}</div>
              </div>
            </div>
          </>
        )}

        {/* ════════ TAX ════════ */}
        {activeTab === "tax" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[{ id: "brackets", label: "Income Brackets" }, { id: "capgains", label: "Cap Gains" }, { id: "limits", label: "Key Limits" }].map(t => (
                <button key={t.id} style={s.pill(taxSubTab === t.id)} onClick={() => setTaxSubTab(t.id)}>{t.label}</button>
              ))}
            </div>

            {taxSubTab === "brackets" && (
              <div style={{ ...s.card, cursor: "default", overflowX: "auto" }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>2025 Federal Income Tax Brackets</div>
                <table style={s.table}>
                  <thead><tr><th style={s.th}>Rate</th><th style={s.th}>Single</th><th style={s.th}>Married Filing Jointly</th></tr></thead>
                  <tbody>
                    {taxData.incomeBrackets2025.map((r, i) => (
                      <tr key={i}><td style={{ ...s.td, fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>{r.rate}</td><td style={s.td}>{r.single}</td><td style={s.td}>{r.mfj}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {taxSubTab === "capgains" && (
              <div style={{ ...s.card, cursor: "default", overflowX: "auto" }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>2025 Long-Term Capital Gains Rates</div>
                <table style={s.table}>
                  <thead><tr><th style={s.th}>Rate</th><th style={s.th}>Single</th><th style={s.th}>MFJ</th></tr></thead>
                  <tbody>
                    {taxData.capitalGains2025.map((r, i) => (
                      <tr key={i}><td style={{ ...s.td, fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>{r.rate}</td><td style={s.td}>{r.single}</td><td style={s.td}>{r.mfj}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10, fontSize: "0.72rem", color: palette.textMuted, lineHeight: 1.5 }}>Note: Net Investment Income Tax (NIIT) of 3.8% may apply above $200K (Single) / $250K (MFJ), bringing the effective top rate to 23.8%.</div>
              </div>
            )}

            {taxSubTab === "limits" && (
              <div style={{ ...s.card, cursor: "default" }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>2025 Key Tax & Estate Limits</div>
                {taxData.keyLimits2025.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < taxData.keyLimits2025.length - 1 ? `1px solid ${palette.border}` : "none" }}>
                    <span style={{ fontSize: "0.78rem", color: palette.textDim, flex: 1, paddingRight: 10 }}>{r.item}</span>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: palette.white, fontFamily: fonts.mono, whiteSpace: "nowrap" }}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════ RETIREMENT ════════ */}
        {activeTab === "retire" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[{ id: "limits", label: "Contribution Limits" }, { id: "rmd", label: "RMD & Rules" }, { id: "irmaa", label: "2026 IRMAA" }].map(t => (
                <button key={t.id} style={s.pill(retireSubTab === t.id)} onClick={() => setRetireSubTab(t.id)}>{t.label}</button>
              ))}
            </div>

            {retireSubTab === "limits" && (
              <div style={{ ...s.card, cursor: "default" }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>2025 Contribution Limits</div>
                {retirementData.contributionLimits2025.map((r, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: i < retirementData.contributionLimits2025.length - 1 ? `1px solid ${palette.border}` : "none" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", color: palette.white, marginBottom: 4 }}>{r.account}</div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div><span style={{ fontSize: "0.65rem", color: palette.textMuted }}>Under 50: </span><span style={{ fontSize: "0.78rem", color: palette.accent, fontFamily: fonts.mono, fontWeight: 600 }}>{r.under50}</span></div>
                      <div><span style={{ fontSize: "0.65rem", color: palette.textMuted }}>50+: </span><span style={{ fontSize: "0.78rem", color: palette.accent, fontFamily: fonts.mono, fontWeight: 600 }}>{r.over50}</span></div>
                    </div>
                    <div style={{ fontSize: "0.7rem", color: palette.textMuted, marginTop: 3, fontStyle: "italic" }}>{r.note}</div>
                  </div>
                ))}
              </div>
            )}

            {retireSubTab === "rmd" && (
              <div style={{ ...s.card, cursor: "default" }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>RMD & Distribution Rules</div>
                {retirementData.rmdRules.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: i < retirementData.rmdRules.length - 1 ? `1px solid ${palette.border}` : "none", gap: 10 }}>
                    <span style={{ fontSize: "0.78rem", color: palette.textDim, flex: 1 }}>{r.item}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: palette.white, textAlign: "right", flex: 1 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}

            {retireSubTab === "irmaa" && (
              <>
                {/* Key Facts Card */}
                <div style={{ ...s.card, cursor: "default", marginBottom: 10 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>2026 Medicare IRMAA</div>
                  <div style={{ fontSize: "0.7rem", color: palette.textMuted, marginBottom: 10, lineHeight: 1.5 }}>Income-Related Monthly Adjustment Amount — surcharges for higher-income Medicare beneficiaries. Based on 2024 MAGI.</div>
                  {irmaaData.keyFacts.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: i < irmaaData.keyFacts.length - 1 ? `1px solid ${palette.border}` : "none", gap: 8 }}>
                      <span style={{ fontSize: "0.75rem", color: palette.textDim, flex: 1 }}>{r.item}</span>
                      <span style={{ fontSize: "0.73rem", fontWeight: 600, color: palette.white, textAlign: "right", flexShrink: 0, maxWidth: "55%", fontFamily: fonts.mono }}>{r.value}</span>
                    </div>
                  ))}
                </div>

                {/* Part B Brackets */}
                <div style={{ ...s.card, cursor: "default", marginBottom: 10, overflowX: "auto" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>Part B Monthly Premiums by MAGI</div>
                  <table style={{ ...s.table, fontSize: "0.7rem" }}>
                    <thead>
                      <tr>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Single Filer</th>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>MFJ</th>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem", textAlign: "right" }}>Part B</th>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem", textAlign: "right" }}>Surcharge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {irmaaData.brackets.map((b, i) => (
                        <tr key={i} style={{ background: i === 0 ? "rgba(74,222,128,0.08)" : "transparent" }}>
                          <td style={{ ...s.td, padding: "6px 6px", fontSize: "0.7rem" }}>{b.single}</td>
                          <td style={{ ...s.td, padding: "6px 6px", fontSize: "0.7rem" }}>{b.mfj}</td>
                          <td style={{ ...s.td, padding: "6px 6px", textAlign: "right", fontFamily: fonts.mono, fontWeight: 600, color: i === 0 ? palette.success : palette.text }}>${b.partB.toFixed(2)}</td>
                          <td style={{ ...s.td, padding: "6px 6px", textAlign: "right", fontFamily: fonts.mono, color: b.partBSurcharge === 0 ? palette.success : palette.warn }}>{b.partBSurcharge === 0 ? "$0" : `+$${b.partBSurcharge.toFixed(2)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Part D Surcharges */}
                <div style={{ ...s.card, cursor: "default", marginBottom: 10, overflowX: "auto" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>Part D Monthly Surcharges by MAGI</div>
                  <table style={{ ...s.table, fontSize: "0.7rem" }}>
                    <thead>
                      <tr>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Single Filer</th>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem", textAlign: "right" }}>Part D Surcharge</th>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem", textAlign: "right" }}>Annual / Person</th>
                      </tr>
                    </thead>
                    <tbody>
                      {irmaaData.brackets.map((b, i) => (
                        <tr key={i} style={{ background: i === 0 ? "rgba(74,222,128,0.08)" : "transparent" }}>
                          <td style={{ ...s.td, padding: "6px 6px", fontSize: "0.7rem" }}>{b.single}</td>
                          <td style={{ ...s.td, padding: "6px 6px", textAlign: "right", fontFamily: fonts.mono, color: b.partDSurcharge === 0 ? palette.success : palette.warn }}>{b.partDSurcharge === 0 ? "$0" : `+$${b.partDSurcharge.toFixed(2)}`}</td>
                          <td style={{ ...s.td, padding: "6px 6px", textAlign: "right", fontFamily: fonts.mono, fontWeight: 600 }}>${(b.partDSurcharge * 12).toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total Annual Impact */}
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>Total Annual IRMAA Cost (Part B + Part D)</div>
                  <table style={{ ...s.table, fontSize: "0.7rem" }}>
                    <thead>
                      <tr>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Tier</th>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem", textAlign: "right" }}>Per Person</th>
                        <th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem", textAlign: "right" }}>Per Couple</th>
                      </tr>
                    </thead>
                    <tbody>
                      {irmaaData.brackets.map((b, i) => {
                        const annualPerson = (b.partBSurcharge + b.partDSurcharge) * 12;
                        const annualCouple = annualPerson * 2;
                        const tierLabels = ["No IRMAA", "Tier 1", "Tier 2", "Tier 3", "Tier 4", "Tier 5"];
                        return (
                          <tr key={i} style={{ background: i === 0 ? "rgba(74,222,128,0.08)" : "transparent" }}>
                            <td style={{ ...s.td, padding: "6px 6px", fontWeight: 700, color: i === 0 ? palette.success : palette.accent, fontSize: "0.72rem" }}>{tierLabels[i]}</td>
                            <td style={{ ...s.td, padding: "6px 6px", textAlign: "right", fontFamily: fonts.mono, fontWeight: 600 }}>{annualPerson === 0 ? "$0" : `$${annualPerson.toLocaleString()}`}</td>
                            <td style={{ ...s.td, padding: "6px 6px", textAlign: "right", fontFamily: fonts.mono, fontWeight: 600, color: annualCouple > 5000 ? "#ef4444" : palette.text }}>{annualCouple === 0 ? "$0" : `$${annualCouple.toLocaleString()}`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, fontSize: "0.68rem", color: palette.textMuted, lineHeight: 1.55 }}>
                    IRMAA uses a cliff structure — exceeding a threshold by even $1 triggers the full tier surcharge. MAGI includes AGI plus tax-exempt interest (muni bond income). Consider Roth conversions, capital gains timing, and QCDs when managing MAGI near thresholds. Clients can appeal via Form SSA-44 for qualifying life-changing events (retirement, divorce, death of spouse).
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ════════ SOCIAL SECURITY ════════ */}
        {activeTab === "ss" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {[{ id: "keyfigs", label: "2026 Key Figures" }, { id: "fra", label: "FRA & Claiming" }, { id: "taxation", label: "Benefit Taxation" }, { id: "medicare", label: "Medicare Windows" }].map(t => (
                <button key={t.id} style={s.pill(ssSubTab === t.id)} onClick={() => setSsSubTab(t.id)}>{t.label}</button>
              ))}
            </div>

            {ssSubTab === "keyfigs" && (
              <div style={{ ...s.card, cursor: "default" }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>2026 Social Security Key Figures</div>
                {ssData.keyFigures2026.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: i < ssData.keyFigures2026.length - 1 ? `1px solid ${palette.border}` : "none", gap: 8 }}>
                    <span style={{ fontSize: "0.78rem", color: palette.textDim, flex: 1 }}>{r.item}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: palette.white, fontFamily: fonts.mono, textAlign: "right", flexShrink: 0 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}

            {ssSubTab === "fra" && (
              <>
                <div style={{ ...s.card, cursor: "default", marginBottom: 10, overflowX: "auto" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>Full Retirement Age by Birth Year</div>
                  <table style={{ ...s.table, fontSize: "0.72rem" }}>
                    <thead><tr><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Born</th><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>FRA</th><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>At Age 70</th></tr></thead>
                    <tbody>
                      {ssData.fraByBirth.map((r, i) => (
                        <tr key={i}><td style={{ ...s.td, padding: "6px 6px" }}>{r.born}</td><td style={{ ...s.td, padding: "6px 6px", fontFamily: fonts.mono, fontWeight: 600 }}>{r.fra}</td><td style={{ ...s.td, padding: "6px 6px", fontSize: "0.68rem" }}>{r.delayed8pct}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ ...s.card, cursor: "default", overflowX: "auto" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>Early/Delayed Claiming Impact</div>
                  <div style={{ fontSize: "0.68rem", color: palette.textMuted, marginBottom: 10 }}>Assumes FRA of 67 (born 1960+). PIA = Primary Insurance Amount.</div>
                  <table style={{ ...s.table, fontSize: "0.72rem" }}>
                    <thead><tr><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Claim Age</th><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Worker Benefit</th><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Spousal</th></tr></thead>
                    <tbody>
                      {ssData.claimingImpact.map((r, i) => (
                        <tr key={i} style={{ background: r.age.includes("FRA") ? palette.accentDim : "transparent" }}>
                          <td style={{ ...s.td, padding: "6px 6px", fontWeight: r.age.includes("FRA") ? 700 : 400, color: r.age.includes("FRA") ? palette.accent : palette.text }}>{r.age}</td>
                          <td style={{ ...s.td, padding: "6px 6px", fontFamily: fonts.mono }}>{r.single}</td>
                          <td style={{ ...s.td, padding: "6px 6px", fontSize: "0.68rem" }}>{r.mfj}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 8, fontSize: "0.68rem", color: palette.textMuted, lineHeight: 1.5 }}>Early claiming reduces benefits ~6.7%/yr for first 3 years, ~5%/yr after. Delayed credits: 8%/yr from FRA to 70. Spousal benefits do not grow past FRA. Survivor benefits: up to 100% of deceased worker's benefit (including delayed credits).</div>
                </div>
              </>
            )}

            {ssSubTab === "taxation" && (
              <div style={{ ...s.card, cursor: "default" }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>Social Security Benefit Taxation</div>
                <div style={{ fontSize: "0.7rem", color: palette.textMuted, marginBottom: 10, lineHeight: 1.5 }}>Combined Income = AGI + tax-exempt interest + 50% of SS benefits. These thresholds are NOT indexed for inflation.</div>
                <table style={{ ...s.table, fontSize: "0.72rem", marginBottom: 12 }}>
                  <thead><tr><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Filing Status</th><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Up to 50% Taxable</th><th style={{ ...s.th, padding: "6px 6px", fontSize: "0.6rem" }}>Up to 85% Taxable</th></tr></thead>
                  <tbody>
                    {ssData.taxationThresholds.map((r, i) => (
                      <tr key={i}><td style={{ ...s.td, padding: "6px 6px", fontWeight: 600 }}>{r.filing}</td><td style={{ ...s.td, padding: "6px 6px", fontFamily: fonts.mono }}>{r.threshold50}</td><td style={{ ...s.td, padding: "6px 6px", fontFamily: fonts.mono, color: palette.warn }}>{r.threshold85}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ background: palette.bg, borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: palette.white, marginBottom: 6 }}>Planning Strategies to Reduce Taxation</div>
                  {["Roth conversions before claiming — Roth withdrawals don't count in combined income", "Qualified Charitable Distributions (QCDs) — reduce AGI, up to $105K/yr from IRA (age 70½+)", "Time income sources to stay below thresholds", "Consider municipal bond income — tax-exempt but DOES count in SS combined income", "Senior bonus deduction (2025–2028): extra $6K standard deduction for 65+ ($12K joint), phases out above $75K/$150K MAGI"].map((tip, i) => (
                    <div key={i} style={{ fontSize: "0.72rem", color: palette.textDim, padding: "4px 0", borderBottom: i < 4 ? `1px solid ${palette.border}` : "none", lineHeight: 1.5 }}>• {tip}</div>
                  ))}
                </div>
              </div>
            )}

            {ssSubTab === "medicare" && (
              <>
                <div style={{ ...s.card, cursor: "default", marginBottom: 10 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>Medicare Enrollment Windows</div>
                  {medicareEnrollment.periods.map((p, i) => (
                    <div key={i} style={{ padding: "10px 0", borderBottom: i < medicareEnrollment.periods.length - 1 ? `1px solid ${palette.border}` : "none" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem", color: palette.white, marginBottom: 2 }}>{p.period}</div>
                      <div style={{ fontSize: "0.75rem", color: palette.accent, fontFamily: fonts.mono, marginBottom: 4 }}>{p.window}</div>
                      <div style={{ fontSize: "0.72rem", color: palette.textDim, lineHeight: 1.5 }}>{p.details}</div>
                    </div>
                  ))}
                </div>
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: "#ef4444", marginBottom: 10 }}>Late Enrollment Penalties</div>
                  {medicareEnrollment.penalties.map((p, i) => (
                    <div key={i} style={{ padding: "10px 0", borderBottom: i < medicareEnrollment.penalties.length - 1 ? `1px solid ${palette.border}` : "none" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.8rem", color: palette.white, marginBottom: 2 }}>{p.type}</div>
                      <div style={{ fontSize: "0.75rem", color: palette.warn, marginBottom: 4 }}>{p.calc}</div>
                      <div style={{ fontSize: "0.72rem", color: palette.textDim, lineHeight: 1.5 }}>{p.note}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ════════ ESTATE & GIFT ════════ */}
        {activeTab === "estate" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {[{ id: "statemap", label: "State Death Taxes" }, { id: "gifting", label: "Gift Tax & Strategy" }].map(t => (
                <button key={t.id} style={s.pill(estateSubTab === t.id)} onClick={() => setEstateSubTab(t.id)}>{t.label}</button>
              ))}
            </div>

            {estateSubTab === "statemap" && (
              <>
                <div style={{ ...s.card, cursor: "default", marginBottom: 10 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>2026 Federal Estate Tax</div>
                  <div style={{ fontSize: "0.7rem", color: palette.textMuted, marginBottom: 10, lineHeight: 1.5 }}>OBBBA set the exemption at $15M per person ($30M couple), indexed for inflation. Top rate: 40%.</div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${palette.border}` }}>
                    <span style={{ fontSize: "0.78rem", color: palette.textDim }}>Per-person Exemption</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>$15,000,000</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${palette.border}` }}>
                    <span style={{ fontSize: "0.78rem", color: palette.textDim }}>Married Couple (with portability)</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>$30,000,000</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <span style={{ fontSize: "0.78rem", color: palette.textDim }}>Top Federal Rate</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: palette.warn, fontFamily: fonts.mono }}>40%</span>
                  </div>
                </div>

                <div style={{ ...s.card, cursor: "default", marginBottom: 10, overflowX: "auto" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>States with Estate Tax (13 + DC)</div>
                  <div style={{ fontSize: "0.68rem", color: palette.textMuted, marginBottom: 10 }}>Exemptions well below federal level — clients in these states may owe state estate tax even if under $15M.</div>
                  <table style={{ ...s.table, fontSize: "0.7rem" }}>
                    <thead><tr><th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>State</th><th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>Exemption</th><th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>Top Rate</th><th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>Notes</th></tr></thead>
                    <tbody>
                      {stateDeathTax.estateTaxStates.map((r, i) => (
                        <tr key={i}><td style={{ ...s.td, padding: "5px 6px", fontWeight: 700, color: palette.accent }}>{r.state}</td><td style={{ ...s.td, padding: "5px 6px", fontFamily: fonts.mono }}>{r.exemption}</td><td style={{ ...s.td, padding: "5px 6px", fontFamily: fonts.mono }}>{r.topRate}</td><td style={{ ...s.td, padding: "5px 6px", fontSize: "0.65rem", color: palette.textMuted }}>{r.note}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ ...s.card, cursor: "default", overflowX: "auto" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>States with Inheritance Tax (5)</div>
                  <div style={{ fontSize: "0.68rem", color: palette.textMuted, marginBottom: 10 }}>Paid by the recipient, not the estate. Rates vary by relationship to decedent. Maryland is the only state with both estate AND inheritance tax.</div>
                  <table style={{ ...s.table, fontSize: "0.7rem" }}>
                    <thead><tr><th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>State</th><th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>Top Rate</th><th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>Exempt Relatives</th></tr></thead>
                    <tbody>
                      {stateDeathTax.inheritanceTaxStates.map((r, i) => (
                        <tr key={i}><td style={{ ...s.td, padding: "5px 6px", fontWeight: 700, color: palette.accent }}>{r.state}</td><td style={{ ...s.td, padding: "5px 6px", fontFamily: fonts.mono }}>{r.topRate}</td><td style={{ ...s.td, padding: "5px 6px", fontSize: "0.65rem" }}>{r.exemptRelatives}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 8, fontSize: "0.68rem", color: palette.textMuted, lineHeight: 1.5 }}>Alabama has no state estate or inheritance tax. The remaining 33 states (+ DC for inheritance) also have no death taxes beyond the federal estate tax.</div>
                </div>
              </>
            )}

            {estateSubTab === "gifting" && (
              <>
                <div style={{ ...s.card, cursor: "default", marginBottom: 10 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>2026 Gift Tax Rules</div>
                  {giftTaxData.keyRules2026.map((r, i) => (
                    <div key={i} style={{ padding: "10px 0", borderBottom: i < giftTaxData.keyRules2026.length - 1 ? `1px solid ${palette.border}` : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.8rem", color: palette.white }}>{r.item}</span>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: palette.accent, fontFamily: fonts.mono }}>{r.value}</span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: palette.textMuted, lineHeight: 1.5 }}>{r.detail}</div>
                    </div>
                  ))}
                </div>
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.88rem", fontWeight: 700, color: palette.accent, marginBottom: 10 }}>Gifting & Transfer Strategies</div>
                  {giftTaxData.strategies.map((tip, i) => (
                    <div key={i} style={{ fontSize: "0.75rem", color: palette.textDim, padding: "6px 0", borderBottom: i < giftTaxData.strategies.length - 1 ? `1px solid ${palette.border}` : "none", lineHeight: 1.55 }}>• {tip}</div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ════════ CHECKLISTS ════════ */}
        {activeTab === "checklist" && (
          <>
            {checklistData.map((section, si) => (
              <div key={si} style={{ ...s.card, cursor: "default", marginBottom: 12 }}>
                <div style={{ fontFamily: fonts.display, fontSize: "0.9rem", fontWeight: 700, color: palette.accent, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${palette.border}` }}>{section.title}</div>
                {section.items.map((item, ii) => {
                  const key = `${si}-${ii}`;
                  const checked = checkStates[key] || false;
                  return (
                    <div key={ii} onClick={() => setCheckStates(p => ({ ...p, [key]: !p[key] }))} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderBottom: ii < section.items.length - 1 ? `1px solid ${palette.border}` : "none", cursor: "pointer" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? palette.accent : palette.borderLight}`, background: checked ? palette.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, transition: "all 0.2s" }}>
                        {checked && <span style={{ color: palette.bg, fontSize: "0.7rem", fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: "0.78rem", color: checked ? palette.textMuted : palette.text, textDecoration: checked ? "line-through" : "none", lineHeight: 1.5, transition: "all 0.2s" }}>
                        {item.text}
                        {item.critical && <span style={{ marginLeft: 6, fontSize: "0.6rem", color: "#ef4444", fontWeight: 700, verticalAlign: "top" }}>CRITICAL</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}

        {/* ════════ CALCULATORS ════════ */}
        {activeTab === "calc" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {[{ id: "compound", label: "Compound Growth" }, { id: "rmdcalc", label: "RMD Estimator" }, { id: "tey", label: "Tax-Equiv Yield" }, { id: "mortgage", label: "Mortgage" }, { id: "carloan", label: "Car Loan" }].map(t => (
                <button key={t.id} style={s.pill(calcMode === t.id)} onClick={() => setCalcMode(t.id)}>{t.label}</button>
              ))}
            </div>

            {calcMode === "compound" && (() => {
              const res = compoundResult();
              return (
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 14 }}>Compound Growth Calculator</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div><label style={s.label}>Initial Investment</label><input style={s.input} type="number" value={calcInputs.principal} onChange={e => setCalcInputs(p => ({ ...p, principal: +e.target.value }))} /></div>
                    <div><label style={s.label}>Annual Return %</label><input style={s.input} type="number" step="0.1" value={calcInputs.rate} onChange={e => setCalcInputs(p => ({ ...p, rate: +e.target.value }))} /></div>
                    <div><label style={s.label}>Years</label><input style={s.input} type="number" value={calcInputs.years} onChange={e => setCalcInputs(p => ({ ...p, years: +e.target.value }))} /></div>
                    <div><label style={s.label}>Monthly Addition</label><input style={s.input} type="number" value={calcInputs.monthly} onChange={e => setCalcInputs(p => ({ ...p, monthly: +e.target.value }))} /></div>
                  </div>
                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: "0.75rem", color: palette.textMuted }}>Future Value</span>
                      <span style={{ fontSize: "1.1rem", fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>{fmt(res.total)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Total Contributions</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(res.principal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Interest Earned</span>
                      <span style={{ fontSize: "0.82rem", color: palette.success, fontFamily: fonts.mono }}>{fmt(res.interest)}</span>
                    </div>
                    <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: palette.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(res.principal / res.total) * 100}%`, background: palette.textMuted, borderRadius: 3 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.62rem", color: palette.textMuted }}>
                      <span>Contributions {((res.principal / res.total) * 100).toFixed(0)}%</span>
                      <span>Growth {((res.interest / res.total) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {calcMode === "rmdcalc" && (() => {
              const res = rmdResult();
              return (
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 14 }}>RMD Estimator</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div><label style={s.label}>Account Balance</label><input style={s.input} type="number" value={rmdInputs.balance} onChange={e => setRmdInputs(p => ({ ...p, balance: +e.target.value }))} /></div>
                    <div><label style={s.label}>Age (73–95)</label><input style={s.input} type="number" min="73" max="95" value={rmdInputs.age} onChange={e => setRmdInputs(p => ({ ...p, age: +e.target.value }))} /></div>
                  </div>
                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: "0.75rem", color: palette.textMuted }}>Required Minimum Distribution</span>
                      <span style={{ fontSize: "1.1rem", fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>{fmt(res.rmd)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Monthly Equivalent</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(res.monthlyEquiv)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>IRS Life Expectancy Factor</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{res.factor}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: "0.7rem", color: palette.textMuted, lineHeight: 1.5 }}>Uses IRS Uniform Lifetime Table (Table III). Does not apply if spouse is sole beneficiary and more than 10 years younger — use Joint Life Expectancy Table instead.</div>
                </div>
              );
            })()}

            {calcMode === "tey" && (() => {
              const { muniYield, fedRate, stateRate } = teyInputs;
              const combinedRate = fedRate + stateRate - (fedRate * stateRate / 100);
              const tey = muniYield / (1 - combinedRate / 100);
              const fedOnlyTey = muniYield / (1 - fedRate / 100);
              const taxSavingsPer100k = (tey - muniYield) / 100 * 100000;
              const breakEvenTaxable = muniYield / (1 - fedRate / 100);

              // Build comparison table for different brackets
              const bracketComparisons = [
                { bracket: "22%", rate: 22 },
                { bracket: "24%", rate: 24 },
                { bracket: "32%", rate: 32 },
                { bracket: "35%", rate: 35 },
                { bracket: "37%", rate: 37 },
              ].map(b => ({
                ...b,
                tey: (muniYield / (1 - (b.rate + stateRate - (b.rate * stateRate / 100)) / 100)).toFixed(2),
              }));

              return (
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 4 }}>Tax-Equivalent Yield Calculator</div>
                  <div style={{ fontSize: "0.72rem", color: palette.textMuted, marginBottom: 14, lineHeight: 1.5 }}>Compare municipal bond yields to taxable alternatives. The TEY shows what a taxable bond would need to yield to match a tax-free muni after taxes.</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div>
                      <label style={s.label}>Muni Yield %</label>
                      <input style={s.input} type="number" step="0.05" value={teyInputs.muniYield} onChange={e => setTeyInputs(p => ({ ...p, muniYield: +e.target.value }))} />
                    </div>
                    <div>
                      <label style={s.label}>Federal Rate %</label>
                      <input style={s.input} type="number" step="1" value={teyInputs.fedRate} onChange={e => setTeyInputs(p => ({ ...p, fedRate: +e.target.value }))} />
                    </div>
                    <div>
                      <label style={s.label}>State Rate %</label>
                      <input style={s.input} type="number" step="0.1" value={teyInputs.stateRate} onChange={e => setTeyInputs(p => ({ ...p, stateRate: +e.target.value }))} />
                    </div>
                  </div>

                  {/* Primary Result */}
                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: "0.75rem", color: palette.textMuted }}>Tax-Equivalent Yield</span>
                      <span style={{ fontSize: "1.3rem", fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>{tey.toFixed(2)}%</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Federal-Only TEY</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fedOnlyTey.toFixed(2)}%</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Combined Marginal Rate</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{combinedRate.toFixed(1)}%</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Tax Savings per $100K Invested</span>
                      <span style={{ fontSize: "0.82rem", color: palette.success, fontFamily: fonts.mono }}>{fmt(taxSavingsPer100k)}/yr</span>
                    </div>

                    {/* Visual bar comparison */}
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${palette.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 60, fontSize: "0.65rem", color: palette.textMuted, textAlign: "right" }}>Muni</div>
                        <div style={{ flex: 1, height: 16, background: palette.border, borderRadius: 4, overflow: "hidden", position: "relative" }}>
                          <div style={{ height: "100%", width: `${Math.min((muniYield / Math.max(tey, 1)) * 100, 100)}%`, background: palette.success, borderRadius: 4, transition: "width 0.3s" }} />
                          <span style={{ position: "absolute", right: 6, top: 1, fontSize: "0.62rem", color: palette.white, fontFamily: fonts.mono, fontWeight: 600 }}>{muniYield.toFixed(2)}%</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, fontSize: "0.65rem", color: palette.textMuted, textAlign: "right" }}>TEY</div>
                        <div style={{ flex: 1, height: 16, background: palette.border, borderRadius: 4, overflow: "hidden", position: "relative" }}>
                          <div style={{ height: "100%", width: "100%", background: palette.accent, borderRadius: 4, transition: "width 0.3s" }} />
                          <span style={{ position: "absolute", right: 6, top: 1, fontSize: "0.62rem", color: palette.bg, fontFamily: fonts.mono, fontWeight: 600 }}>{tey.toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bracket Comparison Table */}
                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: palette.white, marginBottom: 8 }}>TEY Across Tax Brackets</div>
                    <div style={{ fontSize: "0.65rem", color: palette.textMuted, marginBottom: 8 }}>At {muniYield}% muni yield + {stateRate}% state rate</div>
                    <table style={{ ...s.table, fontSize: "0.72rem" }}>
                      <thead>
                        <tr>
                          <th style={{ ...s.th, padding: "6px 8px", fontSize: "0.62rem" }}>Federal Bracket</th>
                          <th style={{ ...s.th, padding: "6px 8px", fontSize: "0.62rem", textAlign: "right" }}>TEY Needed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bracketComparisons.map((b, i) => (
                          <tr key={i} style={{ background: b.rate === fedRate ? palette.accentDim : "transparent" }}>
                            <td style={{ ...s.td, padding: "6px 8px", fontFamily: fonts.mono, fontWeight: b.rate === fedRate ? 700 : 400, color: b.rate === fedRate ? palette.accent : palette.text }}>{b.bracket}</td>
                            <td style={{ ...s.td, padding: "6px 8px", textAlign: "right", fontFamily: fonts.mono, fontWeight: b.rate === fedRate ? 700 : 400, color: b.rate === fedRate ? palette.accent : palette.text }}>{b.tey}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 10, fontSize: "0.7rem", color: palette.textMuted, lineHeight: 1.5 }}>
                    Formula: TEY = Muni Yield ÷ (1 − Combined Tax Rate). A taxable bond must yield at least {tey.toFixed(2)}% to match this {muniYield}% muni after taxes. Consider AMT implications for certain private activity bonds.
                  </div>
                </div>
              );
            })()}

            {calcMode === "mortgage" && (() => {
              const loanAmt = mortgageInputs.price - mortgageInputs.down;
              const r = (mortgageInputs.rate / 100) / 12;
              const n = mortgageInputs.term * 12;
              const monthlyPI = r > 0 ? loanAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loanAmt / n;
              const monthlyTax = mortgageInputs.tax / 12;
              const monthlyIns = mortgageInputs.insurance / 12;
              const totalMonthly = monthlyPI + monthlyTax + monthlyIns;
              const totalPaid = monthlyPI * n;
              const totalInterest = totalPaid - loanAmt;
              const ltv = (loanAmt / mortgageInputs.price) * 100;

              let balance = loanAmt;
              const milestones = [];
              const milestoneYears = [1, 5, 10, 15, 20, 25, 30].filter(y => y <= mortgageInputs.term);
              let totalIntPaid = 0;
              for (let m = 1; m <= n; m++) {
                const intPayment = balance * r;
                const princPayment = monthlyPI - intPayment;
                totalIntPaid += intPayment;
                balance -= princPayment;
                if (milestoneYears.includes(m / 12)) {
                  milestones.push({ year: m / 12, balance: Math.max(0, balance), equity: mortgageInputs.price - Math.max(0, balance), intPaid: totalIntPaid });
                }
              }

              return (
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 14 }}>Mortgage Calculator</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div><label style={s.label}>Home Price</label><input style={s.input} type="number" value={mortgageInputs.price} onChange={e => setMortgageInputs(p => ({ ...p, price: +e.target.value }))} /></div>
                    <div><label style={s.label}>Down Payment</label><input style={s.input} type="number" value={mortgageInputs.down} onChange={e => setMortgageInputs(p => ({ ...p, down: +e.target.value }))} /></div>
                    <div><label style={s.label}>Interest Rate %</label><input style={s.input} type="number" step="0.125" value={mortgageInputs.rate} onChange={e => setMortgageInputs(p => ({ ...p, rate: +e.target.value }))} /></div>
                    <div><label style={s.label}>Term (Years)</label><input style={s.input} type="number" value={mortgageInputs.term} onChange={e => setMortgageInputs(p => ({ ...p, term: +e.target.value }))} /></div>
                    <div><label style={s.label}>Annual Tax</label><input style={s.input} type="number" value={mortgageInputs.tax} onChange={e => setMortgageInputs(p => ({ ...p, tax: +e.target.value }))} /></div>
                    <div><label style={s.label}>Annual Insurance</label><input style={s.input} type="number" value={mortgageInputs.insurance} onChange={e => setMortgageInputs(p => ({ ...p, insurance: +e.target.value }))} /></div>
                  </div>

                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: "0.75rem", color: palette.textMuted }}>Total Monthly Payment</span>
                      <span style={{ fontSize: "1.3rem", fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>{fmt(totalMonthly)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Principal & Interest</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(monthlyPI)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Property Tax</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(monthlyTax)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Insurance</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(monthlyIns)}</span>
                    </div>
                    <div style={{ borderTop: `1px solid ${palette.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Loan Amount</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(loanAmt)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Total Interest Over Life</span>
                      <span style={{ fontSize: "0.82rem", color: palette.warn, fontFamily: fonts.mono }}>{fmt(totalInterest)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>LTV Ratio</span>
                      <span style={{ fontSize: "0.82rem", color: ltv > 80 ? palette.warn : palette.success, fontFamily: fonts.mono }}>{ltv.toFixed(1)}%{ltv > 80 ? " (PMI likely)" : ""}</span>
                    </div>
                  </div>

                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: palette.white, marginBottom: 8 }}>Equity Build Over Time</div>
                    <table style={{ ...s.table, fontSize: "0.7rem" }}>
                      <thead><tr>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>Year</th>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem", textAlign: "right" }}>Balance</th>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem", textAlign: "right" }}>Equity</th>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem", textAlign: "right" }}>Int. Paid</th>
                      </tr></thead>
                      <tbody>
                        {milestones.map((m, i) => (
                          <tr key={i}>
                            <td style={{ ...s.td, padding: "5px 6px", fontFamily: fonts.mono }}>{m.year}</td>
                            <td style={{ ...s.td, padding: "5px 6px", textAlign: "right", fontFamily: fonts.mono }}>{fmt(m.balance)}</td>
                            <td style={{ ...s.td, padding: "5px 6px", textAlign: "right", fontFamily: fonts.mono, color: palette.success }}>{fmt(m.equity)}</td>
                            <td style={{ ...s.td, padding: "5px 6px", textAlign: "right", fontFamily: fonts.mono, color: palette.warn }}>{fmt(m.intPaid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {calcMode === "carloan" && (() => {
              const loanAmt = carInputs.price - carInputs.down - carInputs.tradeIn;
              const r = (carInputs.rate / 100) / 12;
              const n = carInputs.term;
              const monthlyPayment = r > 0 ? loanAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loanAmt / n;
              const totalPaid = monthlyPayment * n;
              const totalInterest = totalPaid - loanAmt;
              const totalCost = carInputs.price + totalInterest - carInputs.tradeIn;

              const depreciationSchedule = [];
              let carValue = carInputs.price;
              let loanBalance = loanAmt;
              for (let yr = 1; yr <= Math.ceil(n / 12); yr++) {
                const depRate = yr === 1 ? 0.20 : 0.15;
                carValue = carValue * (1 - depRate);
                const monthsInYear = Math.min(12, n - (yr - 1) * 12);
                for (let m = 0; m < monthsInYear; m++) {
                  const intPmt = loanBalance * r;
                  loanBalance -= (monthlyPayment - intPmt);
                }
                loanBalance = Math.max(0, loanBalance);
                depreciationSchedule.push({ year: yr, value: carValue, balance: loanBalance, equity: carValue - loanBalance });
              }

              return (
                <div style={{ ...s.card, cursor: "default" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: "0.95rem", fontWeight: 700, color: palette.accent, marginBottom: 14 }}>Car Loan Calculator</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div><label style={s.label}>Vehicle Price</label><input style={s.input} type="number" value={carInputs.price} onChange={e => setCarInputs(p => ({ ...p, price: +e.target.value }))} /></div>
                    <div><label style={s.label}>Down Payment</label><input style={s.input} type="number" value={carInputs.down} onChange={e => setCarInputs(p => ({ ...p, down: +e.target.value }))} /></div>
                    <div><label style={s.label}>Interest Rate %</label><input style={s.input} type="number" step="0.1" value={carInputs.rate} onChange={e => setCarInputs(p => ({ ...p, rate: +e.target.value }))} /></div>
                    <div><label style={s.label}>Term (Months)</label><input style={s.input} type="number" value={carInputs.term} onChange={e => setCarInputs(p => ({ ...p, term: +e.target.value }))} /></div>
                    <div style={{ gridColumn: "1 / -1" }}><label style={s.label}>Trade-In Value</label><input style={s.input} type="number" value={carInputs.tradeIn} onChange={e => setCarInputs(p => ({ ...p, tradeIn: +e.target.value }))} /></div>
                  </div>

                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: "0.75rem", color: palette.textMuted }}>Monthly Payment</span>
                      <span style={{ fontSize: "1.3rem", fontWeight: 700, color: palette.accent, fontFamily: fonts.mono }}>{fmt(monthlyPayment)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Amount Financed</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(loanAmt)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Total Interest</span>
                      <span style={{ fontSize: "0.82rem", color: palette.warn, fontFamily: fonts.mono }}>{fmt(totalInterest)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Total Cost of Vehicle</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>{fmt(totalCost)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.72rem", color: palette.textMuted }}>Cost per Mile (12K mi/yr)</span>
                      <span style={{ fontSize: "0.82rem", color: palette.text, fontFamily: fonts.mono }}>${(totalCost / (12000 * (n / 12))).toFixed(2)}</span>
                    </div>
                    <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: palette.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(loanAmt / totalPaid) * 100}%`, background: palette.textMuted, borderRadius: 3 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.62rem", color: palette.textMuted }}>
                      <span>Principal {((loanAmt / totalPaid) * 100).toFixed(0)}%</span>
                      <span>Interest {((totalInterest / totalPaid) * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  <div style={{ background: palette.bg, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: palette.white, marginBottom: 4 }}>Estimated Value vs. Loan Balance</div>
                    <div style={{ fontSize: "0.62rem", color: palette.textMuted, marginBottom: 8 }}>Rough depreciation (20% yr 1, 15%/yr after). Negative equity flagged.</div>
                    <table style={{ ...s.table, fontSize: "0.7rem" }}>
                      <thead><tr>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem" }}>Year</th>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem", textAlign: "right" }}>Est. Value</th>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem", textAlign: "right" }}>Balance</th>
                        <th style={{ ...s.th, padding: "5px 6px", fontSize: "0.58rem", textAlign: "right" }}>Equity</th>
                      </tr></thead>
                      <tbody>
                        {depreciationSchedule.map((d, i) => (
                          <tr key={i}>
                            <td style={{ ...s.td, padding: "5px 6px", fontFamily: fonts.mono }}>{d.year}</td>
                            <td style={{ ...s.td, padding: "5px 6px", textAlign: "right", fontFamily: fonts.mono }}>{fmt(d.value)}</td>
                            <td style={{ ...s.td, padding: "5px 6px", textAlign: "right", fontFamily: fonts.mono }}>{fmt(d.balance)}</td>
                            <td style={{ ...s.td, padding: "5px 6px", textAlign: "right", fontFamily: fonts.mono, color: d.equity < 0 ? "#ef4444" : palette.success, fontWeight: d.equity < 0 ? 700 : 400 }}>{fmt(d.equity)}{d.equity < 0 ? " ⚠" : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
      <div style={s.nav}>
        {tabs.map(t => (
          <button key={t.id} style={s.navBtn(activeTab === t.id)} onClick={() => { setActiveTab(t.id); setSelectedTrust(null); }}>
            <span style={s.navIcon}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AdvisorToolkit;
