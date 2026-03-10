// ============================================================
//  THE RED GROUP — Notion Proxy Function
//  netlify/functions/notion-proxy.js
//
//  Uses Node built-in `https` — zero npm dependencies,
//  works on Netlify Node 14 / 16 / 18 / 20.
//
//  SETUP
//  ─────
//  1. Netlify → Site Settings → Environment Variables
//       NOTION_TOKEN = secret_xxxxxxxxxxxxxxxxxxxxxxxx
//
//  2. Paste your 32-char database IDs in DATABASE_IDS below.
//
//  3. In Notion, open each database → ••• → Add connections
//     → "RED Group Website" (your integration name).
//     The DB will 404 if this step is skipped.
//
//  DATABASE COLUMN REFERENCE
//  ─────────────────────────────────────────────────────────
//
//  indexhero  "Homepage Config"
//    Name (title)  → "Hero Image" | "Hero Stat Number" | "Hero Stat Label"
//    Value (text)  → e.g. "$14M+"
//    Image (url)   → only used for "Hero Image" row
//
//  indexstats  "Homepage Stats"
//    Name (title)   → "Properties Served" etc.
//    Value (text)   → "150+"
//    Order (number) → 1 2 3 4
//
//  brokeragepage  "Brokerage Page Config"
//    Name (title)  → "Avg Days to Contract" | "Hero Image"
//    Value (text)  → "9 Days"
//    Image (url)   → hero image URL
//
//  listings  "Listings"
//    Name (title)          → property address
//    Status (select)       → "For Sale" | "For Rent" | "Under Contract" | "Sold"
//    Price (text)          → "$329,000"
//    Beds (number)         → 3
//    Baths (number)        → 2.5
//    Sqft (text)           → "1,840"
//    City (text)           → "Athens, GA"
//    PropertyType (select) → "Single-Family" | "Multi-Family" | "Condo" | "Land" | "Commercial"
//    Description (text)    → property description
//    Features (text)       → comma-separated features
//    Image (url)           → direct image URL
//    Featured (checkbox)   → check to show on brokerage page
//
//  projects  "Projects"
//    Name (title)       → project name
//    Division (select)  → "Brokerage"|"Development"|"Design"|"Management"
//    Status (select)    → "Active"|"Completed"|"Pipeline"|"Under Contract"
//    Location (text)    → "Athens, GA"
//    Year (number)      → 2025
//    Value (text)       → "$1.8M"
//    ValueLabel (text)  → "Project Value"
//    Units (text)       → "6 Units"
//    SqFt (text)        → "5,400 sqft"
//    Description (text) → project description
//    Highlights (text)  → comma-separated bullet points
//    Image (url)        → direct image URL
//
//  testimonials  "Testimonials"
//    Name (title)      → client name
//    Quote (text)      → testimonial text
//    Role (text)       → "Home Seller · Athens, GA"
//    Stars (number)    → 5
//    Division (select) → "Brokerage"|"Management"|"Design"|"Development"|"About"
//    Active (checkbox) → uncheck to hide
//    Order (number)    → display order within division
//
//  team  "Team"
//    Name (title)       → full name
//    Title (text)       → job title
//    Bio (text)         → 2-3 sentence bio
//    Credentials (text) → comma-separated e.g. "GA Broker #82466, PE License"
//    Photo (url)        → headshot image URL
//    Active (checkbox)  → show/hide
//    Order (number)     → display order
//
//  pmstats  "Property Management Stats"
//    Name (title)   → "Avg. Occupancy Rate" etc.
//    Value (text)   → "98%"
//    Order (number) → 1 2 3 4
//
//  devmetrics  "Development Metrics"
//    Name (title)   → "Development Pipeline" etc.
//    Value (text)   → "$4.2M+"
//    Order (number) → 1 2 3 4
//
//  devstats  "Development Stats"
//    Name (title)   → "Pipeline Value" etc.
//    Value (text)   → "$4.2M+"
//    Order (number) → 1 2 3 4
// ============================================================

"use strict";
const https = require("https");

// ── PASTE YOUR DATABASE IDs HERE ─────────────────────────────────────────────
const DATABASE_IDS = {
  indexhero:    "f013290775aa83d284e9810acc307b64",
  indexstats:   "31f3290775aa808c9607f665dfa6cd5f",
  brokeragepage:"31f3290775aa80ab9154cbe37f1c3df0",
  listings:     "31f3290775aa8074b28bd5a6749ecb48",
  projects:     "31f3290775aa8099bf08e57f1169a3dd",
  testimonials: "31f3290775aa8033ae44f7575f428859",
  team:         "31f3290775aa80aab084fde2fa2e677c,
  pmstats:      "31f3290775aa80e1be4fd15fba33d531",
  devmetrics:   "2713290775aa8308bf4c011f83125e99",
  devstats:     "2233290775aa825daabb0145ca8b5900",
};
// ─────────────────────────────────────────────────────────────────────────────

