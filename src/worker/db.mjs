// Accesso D1 per prodotti, richieste, utenti, sottoscrizioni push e immagini.
// Replica le operazioni Supabase di server.js con prepared statements D1.

import DEFAULT_PRODUCTS from "../../products.json";
import { jsonClone, nowIso } from "./lib.mjs";

export { DEFAULT_PRODUCTS };

// ── Products ────────────────────────────────────────────────────────

export function productFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    shortDesc: row.short_desc,
    benefits: row.benefits,
    price: row.price,
    image: row.image,
    link: row.link,
    visible: Boolean(row.visible),
    order: row.order
  };
}

const LEGACY_PRODUCT_IDS = new Set([
  "p-lavanda",
  "p-eucalipto",
  "p-rosa",
  "p-menta",
  "p-arancio",
  "p-incenso"
]);

function isLegacyProductSeed(products) {
  return Array.isArray(products)
    && products.length > 0
    && products.every((product) => (
      LEGACY_PRODUCT_IDS.has(product.id)
      || String(product.link || "").startsWith("https://www.google.com/search?q=olio+essenziale")
    ));
}

function shouldRepairLegacyProductSeed(products) {
  if (!Array.isArray(products)) return false;
  const ids = new Set(products.map((product) => product.id));
  const defaultIds = new Set(DEFAULT_PRODUCTS.map((product) => product.id));
  const allowedIds = new Set([...LEGACY_PRODUCT_IDS, ...defaultIds]);
  const exactLegacySeed = products.length === LEGACY_PRODUCT_IDS.size && isLegacyProductSeed(products);
  const recoverablePartialRepair =
    [...defaultIds].every((id) => ids.has(id))
    && products.some((product) => LEGACY_PRODUCT_IDS.has(product.id))
    && products.every((product) => allowedIds.has(product.id));
  return exactLegacySeed || recoverablePartialRepair;
}

function upsertProductStatement(db, product, timestamp) {
  return db
    .prepare(
      `INSERT INTO products (id, name, short_desc, benefits, price, image, link, visible, "order", created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         short_desc = excluded.short_desc,
         benefits = excluded.benefits,
         price = excluded.price,
         image = excluded.image,
         link = excluded.link,
         visible = excluded.visible,
         "order" = excluded."order",
         updated_at = excluded.updated_at`
    )
    .bind(
      product.id,
      product.name,
      product.shortDesc,
      product.benefits,
      product.price,
      product.image,
      product.link,
      product.visible ? 1 : 0,
      product.order,
      timestamp
    );
}

async function repairLegacyProductSeed(db, products) {
  const repairAt = nowIso();
  const statements = DEFAULT_PRODUCTS.map((product) => upsertProductStatement(db, product, repairAt));
  const obsoleteIds = products
    .map((product) => product.id)
    .filter((id) => LEGACY_PRODUCT_IDS.has(id));
  for (const id of obsoleteIds) {
    statements.push(db.prepare("DELETE FROM products WHERE id = ?1").bind(id));
  }
  await db.batch(statements);

  const { results } = await db.prepare('SELECT * FROM products ORDER BY "order" ASC').all();
  const repaired = (results || []).map(productFromRow);
  const repairedIds = new Set(repaired.map((product) => product.id));
  if (
    repaired.length !== DEFAULT_PRODUCTS.length
    || DEFAULT_PRODUCTS.some((product) => !repairedIds.has(product.id))
    || repaired.some((product) => LEGACY_PRODUCT_IDS.has(product.id))
  ) {
    throw new Error("Allineamento catalogo incompleto: verifica manuale richiesta.");
  }

  console.log(`[products] Seed legacy sostituito con ${repaired.length} prodotti correnti.`);
  return repaired;
}

