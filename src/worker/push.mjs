// Notifiche Web Push reimplementate con WebCrypto per il runtime Workers:
// JWT VAPID ES256 (RFC 8292) + cifratura payload aes128gcm (RFC 8291/8188).
// Sostituisce la libreria Node "web-push" riusando le stesse chiavi VAPID.

import {
  ClientInputError,
  cleanText,
  cleanUrl,
  fromBase64Url,
  nowIso,
  toBase64Url
} from "./lib.mjs";
import { loadPushSubscriptions, removePushSubscriptions } from "./db.mjs";

const encoder = new TextEncoder();

export function getVapidKeys(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error("Variabili VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY obbligatorie per le notifiche push in produzione.");
  }
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
}

// ── Sottoscrizioni ──────────────────────────────────────────────────

export function normalizePushSubscription(value, session) {
  if (!value || typeof value !== "object") {
    throw new ClientInputError("Sottoscrizione push non valida.");
  }
  const endpoint = cleanUrl(value.endpoint, "Endpoint push");
  const p256dh = cleanText(value.keys?.p256dh, 256);
  const auth = cleanText(value.keys?.auth, 128);
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth)) {
    throw new ClientInputError("Chiavi della sottoscrizione push non valide.");
  }
  const timestamp = nowIso();
  return {
    endpoint,
    expirationTime: Number.isFinite(value.expirationTime) ? value.expirationTime : null,
    keys: { p256dh, auth },
    user: session.username,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

// ── JWT VAPID ES256 ─────────────────────────────────────────────────

async function importVapidSigningKey(vapid) {
  // La chiave pubblica VAPID è un punto P-256 non compresso: 0x04 || x || y.
  const publicBytes = fromBase64Url(vapid.publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY non è un punto P-256 non compresso valido.");
  }
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: toBase64Url(publicBytes.subarray(1, 33)),
    y: toBase64Url(publicBytes.subarray(33, 65)),
    d: vapid.privateKey,
    ext: true
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidJwt(env, audience, vapid) {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || "mailto:sara.bordenga@gmail.com"
  })));
  const signingInput = `${header}.${payload}`;
  const key = await importVapidSigningKey(vapid);
  // ECDSA WebCrypto produce già la firma raw r||s richiesta da ES256.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput)
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

// ── Cifratura payload RFC 8291 (aes128gcm) ──────────────────────────

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

async function encryptPayload(subscription, plaintext) {
  const uaPublicBytes = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);

  // Coppia ECDH effimera dell'application server.
  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const asPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey)
  );
  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeyPair.privateKey, 256)
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concatBytes(encoder.encode("WebPush: info\0"), uaPublicBytes, asPublicBytes);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentEncryptionKey = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // Record singolo: payload || delimitatore di padding 0x02 (ultimo record).
  const record = concatBytes(encoder.encode(plaintext), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", contentEncryptionKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record)
  );

  // Header RFC 8188: salt(16) || record_size(4) || idlen(1) || keyid(as_public).
  const headerView = new DataView(new ArrayBuffer(5));
  headerView.setUint32(0, 4096);
  headerView.setUint8(4, asPublicBytes.length);
  return concatBytes(salt, new Uint8Array(headerView.buffer), asPublicBytes, ciphertext);
}

// ── Invio ───────────────────────────────────────────────────────────

async function sendPushNotification(env, subscription, payload, vapid) {
  try {
    const endpoint = new URL(subscription.endpoint);
    const jwt = await buildVapidJwt(env, endpoint.origin, vapid);
    const body = await encryptPayload(subscription, JSON.stringify(payload));
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${vapid.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
        "TTL": "86400",
        "Urgency": "normal"
      },
      body
    });
    if (response.ok || response.status === 201) return { ok: true, remove: false };
    const statusCode = response.status;
    return {
      ok: false,
      statusCode,
      remove: statusCode === 404 || statusCode === 410,
      error: `Push endpoint ha risposto ${statusCode}`
    };
  } catch (error) {
    return { ok: false, remove: false, error: error.message };
  }
}

export async function sendPushToAll(env, payload) {
  const subscriptions = await loadPushSubscriptions(env);
  if (!subscriptions.length) return { sent: 0, failed: 0, registered: 0 };
  const vapid = getVapidKeys(env);
  const results = await Promise.all(
    subscriptions.map((sub) => sendPushNotification(env, sub, payload, vapid))
  );
  const activeSubscriptions = subscriptions.filter((_, index) => !results[index].remove);
  const staleEndpoints = subscriptions
    .filter((_, index) => results[index].remove)
    .map((subscription) => subscription.endpoint);
  await removePushSubscriptions(env, staleEndpoints);
  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    registered: activeSubscriptions.length
  };
}

// La notifica di un nuovo lead non deve MAI leggere i campi del lead:
// payload fisso senza dati personali (vincolo di check-push-privacy).
export async function notifyNewLead(env) {
  try {
    const payload = {
      type: "NEW_LEAD",
      title: "Nuova richiesta dal sito",
      body: "Apri il gestionale autenticato per visualizzare i dettagli.",
      url: "/admin.html#richieste"
    };
    await sendPushToAll(env, payload);
  } catch (err) {
    console.warn("[push]", err.message);
  }
}