const NOTION_VERSION = "2022-06-28";

// ── Node https wrapper (no fetch, no axios, no npm needed) ───────────────────
function notionQuery(dbId, token, body) {
  return new Promise((resolve, reject) => {
    const payload  = JSON.stringify(body);
    const options  = {
      hostname: "api.notion.com",
      path:     `/v1/databases/${dbId}/query`,
      method:   "POST",
      headers:  {
        "Authorization":  `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end",  ()      => { resolve({ status: res.statusCode, raw }); });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Filter builder ───────────────────────────────────────────────────────────
function buildFilter(rawDb, params) {
  const f = [];

  if (params.division) f.push({ property: "Division", select: { equals: params.division } });
  if (params.featured === "true") f.push({ property: "Featured", checkbox: { equals: true } });
  if (rawDb === "sale") f.push({ property: "Status", select: { equals: "For Sale" } });
  if (rawDb === "rent") f.push({ property: "Status", select: { equals: "For Rent" } });

  if (!f.length) return undefined;
  return f.length === 1 ? f[0] : { and: f };
}

// ── Sort builder ─────────────────────────────────────────────────────────────
function buildSorts(dbKey) {
  const orderedDbs = ["indexhero","indexstats","brokeragepage","pmstats",
                      "devmetrics","devstats","team","testimonials"];
  if (orderedDbs.includes(dbKey)) {
    return [{ property: "Order", direction: "ascending" }];
  }
  return [{ timestamp: "created_time", direction: "descending" }];
}

// ── Response helper ──────────────────────────────────────────────────────────
function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":               "public, s-maxage=300, max-age=60",
    },
    body: JSON.stringify(body),
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }

  // Auth
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return respond(500, {
      error: "NOTION_TOKEN not set",
      help:  "Netlify → Site Settings → Environment Variables → add NOTION_TOKEN",
    });
  }

  // Resolve db key
  const params = event.queryStringParameters || {};
  const rawDb  = (params.db || "").toLowerCase();
  const dbKey  = (rawDb === "sale" || rawDb === "rent") ? "listings"
               : rawDb === "stats" ? "indexstats"
               : rawDb;
  const dbId   = DATABASE_IDS[dbKey];

  if (!dbId || dbId.startsWith("PASTE_")) {
    return respond(400, {
      error:      `Database "${rawDb}" not configured`,
      help:       `In notion-proxy.js, paste your Notion DB ID for key "${dbKey}" in DATABASE_IDS`,
      configured: Object.entries(DATABASE_IDS)
        .filter(([, v]) => v && !v.startsWith("PASTE_"))
        .map(([k]) => k),
    });
  }

  // Build request body
  const reqBody = { page_size: Math.min(parseInt(params.limit) || 100, 100) };
  const filter  = buildFilter(rawDb, params);
  const sorts   = buildSorts(dbKey);
  if (filter) reqBody.filter = filter;
  if (sorts.length) reqBody.sorts = sorts;

  try {
    const { status, raw } = await notionQuery(dbId, token, reqBody);

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      console.error("Non-JSON from Notion:", raw.slice(0, 200));
      return respond(502, { error: "Notion returned non-JSON", detail: raw.slice(0, 200) });
    }

    if (status !== 200) {
      console.error(`Notion ${status} for db=${dbKey}:`, parsed);
      return respond(status, {
        error:  `Notion API error ${status}: ${parsed.code || "unknown"}`,
        detail: parsed.message || "",
        help:
          status === 401 ? "NOTION_TOKEN is wrong or expired — regenerate it at notion.so/my-integrations" :
          status === 404 ? `DB "${dbKey}" not found. Check the ID in DATABASE_IDS and that the DB is connected to your integration (open DB → ••• → Add connections)` :
          status === 400 ? "Bad filter/sort — check column names match the guide in notion-proxy.js" :
          "Open Netlify → Functions → notion-proxy → View log for full stack trace",
      });
    }

    return respond(200, parsed);

  } catch (err) {
    console.error("notion-proxy crash:", err);
    return respond(502, {
      error:   "Function crashed — likely a network or config issue",
      message: err.message,
      help:    "Open Netlify → Functions tab → notion-proxy → click a recent invocation to see the full log",
    });
  }
};
