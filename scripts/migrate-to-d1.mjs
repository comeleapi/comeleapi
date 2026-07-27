// Migrazione dati verso Cloudflare D1.
//
// Esporta i dati correnti (prodotti, richieste, sottoscrizioni push) da
// Supabase se raggiungibile, altrimenti dai JSON locali in data/, e genera
// d1/seed.sql. Le password NON sono portabili (scrypt → PBKDF2): l'utente
// amministratore viene ricreato al primo login dai secrets ADMIN_USER/
// ADMIN_PASSWORD, quindi la tabella users non viene esportata.
//
// Uso:
//   node scripts/migrate-to-d1.mjs                # da JSON locali (data/)
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/migrate-to-d1.mjs
//
// Import in D1:
//   wrangler d1 execute comeleapi-db --remote --file d1/seed.sql
//   (per il DB locale di wrangler dev usare --local)

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(ROOT, "data");
const SEED_FILE = path.join(ROOT, "d1", "seed.sql");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

function nowIso() {
  return new Date().toISOString();
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlBool(value) {
  return value ? 1 : 0;
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchSupabase(table, query = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${query}`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  if (!response.ok) {
    throw new Error(`Supabase ${table}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function loadProducts() {
  if (USE_SUPABASE) {
    try {
      const rows = await fetchSupabase("products", "&order=order.asc");
      return rows.map((row, index) => ({
        id: row.id,
        name: row.name,
        shortDesc: row.short_desc,
        benefits: row.benefits,
        price: row.price,
        image: row.image,
        link: row.link,
        visible: row.visible !== false,
        order: Number.isFinite(row.order) ? row.order : index,
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso()
      }));
    } catch (error) {
      console.warn(`[migrate] Supabase prodotti non raggiungibile (${error.message}); uso i JSON locali.`);
    }
  }
  const list = await readJsonFile(path.join(DATA_DIR, "products.json"), null)
    || await readJsonFile(path.join(ROOT, "products.json"), []);
  return list.map((product, index) => ({
    id: product.id,
    name: product.name,
    shortDesc: product.shortDesc ?? product.short_desc ?? "",
    benefits: product.benefits ?? "",
    price: product.price ?? "",
    image: product.image ?? "",
    link: product.link ?? "",
    visible: product.visible !== false,
    order: Number.isFinite(product.order) ? product.order : index,
    createdAt: product.createdAt || nowIso(),
    updatedAt: product.updatedAt || nowIso()
  }));
}

async function loadLeads() {
  if (USE_SUPABASE) {
    try {
      const rows = await fetchSupabase("leads", "&order=created_at.desc");
      return rows.map((row) => ({
        id: row.id,
        name: row.name || "",
        phone: row.phone || "",
        email: row.email || "",
        day: row.day || "",
        slot: row.slot || "",
        message: row.message || "",
        status: ["new", "reviewed", "archived"].includes(row.status) ? row.status : "new",
        read: Boolean(row.read),
        source: row.source || "form-frontend",
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || row.created_at || nowIso()
      }));
    } catch (error) {
      console.warn(`[migrate] Supabase leads non raggiungibile (${error.message}); uso i JSON locali.`);
    }
  }
  const list = await readJsonFile(path.join(DATA_DIR, "leads.json"), []);
  return Array.isArray(list) ? list : [];
}

async function loadPushSubscriptions() {
  if (USE_SUPABASE) {
    try {
      const rows = await fetchSupabase("push_subscriptions", "&order=created_at.asc");
      return rows.map((row) => ({
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        user: row.user_name || "",
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso()
      }));
    } catch (error) {
      console.warn(`[migrate] Supabase push non raggiungibile (${error.message}); uso i JSON locali.`);
    }
  }
  const list = await readJsonFile(path.join(DATA_DIR, "push_subscriptions.json"), []);
  return (Array.isArray(list) ? list : []).map((sub) => ({
    endpoint: sub.endpoint,
    p256dh: sub.keys?.p256dh || sub.p256dh || "",
    auth: sub.keys?.auth || sub.auth || "",
    user: sub.user || sub.user_name || "",
    createdAt: sub.createdAt || nowIso(),
    updatedAt: sub.updatedAt || nowIso()
  }));
}

function productInsert(product) {
  return (
    `INSERT INTO products (id, name, short_desc, benefits, price, image, link, visible, "order", created_at, updated_at) VALUES (` +
    [
      sqlString(product.id),
      sqlString(product.name),
      sqlString(product.shortDesc),
      sqlString(product.benefits),
      sqlString(product.price),
      sqlString(product.image),
      sqlString(product.link),
      sqlBool(product.visible),
      product.order,
      sqlString(product.createdAt),
      sqlString(product.updatedAt)
    ].join(", ") +
    `);`
  );
}

function leadInsert(lead) {
  return (
    `INSERT INTO leads (id, name, phone, email, day, slot, message, status, read, source, created_at, updated_at) VALUES (` +
    [
      sqlString(lead.id),
      sqlString(lead.name),
      sqlString(lead.phone),
      sqlString(lead.email),
      sqlString(lead.day),
      sqlString(lead.slot),
      sqlString(lead.message),
      sqlString(lead.status),
      sqlBool(lead.read),
      sqlString(lead.source),
      sqlString(lead.createdAt),
      sqlString(lead.updatedAt)
    ].join(", ") +
    `);`
  );
}

function pushInsert(sub) {
  return (
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_name, created_at, updated_at) VALUES (` +
    [
      sqlString(sub.endpoint),
      sqlString(sub.p256dh),
      sqlString(sub.auth),
      sqlString(sub.user),
      sqlString(sub.createdAt),
      sqlString(sub.updatedAt)
    ].join(", ") +
    `);`
  );
}

async function main() {
  const [products, leads, subscriptions] = await Promise.all([
    loadProducts(),
    loadLeads(),
    loadPushSubscriptions()
  ]);

  const lines = [
    "-- Seed dati comeleapi per Cloudflare D1 (generato da scripts/migrate-to-d1.mjs).",
    `-- Origine dati: ${USE_SUPABASE ? "Supabase (fallback JSON in caso di errore)" : "JSON locali data/"}.`,
    "-- Gli utenti admin non sono migrati: bootstrap al primo login dai secrets.",
    "-- Nota: niente BEGIN/COMMIT — D1 esegue il file in modo atomico e non",
    "-- supporta le istruzioni SQL di transazione esplicite.",
    "DELETE FROM products;",
    "DELETE FROM leads;",
    "DELETE FROM push_subscriptions;",
    "",
    ...products.map(productInsert),
    "",
    ...leads.map(leadInsert),
    "",
    ...subscriptions.map(pushInsert),
    ""
  ];

  await writeFile(SEED_FILE, lines.join("\n"), "utf8");
  console.log(
    `[migrate] d1/seed.sql generato: ${products.length} prodotti, ${leads.length} richieste, ${subscriptions.length} sottoscrizioni push.`
  );
}

main().catch((error) => {
  console.error("[migrate] Errore:", error.message);
  process.exit(1);
});
