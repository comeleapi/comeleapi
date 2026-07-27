// Rotte /api/products (pubblica) e /api/admin/products*. Porting 1:1 della
// logica di normalizzazione, riordino e reset del catalogo.

import { cleanText, cleanUrl, cleanImageUrl, json, readBody } from "../lib.mjs";
import { userPayload } from "../auth.mjs";
import {
  deleteProduct,
  insertProduct,
  loadProducts,
  patchProductVisible,
  publicProduct,
  resetProducts,
  swapProductOrder,
  updateProduct
} from "../db.mjs";

export function normalizeProduct(input, existing = {}, fallbackOrder = 0) {
  return {
    id: existing.id || `p-${crypto.randomUUID()}`,
    name: cleanText(input.name, 80),
    shortDesc: cleanText(input.shortDesc, 320),
    benefits: cleanText(input.benefits, 500, false),
    price: cleanText(input.price, 24, false),
    image: cleanImageUrl(input.image),
    link: cleanUrl(input.link, "Link acquisto"),
    visible: input.visible !== false,
    order: Number.isFinite(existing.order) ? existing.order : fallbackOrder
  };
}

export async function handlePublicProducts(env) {
  const products = (await loadProducts(env, { allowPublicFallback: true })).map(publicProduct);
  return json(200, { products });
}

// parts = ["api","admin","products", id?, "move"?]
export async function handleAdminProducts(request, env, session, parts) {
  const id = parts[3] ? decodeURIComponent(parts[3]) : "";

  if (parts.length === 3) {
    if (request.method === "GET") {
      return json(200, {
        products: (await loadProducts(env)).map(publicProduct),
        ...userPayload(session)
      });
    }
    if (request.method === "POST") {
      const body = await readBody(request);
      const list = await loadProducts(env);
      const product = normalizeProduct(body, {}, list.length);
      await insertProduct(env, product);
      const saved = await loadProducts(env);
      return json(201, { products: saved.map(publicProduct), product: publicProduct(product) });
    }
    return json(405, { error: "Metodo non consentito." });
  }

  if (id === "reset" && request.method === "POST") {
    await resetProducts(env);
    const saved = await loadProducts(env);
    return json(200, { products: saved.map(publicProduct) });
  }

  const list = await loadProducts(env);
  const idx = list.findIndex((product) => product.id === id);
  if (idx < 0) return json(404, { error: "Prodotto non trovato." });

  if (parts[4] === "move" && request.method === "POST") {
    const body = await readBody(request);
    const direction = Number(body.direction) < 0 ? -1 : 1;
    const target = idx + direction;
    if (target < 0 || target >= list.length) {
      return json(200, { products: list.map(publicProduct) });
    }
    const tmp = list[idx].order;
    list[idx].order = list[target].order;
    list[target].order = tmp;
    await swapProductOrder(env, list[idx], list[target]);
    const saved = await loadProducts(env);
    return json(200, { products: saved.map(publicProduct) });
  }

  if (request.method === "PUT") {
    const body = await readBody(request);
    const updated = normalizeProduct(body, list[idx], idx);
    const changed = await updateProduct(env, id, updated);
    if (!changed) return json(404, { error: "Prodotto non trovato." });
    const saved = await loadProducts(env);
    return json(200, { products: saved.map(publicProduct), product: publicProduct(updated) });
  }

  if (request.method === "PATCH") {
    const body = await readBody(request);
    if (Object.prototype.hasOwnProperty.call(body, "visible")) {
      const changed = await patchProductVisible(env, id, body.visible !== false);
      if (!changed) return json(404, { error: "Prodotto non trovato." });
    }
    const saved = await loadProducts(env);
    const product = saved.find((item) => item.id === id);
    return json(200, { products: saved.map(publicProduct), product: product ? publicProduct(product) : null });
  }

  if (request.method === "DELETE") {
    const changed = await deleteProduct(env, id);
    if (!changed) return json(404, { error: "Prodotto non trovato." });
    const saved = await loadProducts(env);
    return json(200, { products: saved.map(publicProduct) });
  }

  return json(405, { error: "Metodo non consentito." });
}
