// ============================================================
//  THE RED GROUP — Notion Proxy Function
//  File: netlify/functions/notion-proxy.js
//
//  This single function handles ALL Notion database queries
//  across every page of the site. It keeps your API key
//  secret (never exposed in browser) and returns clean JSON.
//
//  SETUP — 3 steps:
//  ─────────────────────────────────────────────────────────
//  1. Go to https://www.notion.so/my-integrations
//     Create an integration called "RED Group Website"
//     Copy the "Internal Integration Token" (starts with secret_)
//
//  2. In Netlify → Site Settings → Environment Variables, add:
//       Key:   NOTION_TOKEN
//       Value: secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//
//  3. For each database below, open it in Notion, click "..."
//     → "Add connections" → select your "RED Group Website"
//     integration. Then copy the database ID from the URL:
//     notion.so/{workspace}/{DATABASE_ID}?v=...
//     Paste each ID into the DATABASE_IDS object below.
//
//  DATABASE SETUP GUIDE
//  ─────────────────────────────────────────────────────────
//  Create each database in Notion with exactly these columns:
//
//  ── HOMEPAGE HERO ("Homepage Config") ────────────────────
//  Name (title)   → "Hero Image" | "Hero Stat Number" | "Hero Stat Label"
//  Value (text)   → e.g. "$14M+" or "Transactions Closed"
//  Image (url)    → paste image URL when Name = "Hero Image"
//
//  ── INDEX STATS ("Homepage Stats") ───────────────────────
//  Name (title)   → stat label e.g. "Properties Served"
//  Value (text)   → e.g. "150+"
//  Order (number) → 1, 2, 3, 4
//
//  ── BROKERAGE PAGE ("Brokerage Page Config") ─────────────
//  Name (title)   → "Avg Days to Contract" | "Hero Image"
//  Value (text)   → e.g. "9 Days"
//  Image (url)    → used when Name = "Hero Image"
//
//  ── LISTINGS ("Listings") ────────────────────────────────
//  Name (title)       → property address
//  Status (select)    → "For Sale" | "For Rent" | "Under Contract" | "Sold"
//  Price (text)       → "$329,000"
//  Beds (number)      → 3
//  Baths (number)     → 2
//  Sqft (text)        → "1,840"
//  City (text)        → "Athens, GA"
//  PropertyType (select) → "Single-Family" | "Multi-Family" | "Condo" | "Land" | "Commercial"
//  Description (text) → property description
//  Features (text)    → comma-separated e.g. "Hardwood floors, Updated kitchen"
//  Image (url)        → direct image URL
//  Featured (checkbox)→ check to show on Brokerage page
//  ListDate (text)    → "Jan 2025"
//
//  ── PROJECTS ("Projects") ────────────────────────────────
//  Name (title)        → project name
//  Division (select)   → "Brokerage" | "Development" | "Design" | "Management"
//  Status (select)     → "Active" | "Completed" | "Pipeline" | "Under Contract"
//  Location (text)     → "Athens, GA"
//  Year (number)       → 2025
//  Value (text)        → "$1.8M" or "34% ROI"
//  ValueLabel (text)   → "Project Value" or "Return on Investment"
//  Units (text)        → "6 Units" or "4.2 Acres"
//  SqFt (text)         → "5,400 sqft"
//  Description (text)  → project description
//  Highlights (text)   → comma-separated bullet points
//  Image (url)         → direct image URL
//
//  ── TESTIMONIALS ("Testimonials") ────────────────────────
//  Name (title)       → client name
//  Quote (text)       → testimonial text
//  Role (text)        → "Home Seller · Athens, GA"
//  Stars (number)     → 5
//  Division (select)  → "Brokerage" | "Management" | "Design" | "Development" | "About"
//  Active (checkbox)  → uncheck to hide without deleting
//  Order (number)     → display order within each division
//
//  ── TEAM ("Team") ────────────────────────────────────────
//  Name (title)       → full name
//  Title (text)       → "Principal Broker & Licensed PE"
//  Bio (text)         → 2-3 sentence bio
//  Credentials (text) → comma-separated e.g. "GA Broker #82466, PE License"
//  Photo (url)        → direct URL to headshot image
//  Active (checkbox)  → show/hide
//  Order (number)     → display order
//
//  ── PM STATS ("Property Management Stats") ───────────────
//  Name (title)   → stat label e.g. "Avg. Occupancy Rate"
//  Value (text)   → e.g. "98%"
//  Order (number) → 1, 2, 3, 4
//
//  ── DEV METRICS ("Development Metrics") ─────────────────
//  Name (title)   → e.g. "Development Pipeline"
//  Value (text)   → e.g. "$4.2M+"
//  Order (number) → 1, 2, 3, 4
//
//  ── DEV STATS ("Development Stats") ─────────────────────
//  Name (title)   → e.g. "Pipeline Value"
//  Value (text)   → e.g. "$4.2M+"
//  Order (number) → 1, 2, 3, 4
// ============================================================

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
  stats:        "31f3290775aa808c9607f665dfa6cd5f",   // alias
};
// ─────────────────────────────────────────────────────────────────────────────

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE    = "https://api.notion.com/v1";

