#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   ADD BRIEF — prepend one market brief to src/data/market-briefs.json
   and roll off anything older than the last `keepDays` trading days.

   Usage:  node scripts/add-brief.mjs path/to/brief.json

   The brief file is one object with this shape (all fields optional
   except date, session, headline):
   {
     "date": "2026-10-22",            // trading date, America/Chicago
     "session": "morning" | "afternoon",
     "generatedAt": "2026-10-22T12:46:00Z",
     "headline": "one sentence",
     "levels":   [{ "label": "S&P 500 fut", "value": "7,723", "change": "-1.0%" }],
     "data":     [{ "name": "Initial claims", "actual": "218K", "consensus": "225K",
                    "prior": "221K", "read": "firmer", "reaction": "yields +2bp" }],
     "drivers":  ["bullet", "bullet"],
     "sectors":  { "leaders": "Energy, Utilities", "laggards": "Tech, Discretionary" },
     "calendar": [{ "time": "9:00 CT", "item": "Existing home sales", "consensus": "4.0M" }],
     "afterHours": [{ "ticker": "NFLX", "move": "-4%", "why": "one line" }],
     "movers":   [{ "ticker": "TSLA", "move": "+3.4%", "why": "one line" }],
     "sources":  [{ "title": "CNBC live updates", "url": "https://..." }]
   }

   A brief for the same date + session replaces the earlier one, so a
   re-run never duplicates. Newest first in the file.
──────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, "../src/data/market-briefs.json");

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/add-brief.mjs path/to/brief.json");
  process.exit(1);
}

const brief = JSON.parse(readFileSync(resolve(input), "utf8"));
for (const k of ["date", "session", "headline"]) {
  if (!brief[k]) { console.error(`brief is missing required field: ${k}`); process.exit(1); }
}
if (!["morning", "afternoon"].includes(brief.session)) {
  console.error(`session must be "morning" or "afternoon", got ${brief.session}`);
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(brief.date)) {
  console.error(`date must be YYYY-MM-DD, got ${brief.date}`);
  process.exit(1);
}
brief.id = `${brief.date}-${brief.session}`;
brief.generatedAt ||= new Date().toISOString();

const file = JSON.parse(readFileSync(DATA, "utf8"));
const keepDays = file.keepDays || 15;

// Replace same-day same-session, then prepend.
let briefs = (file.briefs || []).filter((b) => b.id !== brief.id);
briefs.unshift(brief);

// Sort newest first: by date desc, afternoon before morning on the same day.
const order = { afternoon: 0, morning: 1 };
briefs.sort((a, b) => (a.date === b.date ? order[a.session] - order[b.session] : b.date.localeCompare(a.date)));

// Keep the last `keepDays` distinct trading dates.
const dates = [...new Set(briefs.map((b) => b.date))].slice(0, keepDays);
briefs = briefs.filter((b) => dates.includes(b.date));

writeFileSync(DATA, JSON.stringify({ keepDays, briefs }, null, 2) + "\n");
console.log(`Added ${brief.id}. ${briefs.length} briefs across ${dates.length} days on file.`);
