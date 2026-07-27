// Rotte /api/auth/*: login, session, logout. Stessi payload e status code
// del backend Node precedente.

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  ClientInputError,
  buildCookie,
  clearCookie,
  cleanText,
  json,
  readBody
} from "../lib.mjs";
import {
  checkLoginRate,
  createSession,
  deleteSession,
  ensureAdminUser,
  recordLoginFailure,
  recordLoginSuccess,
  signedValue,
  userPayload,
  verifyPassword
} from "../auth.mjs";
import { getUserByUsername } from "../db.mjs";

export async function handleLogin(request, env, secure) {
  if (request.method !== "POST") return json(405, { error: "Metodo non consentito." });
  let username;
  let password;
  try {
    const body = await readBody(request);
    username = cleanText(body.username, 80, false).toLowerCase();
    password = String(body.password || "");
  } catch (err) {
    if (err instanceof ClientInputError) return json(400, { error: err.message });
    console.error("[auth] lettura richiesta login fallita:", err);
    return json(500, { error: "Errore interno del server." });
  }

  const rate = await checkLoginRate(env, request);
  if (!rate.ok) {
    return json(429, { error: "Troppi tentativi. Riprova tra qualche minuto." }, {
      "Retry-After": String(rate.retryAfter || 60)
    });
  }

  // Bootstrap: allinea l'utente amministratore configurato nei secrets.
  try {
    await ensureAdminUser(env, username);
  } catch (err) {
    console.error("[auth] bootstrap amministratore fallito:", err.message);
  }

  let user = null;
  let passwordOk = false;
  try {
    const dbUser = await getUserByUsername(env, username);
    if (dbUser) {
      user = dbUser;
      passwordOk = await verifyPassword(password, user.password_hash);
    }
  } catch (err) {
    console.error("[auth] lettura utente fallita:", err.message);
    return json(503, { error: "Servizio di autenticazione temporaneamente non disponibile." });
  }

  if (!user || !passwordOk || user.role !== "admin") {
    await recordLoginFailure(env, rate.key);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return json(401, { error: "Credenziali non valide." });
  }

  await recordLoginSuccess(env, rate.key);
  const session = await createSession(env, user);
  const cookie = buildCookie(SESSION_COOKIE, await signedValue(env, session.id), {
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure
  });
  return json(200, userPayload(session), { "Set-Cookie": cookie });
}

export function handleSession(session) {
  if (!session) return json(401, { error: "Autenticazione richiesta." });
  return json(200, userPayload(session));
}

export async function handleLogout(request, env, session, secure) {
  if (!session) return json(401, { error: "Autenticazione richiesta." });
  await deleteSession(env, session.id);
  return json(200, { ok: true }, {
    "Set-Cookie": clearCookie(SESSION_COOKIE, { secure })
  });
}
