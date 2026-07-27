// Autenticazione del gestionale: hashing password PBKDF2-SHA256 (WebCrypto),
// cookie di sessione firmato HMAC, sessioni persistite in D1, CSRF
// double-submit e rate limiting su D1. Porting della logica di server.js.

import {
  ClientInputError,
  CONTACT_MAX_ATTEMPTS,
  CONTACT_WINDOW_MS,
  LOGIN_LOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clientIp,
  fromBase64Url,
  nowIso,
  parseCookies,
  randomBase64Url,
  timingSafeEqualBytes,
  timingSafeEqualStrings,
  toBase64Url
} from "./lib.mjs";
import { getUserByUsername, upsertAdminUser } from "./db.mjs";

const encoder = new TextEncoder();

const LEGACY_WEAK_ADMIN_PASSWORDS = new Set(["", "admin", "password", "cambia-questa-password"]);

export function validateAdminBootstrapPassword(password) {
  const value = String(password || "");
  if (LEGACY_WEAK_ADMIN_PASSWORDS.has(value) || value.length < 14) {
    throw new Error("ADMIN_PASSWORD deve contenere almeno 14 caratteri e non puo essere una password predefinita.");
  }
  return value;
}

// ── Password hashing (PBKDF2-SHA256, budget CPU 10ms del piano free) ─

const PBKDF2_ITERATIONS = 100000;

async function pbkdf2(password, salt, iterations, length) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = randomBase64Url(16);
  const key = await pbkdf2(password, salt, PBKDF2_ITERATIONS, 32);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt}$${toBase64Url(key)}`;
}

export async function verifyPassword(password, storedHash) {
  try {
    const [algo, iterationsRaw, salt, hash] = String(storedHash || "").split("$");
    if (algo !== "pbkdf2-sha256" || !salt || !hash) return false;
    const iterations = Number(iterationsRaw);
    if (!Number.isFinite(iterations) || iterations < 1 || iterations > 1000000) return false;
    const expected = fromBase64Url(hash);
    const actual = await pbkdf2(password, salt, iterations, expected.length);
    return timingSafeEqualBytes(expected, actual);
  } catch {
    return false;
  }
}

// ── Cookie firmato (HMAC-SHA256 con SESSION_SECRET) ─────────────────

async function hmacKey(env) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(String(env.SESSION_SECRET || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(env, value) {
  const key = await hmacKey(env);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export async function signedValue(env, value) {
  return `${value}.${await sign(env, value)}`;
}

export async function verifySignedValue(env, raw) {
  if (!raw || typeof raw !== "string" || !raw.includes(".")) return null;
  const idx = raw.lastIndexOf(".");
  const value = raw.slice(0, idx);
  const given = raw.slice(idx + 1);
  const expected = await sign(env, value);
  if (given.length !== expected.length) return null;
  return timingSafeEqualStrings(given, expected) ? value : null;
}

// ── Sessioni su D1 ──────────────────────────────────────────────────

export async function createSession(env, user) {
  const id = randomBase64Url(32);
  const session = {
    id,
    username: user.username,
    role: user.role,
    csrfToken: randomBase64Url(32),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  await env.DB
    .prepare(
      `INSERT INTO sessions (id, username, role, csrf_token, expires_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(id, session.username, session.role, session.csrfToken, session.expiresAt, nowIso())
    .run();
  return session;
}

export async function getSession(env, request) {
  const cookie = parseCookies(request)[SESSION_COOKIE];
  const sessionId = await verifySignedValue(env, cookie);
  if (!sessionId) return null;
  const row = await env.DB
    .prepare("SELECT id, username, role, csrf_token, expires_at FROM sessions WHERE id = ?1")
    .bind(sessionId)
    .first();
  if (!row || row.expires_at < Date.now()) {
    if (row) await env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run();
    return null;
  }
  // Scadenza sliding come in server.js: ogni richiesta autenticata la rinnova.
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await env.DB
    .prepare("DELETE FROM sessions WHERE expires_at < ?1")
    .bind(Date.now())
    .run();
  await env.DB
    .prepare("UPDATE sessions SET expires_at = ?2 WHERE id = ?1")
    .bind(sessionId, expiresAt)
    .run();
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    csrfToken: row.csrf_token,
    expiresAt
  };
}

