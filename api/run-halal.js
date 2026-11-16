/* ────────────────────────────────────────────────────────────────
   POST /api/run-halal
   Lets the app's "Run now" button start the Halal ideas workflow on
   GitHub without putting a GitHub token in the browser.

   Body: { pin, action }
     action "status"     → latest run of the workflow
     action "compliance" → start a quick Halal Terminal status refresh
     action "full"       → start the full halal screen

   Vercel environment variables (Project → Settings → Environment Variables):
     GITHUB_DISPATCH_TOKEN  fine-grained GitHub token for this repo only,
                            with Actions: Read and write
     RUN_PIN                passphrase the app must send; pick something
                            long, this endpoint is reachable by anyone
──────────────────────────────────────────────────────────────── */
const crypto = require("crypto");

const REPO = process.env.GITHUB_REPO || "autiger3424/advisor-toolkit";
const WORKFLOW = "halal-screen.yml";
const API = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function samePin(given, expected) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function gh(token, path, init = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "advisor-toolkit-run-button",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

const summarize = (run) =>
  run ? { status: run.status, conclusion: run.conclusion, startedAt: run.created_at, event: run.event, url: run.html_url } : null;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const pin = process.env.RUN_PIN;
  if (!token || !pin) return res.status(503).json({ error: "not_configured" });

  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  if (!body.pin || !samePin(body.pin, pin)) {
    await sleep(1000); // slow down guessing
    return res.status(401).json({ error: "bad_pin" });
  }

  try {
    const latestRes = await gh(token, "/runs?per_page=1");
    if (!latestRes.ok) return res.status(502).json({ error: "github", detail: latestRes.status });
    const latest = (await latestRes.json()).workflow_runs?.[0] || null;

    if (body.action === "status") return res.status(200).json({ ok: true, latest: summarize(latest) });
    if (body.action !== "compliance" && body.action !== "full") return res.status(400).json({ error: "action" });

    // One run at a time: a second run would double-spend the data quotas and fight over the same file.
    if (latest && latest.status !== "completed") return res.status(409).json({ error: "busy", latest: summarize(latest) });

    const start = await gh(token, "/dispatches", {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { compliance_only: body.action === "compliance" ? "true" : "false" } }),
    });
    if (start.status !== 204) return res.status(502).json({ error: "github", detail: start.status });
    return res.status(200).json({ ok: true, started: body.action });
  } catch (err) {
    return res.status(502).json({ error: "github", detail: "network" });
  }
};
