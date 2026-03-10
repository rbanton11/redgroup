// ============================================================
//  THE RED GROUP — Notion Proxy  v3
//  netlify/functions/notion-proxy.js
//
//  Uses Node built-in `https` only — zero npm dependencies.
//
//  SETUP
//  ─────
//  1. Netlify → Site Settings → Environment Variables
//       NOTION_TOKEN = secret_xxxxxxxxxxxxxxxxxxxxxxxx
//
//  2. Paste your database IDs in DATABASE_IDS below.
//     IDs can include dashes or not — both work, we strip them.
//     Get the ID from the Notion URL:
//       notion.so/myworkspace/THIS-PART-IS-THE-ID?v=...
//       (everything between the last / and the ?)
//
//  3. In Notion: open each database → ••• (top right) →
//     "Add connections" → select "RED Group Website"
//     Skip this and you get a 404.
//
//  DATABASE COLUMN REFERENCE  (property name → Notion type)
//  ─────────────────────────────────────────────────────────
//  indexhero      "Homepage Config"
//    Name(title) Value(text) Image(url)
//    Rows: "Hero Image" | "Hero Stat Number" | "Hero Stat Label"
//
//  indexstats     "Homepage Stats"
//    Name(title) Value(text) Order(number)
//
//  brokeragepage  "Brokerage Page Config"
//    Name(title) Value(text) Image(url)
//    Rows: "Avg Days to Contract" | "Hero Image"
//
//  listings       "Listings"
//    Name(title) Status(select) Price(text) Beds(number)
//    Baths(number) Sqft(text) City(text) PropertyType(select)
//    Description(text) Features(text) Image(url) Featured(checkbox)
//
//  projects       "Projects"
//    Name(title) Division(select) Status(select) Location(text)
//    Year(number) Value(text) ValueLabel(text) Units(text)
//    SqFt(text) Description(text) Highlights(text) Image(url)
//
//  testimonials   "Testimonials"
//    Name(title) Quote(text) Role(text) Stars(number)
//    Division(select) Active(checkbox) Order(number)
//
//  team           "Team"
//    Name(title) Title(text) Bio(text) Credentials(text)
//    Photo(url) Active(checkbox) Order(number)
//
//  pmstats        "Property Management Stats"
//    Name(title) Value(text) Order(number)
//
//  devmetrics     "Development Metrics"
//    Name(title) Value(text) Order(number)
//
//  devstats       "Development Stats"
//    Name(title) Value(text) Order(number)
// ============================================================

"use strict";
const https = require("https");

// ── PASTE YOUR DATABASE IDs HERE ─────────────────────────────────────────────
// Dashes are fine — we strip them automatically
const DATABASE_IDS = {
  indexhero:     "f013290775aa83d284e9810acc307b64",
  indexstats:    "31f3290775aa808c9607f665dfa6cd5f",
  brokeragepage: "31f3290775aa80ab9154cbe37f1c3df0",
  listings:      "31f3290775aa8074b28bd5a6749ecb48",
  projects:      "31f3290775aa8099bf08e57f1169a3dd",
  testimonials:  "31f3290775aa8033ae44f7575f428859",
  team:          "31f3290775aa80aab084fde2fa2e677c",
  pmstats:       "31f3290775aa80e1be4fd15fba33d531",
  devmetrics:    "2713290775aa8308bf4c011f83125e99",
  devstats:      "2233290775aa825daabb0145ca8b5900",
};
// ─────────────────────────────────────────────────────────────────────────────

const NOTION_VERSION = "2022-06-28";

// Strip dashes from Notion IDs — handles both formats Notion shows
function cleanId(id) {
  return (id || "").replace(/-/g, "").trim();
}

