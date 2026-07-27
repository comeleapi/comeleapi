// Helpers condivisi del Worker comeleapi: costanti, risposte JSON, cookie,
// parsing body e validazione input. Porting 1:1 degli helper di server.js
// sulle API Web standard disponibili nel runtime Workers.

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_COOKIE = "comeleapi_sid";
export const MAX_BODY_BYTES = 128 * 1024;
// Le immagini sono BLOB in D1: limite prudente rispetto ai 5 MB storici.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 6;
export const CONTACT_WINDOW_MS = 10 * 60 * 1000;
export const CONTACT_MAX_ATTEMPTS = 8;

export const UPLOAD_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const encoder = new TextEncoder();

export class ClientInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClientInputError";
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ── Base64url / random ──────────────────────────────────────────────

export function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value) {
  const padded = String(value)
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(value).length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBase64Url(size) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export function randomHex(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Confronto constant-time (sostituisce crypto.timingSafeEqual di Node).
export function timingSafeEqualBytes(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function timingSafeEqualStrings(left, right) {
  return timingSafeEqualBytes(encoder.encode(left), encoder.encode(right));
}

// ── Risposte HTTP ───────────────────────────────────────────────────

export function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export function textResponse(status, body, headers = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers }
  });
}

export function notFound() {
  return textResponse(404, "Not found");
}

// Stessi header di sicurezza applicati da server.js alle risposte dinamiche.
// Gli static assets ricevono gli stessi header tramite dist/_headers.
export function withSecurityHeaders(response, secure) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  if (secure) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'"
    ].join("; ")
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// ── Cookie ──────────────────────────────────────────────────────────

export function parseCookies(request) {
  const out = {};
  const header = request.headers.get("Cookie") || "";
  header.split(";").forEach((part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return;
    out[key] = decodeURIComponent(rest.join("="));
  });
  return out;
}

export function buildCookie(name, value, options = {}) {
  const pieces = [`${name}=${encodeURIComponent(value)}`];
  pieces.push(`Path=${options.path || "/"}`);
  pieces.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly !== false) pieces.push("HttpOnly");
  if (options.secure) pieces.push("Secure");
  if (options.maxAge !== undefined) pieces.push(`Max-Age=${options.maxAge}`);
  return pieces.join("; ");
}

export function clearCookie(name, options = {}) {
  return buildCookie(name, "", { ...options, maxAge: 0 });
}

// ── Client IP e body parsing ────────────────────────────────────────

export function clientIp(request) {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;
  const forwarded = request.headers.get("X-Forwarded-For") || "";
  if (forwarded.trim()) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function readBody(request) {
  const raw = await request.text();
  if (encoder.encode(raw).length > MAX_BODY_BYTES) {
    throw new ClientInputError("Payload troppo grande.");
  }
  if (!raw) return {};
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) return JSON.parse(raw);
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(raw));
    }
    return {};
  } catch {
    throw new ClientInputError("JSON non valido.");
  }
}

// ── Validators (identici a server.js) ───────────────────────────────

export function cleanText(value, max, required = true) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (required && !text) throw new ClientInputError("Campo obbligatorio mancante.");
  if (text.length > max) throw new ClientInputError(`Campo troppo lungo: massimo ${max} caratteri.`);
  return text;
}

export function cleanMultilineText(value, max, required = false) {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (required && !text) throw new ClientInputError("Campo obbligatorio mancante.");
  if (text.length > max) throw new ClientInputError(`Campo troppo lungo: massimo ${max} caratteri.`);
  return text;
}

export function cleanEmail(value) {
  const email = cleanText(value, 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ClientInputError("Email non valida.");
  return email;
}

export function cleanPhone(value) {
  const phone = cleanText(value, 40);
  if (!/^[+()\d\s.-]{6,40}$/.test(phone)) throw new ClientInputError("Telefono non valido.");
  return phone;
}

export function cleanUrl(value, field) {
  const raw = cleanText(value, 600);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ClientInputError(`${field} non valido.`);
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new ClientInputError(`${field} deve usare HTTPS.`);
  }
  return parsed.toString();
}

export function cleanImageUrl(value) {
  const raw = cleanText(value, 600);
  if (raw.startsWith("/uploads/")) return raw;
  if (raw.startsWith("/assets/img/")) return raw.slice(1);
  if (raw.startsWith("assets/img/")) return raw;
  if (raw.startsWith("/foto-prodotti/")) return raw.slice(1);
  if (raw.startsWith("foto-prodotti/")) return raw;
  return cleanUrl(raw, "URL immagine");
}