export async function loadProducts(env, { allowPublicFallback = false } = {}) {
  let mapped;
  try {
    const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY "order" ASC').all();
    mapped = (results || []).map(productFromRow);
  } catch (error) {
    console.error("[db] errore caricamento prodotti:", error.message);
    if (allowPublicFallback) return jsonClone(DEFAULT_PRODUCTS);
    throw new Error("Errore caricamento prodotti: " + error.message);
  }
  // Database vuoto (primo avvio): semina il catalogo corrente della landing.
  if (!mapped.length) {
    const seedAt = nowIso();
    await env.DB.batch(DEFAULT_PRODUCTS.map((product) => upsertProductStatement(env.DB, product, seedAt)));
    return jsonClone(DEFAULT_PRODUCTS);
  }
  if (shouldRepairLegacyProductSeed(mapped)) {
    try {
      return await repairLegacyProductSeed(env.DB, mapped);
    } catch (error) {
      console.error("[products] allineamento automatico fallito:", error.message);
      if (allowPublicFallback) return jsonClone(DEFAULT_PRODUCTS);
      throw error;
    }
  }
  return mapped;
}

export function publicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    shortDesc: product.shortDesc,
    benefits: product.benefits,
    price: product.price,
    image: product.image,
    link: product.link,
    visible: product.visible !== false,
    order: product.order
  };
}

export async function insertProduct(env, product) {
  const timestamp = nowIso();
  await env.DB
    .prepare(
      `INSERT INTO products (id, name, short_desc, benefits, price, image, link, visible, "order", created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
    )
    .bind(
      product.id,
      product.name,
      product.shortDesc,
      product.benefits,
      product.price,
      product.image,
      product.link,
      product.visible ? 1 : 0,
      product.order,
      timestamp
    )
    .run();
}

export async function updateProduct(env, id, updated) {
  const result = await env.DB
    .prepare(
      `UPDATE products SET name = ?2, short_desc = ?3, benefits = ?4, price = ?5,
         image = ?6, link = ?7, visible = ?8, "order" = ?9, updated_at = ?10
       WHERE id = ?1`
    )
    .bind(
      id,
      updated.name,
      updated.shortDesc,
      updated.benefits,
      updated.price,
      updated.image,
      updated.link,
      updated.visible ? 1 : 0,
      updated.order,
      nowIso()
    )
    .run();
  return result.meta.changes > 0;
}

export async function patchProductVisible(env, id, visible) {
  const result = await env.DB
    .prepare("UPDATE products SET visible = ?2, updated_at = ?3 WHERE id = ?1")
    .bind(id, visible ? 1 : 0, nowIso())
    .run();
  return result.meta.changes > 0;
}

export async function deleteProduct(env, id) {
  const result = await env.DB.prepare("DELETE FROM products WHERE id = ?1").bind(id).run();
  return result.meta.changes > 0;
}

export async function resetProducts(env) {
  const resetAt = nowIso();
  const statements = DEFAULT_PRODUCTS.map((product) => upsertProductStatement(env.DB, product, resetAt));
  const defaultIds = DEFAULT_PRODUCTS.map((product) => product.id);
  const placeholders = defaultIds.map((_, index) => `?${index + 1}`).join(", ");
  statements.push(
    env.DB.prepare(`DELETE FROM products WHERE id NOT IN (${placeholders})`).bind(...defaultIds)
  );
  await env.DB.batch(statements);
}

export async function swapProductOrder(env, first, second) {
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB
      .prepare('UPDATE products SET "order" = ?2, updated_at = ?3 WHERE id = ?1')
      .bind(first.id, first.order, timestamp),
    env.DB
      .prepare('UPDATE products SET "order" = ?2, updated_at = ?3 WHERE id = ?1')
      .bind(second.id, second.order, timestamp)
  ]);
}

// ── Leads ───────────────────────────────────────────────────────────

function leadFromRow(row) {
  return {
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
  };
}

export async function loadLeads(env) {
  const { results } = await env.DB
    .prepare("SELECT * FROM leads ORDER BY created_at DESC")
    .all();
  return (results || []).map(leadFromRow);
}

export async function insertLead(env, lead) {
  await env.DB
    .prepare(
      `INSERT INTO leads (id, name, phone, email, day, slot, message, status, read, source, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
    )
    .bind(
      lead.id,
      lead.name,
      lead.phone,
      lead.email,
      lead.day,
      lead.slot,
      lead.message,
      lead.status,
      lead.read ? 1 : 0,
      lead.source,
      lead.createdAt,
      lead.updatedAt
    )
    .run();
}

export async function leadExists(env, id) {
  const row = await env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(id).first();
  return Boolean(row);
}

export async function updateLead(env, id, updates) {
  const assignments = ["updated_at = ?2"];
  const bindings = [id, updates.updatedAt];
  if (Object.prototype.hasOwnProperty.call(updates, "read")) {
    bindings.push(updates.read ? 1 : 0);
    assignments.push(`read = ?${bindings.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "status")) {
    bindings.push(updates.status);
    assignments.push(`status = ?${bindings.length}`);
  }
  await env.DB
    .prepare(`UPDATE leads SET ${assignments.join(", ")} WHERE id = ?1`)
    .bind(...bindings)
    .run();
}

export async function deleteLead(env, id) {
  await env.DB.prepare("DELETE FROM leads WHERE id = ?1").bind(id).run();
}

// ── Users ───────────────────────────────────────────────────────────

export async function getUserByUsername(env, username) {
  return env.DB
    .prepare("SELECT * FROM users WHERE username = ?1")
    .bind(username)
    .first();
}

export async function upsertAdminUser(env, username, passwordHash) {
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO users (id, username, role, password_hash, created_at, updated_at)
         VALUES (?1, ?2, 'admin', ?3, ?4, ?4)
         ON CONFLICT(username) DO UPDATE SET
           role = 'admin',
           password_hash = excluded.password_hash,
           updated_at = excluded.updated_at`
      )
      .bind(crypto.randomUUID(), username, passwordHash, timestamp),
    // Un solo amministratore attivo: gli alias obsoleti vengono disabilitati.
    env.DB
      .prepare("UPDATE users SET role = 'disabled', updated_at = ?2 WHERE role = 'admin' AND username != ?1")
      .bind(username, timestamp)
  ]);
}