// Plain Node https POST — no fetch, no axios, no npm
function notionPost(path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "api.notion.com",
        port: 443,
        path: path,
        method: "POST",
        headers: {
          "Authorization":  `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end",  ()  => { resolve({ status: res.statusCode, body: data }); });
      }
    );
    req.on("error", (e) => { reject(new Error("HTTPS request failed: " + e.message)); });
    req.setTimeout(8000, () => { req.destroy(new Error("Notion request timed out after 8s")); });
    req.write(payload);
    req.end();
  });
}

function buildFilter(rawDb, params) {
  const f = [];
  if (params.division) f.push({ property: "Division", select: { equals: params.division } });
  if (params.featured === "true") f.push({ property: "Featured", checkbox: { equals: true } });
  if (rawDb === "sale") f.push({ property: "Status", select: { equals: "For Sale" } });
  if (rawDb === "rent") f.push({ property: "Status", select: { equals: "For Rent" } });
  if (!f.length) return undefined;
  return f.length === 1 ? f[0] : { and: f };
}

function buildSorts(dbKey) {
  const byOrder = ["indexhero","indexstats","brokeragepage","pmstats","devmetrics","devstats","team","testimonials"];
  if (byOrder.includes(dbKey)) return [{ property: "Order", direction: "ascending" }];
  return [{ timestamp: "created_time", direction: "descending" }];
}

function respond(code, obj) {
  return {
    statusCode: code,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":               "public, s-maxage=300, max-age=60",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }

  // ── Step 1: token check ────────────────────────────────
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return respond(500, {
      error: "NOTION_TOKEN environment variable is missing",
      help:  "Netlify → Site Settings → Environment Variables → add NOTION_TOKEN = secret_xxx",
      step:  1,
    });
  }
  if (!token.startsWith("secret_")) {
    return respond(500, {
      error: `NOTION_TOKEN looks wrong — got "${token.slice(0,10)}..." but it should start with "secret_"`,
      help:  "Regenerate your token at notion.so/my-integrations",
      step:  1,
    });
  }

  // ── Step 2: resolve database ───────────────────────────
  const params = event.queryStringParameters || {};
  const rawDb  = (params.db || "").toLowerCase();

  const dbKey =
    rawDb === "sale" || rawDb === "rent" ? "listings" :
    rawDb === "stats" ? "indexstats" :
    rawDb;

  const rawId = DATABASE_IDS[dbKey];

  if (!rawId || rawId.startsWith("PASTE_")) {
    return respond(400, {
      error: `Database key "${dbKey}" has no ID set`,
      help:  `Open netlify/functions/notion-proxy.js and replace "PASTE_${dbKey.toUpperCase()}_DB_ID" with your actual Notion DB ID`,
      configured: Object.entries(DATABASE_IDS)
        .filter(([, v]) => v && !v.startsWith("PASTE_"))
        .map(([k]) => k),
      step: 2,
    });
  }

  const dbId = cleanId(rawId);

  if (dbId.length !== 32) {
    return respond(400, {
      error:  `Database ID for "${dbKey}" is the wrong length (got ${dbId.length} chars after stripping dashes, need exactly 32)`,
      got:    rawId,
      help:   "Copy just the ID portion from the Notion URL — it's the part between the last / and the ?v= query string",
      step:   2,
    });
  }

  // ── Step 3: call Notion API ────────────────────────────
  const reqBody = { page_size: Math.min(parseInt(params.limit) || 100, 100) };
  const filter  = buildFilter(rawDb, params);
  const sorts   = buildSorts(dbKey);
  if (filter) reqBody.filter = filter;
  if (sorts.length) reqBody.sorts = sorts;

  let status, rawBody;
  try {
    const result = await notionPost(`/v1/databases/${dbId}/query`, token, reqBody);
    status  = result.status;
    rawBody = result.body;
  } catch (err) {
    console.error("[notion-proxy] network error:", err.message);
    return respond(502, {
      error:   "Could not reach api.notion.com",
      message: err.message,
      help:    "This is a network-level error inside the Netlify function. Check Netlify function logs.",
      step:    3,
    });
  }

  // ── Step 4: parse response ─────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    console.error("[notion-proxy] non-JSON from Notion:", rawBody.slice(0, 300));
    return respond(502, {
      error:   "Notion returned non-JSON (likely an outage or bad auth)",
      preview: rawBody.slice(0, 300),
      step:    4,
    });
  }

  if (status !== 200) {
    console.error(`[notion-proxy] Notion ${status} for "${dbKey}" (${dbId}):`, parsed);
    return respond(status, {
      error:  `Notion API returned ${status}: ${parsed.code || "unknown_error"}`,
      detail: parsed.message || "",
      dbKey,
      dbId,
      help:
        status === 401 ? "Your NOTION_TOKEN is invalid or revoked. Regenerate at notion.so/my-integrations and update the Netlify env var." :
        status === 403 ? `The integration does not have access to the "${dbKey}" database. Open the DB in Notion → ••• → Add connections → select your integration.` :
        status === 404 ? `Database "${dbKey}" (ID: ${dbId}) not found. Verify the ID is correct AND that the DB is shared with your integration.` :
        status === 400 ? "Notion rejected the query. One of your column names in the filter may not exist — check names match exactly." :
        "See Netlify Functions log for full details.",
      step: 4,
    });
  }

  return respond(200, parsed);
};
