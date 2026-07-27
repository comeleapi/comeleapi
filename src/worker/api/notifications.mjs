// Rotte /api/admin/notifications/*: chiave pubblica VAPID, iscrizione,
// disiscrizione e invio di test delle notifiche push.

import { cleanUrl, json, readBody } from "../lib.mjs";
import {
  countPushSubscriptions,
  deletePushSubscription,
  upsertPushSubscription
} from "../db.mjs";
import { getVapidKeys, normalizePushSubscription, sendPushToAll } from "../push.mjs";

// parts = ["api","admin","notifications", action]
export async function handleNotifications(request, env, session, parts, secure) {
  const action = parts[3] || "";

  if (action === "public-key" && request.method === "GET") {
    const vapid = getVapidKeys(env);
    return json(200, {
      publicKey: vapid.publicKey,
      secureContext: secure ? "https" : "localhost"
    });
  }

  if (action === "subscribe" && request.method === "POST") {
    const body = await readBody(request);
    const incoming = normalizePushSubscription(body.subscription || body, session);
    await upsertPushSubscription(env, incoming);
    return json(201, { ok: true, registered: await countPushSubscriptions(env) });
  }

  if (action === "unsubscribe" && request.method === "POST") {
    const body = await readBody(request);
    const endpoint = cleanUrl(body.endpoint, "Endpoint push");
    await deletePushSubscription(env, endpoint);
    return json(200, { ok: true, registered: await countPushSubscriptions(env) });
  }

  if (action === "test" && request.method === "POST") {
    const result = await sendPushToAll(env, {
      type: "TEST",
      title: "Test Notifiche PWA",
      body: "Le notifiche in background funzionano correttamente!",
      url: "/admin.html"
    });
    return json(200, { ok: true, ...result });
  }

  return json(405, { error: "Metodo non consentito." });
}
