# Advisor Toolkit v2 — 2026 Edition

Complete, ready-to-deploy project. Includes all 7 tabs (Trusts, Tax Ref,
Retire, Soc Sec, Estate, Lists, Calc) plus the new Roth Conversion Window
calculator. Every data table updated to tax year 2026 (IRS Rev. Proc.
2025-32 and Notice 2025-67). Verified: builds clean with zero warnings.

## Get it running (PowerShell)

Extract this zip so you have a folder like:
  C:\Users\autig\Documents\advisor-toolkit

Then:

  cd C:\Users\autig\Documents\advisor-toolkit
  npm install
  npm start

Browser opens at http://localhost:3000. Check the Calc tab for the
Roth Conversion button.

## Deploy to Vercel

Stop the dev server (Ctrl+C), then:

  npm install -g vercel     (first time only)
  vercel login              (first time only)
  vercel --prod

Vercel prints your live URL when it finishes. If it asks questions,
accept the defaults (it auto-detects Create React App).

## On your phone

Open the Vercel URL in Safari/Chrome -> Share -> Add to Home Screen.
If you had the old version installed, remove it and re-add, or
force-close and reopen so the cached version clears.

## Updating data next year

All tax-year figures are constants near the top of
src/AdvisorToolkit.jsx, clearly labeled:
  - taxData (brackets, cap gains, key limits)
  - retirementData (contribution limits, RMD rules)
  - irmaaData (Medicare IRMAA tiers + premiums)
  - rothBrackets2026 / rothStdDeduction / rothIrmaaTiers (Roth calculator)
  - ssData, giftTaxData, stateDeathTax

Ask Claude to refresh them for the new tax year and rebuild.