// ── Push subscriptions ──────────────────────────────────────────────

export async function loadPushSubscriptions(env) {
  const { results } = await env.DB
    .prepare("SELECT endpoint, p256dh, auth, user_name, created_at, updated_at FROM push_subscriptions ORDER BY created_at ASC")
    .all();
  return (results || []).map((row) => ({
    endpoint: row.endpoint,
    expirationTime: null,
    keys: { p256dh: row.p256dh, auth: row.auth },
    user: row.user_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function upsertPushSubscription(env, subscription) {
  await env.DB
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_name, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_name = excluded.user_name,
         updated_at = excluded.updated_at`
    )
    .bind(
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      subscription.user,
      subscription.createdAt,
      subscription.updatedAt
    )
    .run();
}

export async function deletePushSubscription(env, endpoint) {
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(endpoint).run();
}

export async function countPushSubscriptions(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM push_subscriptions").first();
  return Number(row?.total || 0);
}

export async function removePushSubscriptions(env, endpoints) {
  const staleEndpoints = [...new Set(endpoints.filter(Boolean))];
  if (!staleEndpoints.length) return;
  await env.DB.batch(
    staleEndpoints.map((endpoint) =>
      env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(endpoint)
    )
  );
}

// ── Images (upload gestionale, BLOB in D1) ──────────────────────────

export async function insertImage(env, image) {
  await env.DB
    .prepare(
      `INSERT INTO images (id, content_type, bytes, size, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(image.id, image.contentType, image.bytes, image.size, nowIso())
    .run();
}

export async function getImage(env, id) {
  return env.DB
    .prepare("SELECT id, content_type, bytes, size FROM images WHERE id = ?1")
    .bind(id)
    .first();
}