export async function deleteSession(env, sessionId) {
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run();
}

export function verifyCsrf(request, session) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const token = String(request.headers.get("X-CSRF-Token") || "");
  if (!token || token.length !== session.csrfToken.length) return false;
  return timingSafeEqualStrings(token, session.csrfToken);
}

export function userPayload(session) {
  return {
    user: {
      username: session.username,
      role: session.role
    },
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  };
}

// ── Rate limiting su D1 (contatore per chiave, pulizia lazy) ────────

async function readRateEntry(env, key) {
  return env.DB
    .prepare("SELECT key, count, first_at, locked_until FROM rate_limits WHERE key = ?1")
    .bind(key)
    .first();
}

async function writeRateEntry(env, key, entry) {
  await env.DB
    .prepare(
      `INSERT INTO rate_limits (key, count, first_at, locked_until)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(key) DO UPDATE SET
         count = excluded.count,
         first_at = excluded.first_at,
         locked_until = excluded.locked_until`
    )
    .bind(key, entry.count, entry.firstAt, entry.lockedUntil || 0)
    .run();
}

async function sweepRateLimits(env, now) {
  // Pulizia lazy delle finestre scadute (login e contact insieme).
  const horizon = now - Math.max(LOGIN_WINDOW_MS, CONTACT_WINDOW_MS);
  await env.DB
    .prepare("DELETE FROM rate_limits WHERE first_at < ?1 AND locked_until < ?2")
    .bind(horizon, now)
    .run();
}

export async function checkContactRate(env, request) {
  const key = `contact:${clientIp(request)}`;
  const now = Date.now();
  await sweepRateLimits(env, now);
  const entry = await readRateEntry(env, key);
  if (!entry || entry.first_at + CONTACT_WINDOW_MS < now) {
    await writeRateEntry(env, key, { count: 1, firstAt: now, lockedUntil: 0 });
    return true;
  }
  const count = entry.count + 1;
  await writeRateEntry(env, key, { count, firstAt: entry.first_at, lockedUntil: 0 });
  return count <= CONTACT_MAX_ATTEMPTS;
}

export async function checkLoginRate(env, request) {
  const key = `login:${clientIp(request)}`;
  const now = Date.now();
  await sweepRateLimits(env, now);
  const entry = await readRateEntry(env, key);
  if (!entry) return { ok: true, key };
  if (entry.locked_until && entry.locked_until > now) {
    return { ok: false, key, retryAfter: Math.ceil((entry.locked_until - now) / 1000) };
  }
  if (entry.first_at + LOGIN_WINDOW_MS < now) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?1").bind(key).run();
    return { ok: true, key };
  }
  return { ok: true, key };
}

export async function recordLoginFailure(env, key) {
  if (!key) return;
  const now = Date.now();
  const row = await readRateEntry(env, key);
  const entry = row
    ? { count: row.count, firstAt: row.first_at, lockedUntil: row.locked_until }
    : { count: 0, firstAt: now, lockedUntil: 0 };
  if (entry.firstAt + LOGIN_WINDOW_MS < now) {
    entry.count = 0;
    entry.firstAt = now;
    entry.lockedUntil = 0;
  }
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) entry.lockedUntil = now + LOGIN_LOCK_MS;
  await writeRateEntry(env, key, entry);
}

export async function recordLoginSuccess(env, key) {
  if (!key) return;
  await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?1").bind(key).run();
}

// ── Bootstrap amministratore (da secrets, al login) ─────────────────

export async function ensureAdminUser(env, username) {
  const configuredUser = String(env.ADMIN_USER || "").trim().toLowerCase();
  if (!configuredUser || username !== configuredUser) return;

  const existing = await getUserByUsername(env, configuredUser);
  const targetPassword = validateAdminBootstrapPassword(env.ADMIN_PASSWORD);
  const passwordAlreadyCurrent = existing
    ? await verifyPassword(targetPassword, existing.password_hash)
    : false;
  if (existing && passwordAlreadyCurrent && existing.role === "admin") return;

  const passwordHash = await hashPassword(targetPassword);
  await upsertAdminUser(env, configuredUser, passwordHash);
  console.log(`[auth] Utente amministratore configurato: "${configuredUser}".`);
}