// Build Notion filter based on query params
function buildFilter(db, params) {
  const filters = [];

  // Division filter (testimonials, projects)
  if (params.division) {
    filters.push({
      property: "Division",
      select: { equals: params.division }
    });
  }

  // Featured filter (listings for brokerage page)
  if (params.featured === "true") {
    filters.push({
      property: "Featured",
      checkbox: { equals: true }
    });
  }

  // For rent/sale splits on listings page
  if (db === "sale") {
    filters.push({ property: "Status", select: { equals: "For Sale" } });
  }
  if (db === "rent") {
    filters.push({ property: "Status", select: { equals: "For Rent" } });
  }

  if (!filters.length) return undefined;
  return filters.length === 1 ? filters[0] : { and: filters };
}

// Build Notion sort
function buildSort(db) {
  // Most DBs sort by Order ascending
  const orderSorts = ["indexstats","indexhero","brokeragepage","pmstats","devmetrics","devstats","stats","team"];
  if (orderSorts.includes(db)) {
    return [{ property: "Order", direction: "ascending" }];
  }
  if (db === "testimonials") {
    return [{ property: "Order", direction: "ascending" }];
  }
  if (db === "projects" || db === "sale" || db === "rent" || db === "listings") {
    return [{ timestamp: "created_time", direction: "descending" }];
  }
  return [];
}

exports.handler = async function(event) {
  const token = process.env.NOTION_TOKEN;

  // ── Auth check ─────────────────────────────────────────
  if (!token) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "NOTION_TOKEN environment variable is not set.",
        help: "In Netlify → Site Settings → Environment Variables, add NOTION_TOKEN = secret_xxx"
      })
    };
  }

  const params    = event.queryStringParameters || {};
  const rawDb     = (params.db || "").toLowerCase();

  // Map rent/sale aliases to listings DB
  const dbKey = (rawDb === "sale" || rawDb === "rent") ? "listings" : rawDb;
  const dbId  = DATABASE_IDS[dbKey];

  if (!dbId || dbId.startsWith("PASTE_")) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `Database "${rawDb}" not configured.`,
        help:  `Open notion-proxy.js and paste the Notion database ID for "${rawDb}" in the DATABASE_IDS object.`,
        configured: Object.entries(DATABASE_IDS)
          .filter(([,v]) => !v.startsWith("PASTE_"))
          .map(([k]) => k)
      })
    };
  }

  const limit  = parseInt(params.limit) || 100;
  const filter = buildFilter(rawDb, params);
  const sorts  = buildSort(rawDb);

  const body = { page_size: Math.min(limit, 100) };
  if (filter) body.filter = filter;
  if (sorts.length) body.sorts = sorts;

  try {
    const res = await fetch(`${NOTION_BASE}/databases/${dbId}/query`, {
      method:  "POST",
      headers: {
        "Authorization":  `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Notion API error ${res.status}:`, err);
      return {
        statusCode: res.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Notion API returned ${res.status}`,
          detail: err,
          db: rawDb,
          dbId
        })
      };
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",
        // Cache 60s in browser, 300s in Netlify CDN — change as needed
        "Cache-Control":               "public, s-maxage=300, max-age=60"
      },
      body: JSON.stringify(data)
    };

  } catch (err) {
    console.error("Proxy fetch error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Proxy fetch failed",
        message: err.message,
        db: rawDb
      })
    };
  }
};
