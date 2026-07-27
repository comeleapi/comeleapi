// Worker comeleapi — entrypoint fetch. Serve:
//   - API dinamiche /api/* (porting di server.js su D1 + WebCrypto)
//   - gate di autenticazione su /admin* e /login*
//   - immagini caricate su /uploads/:id (BLOB in D1)
//   - fallback su env.ASSETS per il sito statico (dist/)
// Le altre rotte (/, /links/, asset, foto-prodotti) non invocano il Worker.

import {
  ClientInputError,
  json,
  notFound,
  textResponse,
  withSecurityHeaders
} from "./lib.mjs";
import { getSession, verifyCsrf } from "./auth.mjs";
import { handleLogin, handleLogout, handleSession } from "./api/auth.mjs";
import { handlePublicProducts, handleAdminProducts } from "./api/products.mjs";
import { handleContact, handleAdminLeads } from "./api/leads.mjs";
import { handleUpload, handleUploadServe } from "./api/uploads.mjs";
import { handleNotifications } from "./api/notifications.mjs";

function isSecureRequest(url) {
  return url.protocol === "https:";
}

async function handleHealth(env) {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json(200, { ok: true, service: "ready", database: "reachable" });
  } catch (error) {
    console.error("[health] verifica D1 fallita:", error.message);
    return json(503, { ok: false, service: "ready", database: "unreachable" });
  }
}

async function handleApi(request, env, ctx, url, secure) {
  const { pathname } = url;
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/api/health") {
    if (request.method !== "GET") return json(405, { error: "Metodo non consentito." });
    return handleHealth(env);
  }

  if (pathname === "/api/products" && request.method === "GET") {
    return handlePublicProducts(env);
  }

  if (pathname === "/api/contact") return handleContact(request, env, ctx);

  if (pathname === "/api/auth/login") return handleLogin(request, env, secure);

  if (pathname === "/api/auth/session" && request.method === "GET") {
    const session = await getSession(env, request);
    return handleSession(session);
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const session = await getSession(env, request);
    if (!session) return json(401, { error: "Autenticazione richiesta." });
    if (!verifyCsrf(request, session)) return json(403, { error: "Token CSRF non valido." });
    return handleLogout(request, env, session, secure);
  }

  if (!pathname.startsWith("/api/admin/")) return notFound();

  // Tutte le rotte admin richiedono sessione valida e CSRF.
  const session = await getSession(env, request);
  if (!session) return json(401, { error: "Autenticazione richiesta." });
  if (!verifyCsrf(request, session)) return json(403, { error: "Token CSRF non valido." });

  try {
    if (parts[2] === "notifications") {
      return await handleNotifications(request, env, session, parts, secure);
    }
    if (parts[2] === "leads") {
      return await handleAdminLeads(request, env, session, url, parts);
    }
    if (pathname === "/api/admin/uploads") {
      return await handleUpload(request, env);
    }
    if (parts[2] === "products") {
      return await handleAdminProducts(request, env, session, parts);
    }
  } catch (err) {
    if (err instanceof ClientInputError) return json(400, { error: err.message });
    console.error("[admin-api] operazione fallita:", err);
    return json(500, { error: "Operazione non completata per un errore interno." });
  }

  return json(405, { error: "Metodo non consentito." });
}

// Gate del gestionale: /admin, /admin.html e assets/js/admin.js richiedono
// una sessione valida; /login (o /login.html) con sessione attiva reindirizza
// a /admin. Gli URL storici senza estensione o con slash finale sono normalizzati.
async function handleGate(request, env, url) {
  const pathname = decodeURIComponent(url.pathname);
  const isAdminPage = pathname === "/admin" || pathname === "/admin/" || pathname === "/admin.html";
  const isLoginPage = pathname === "/login" || pathname === "/login/" || pathname === "/login.html";

  if (isAdminPage || pathname === "/assets/js/admin.js") {
    const session = await getSession(env, request);
    if (!session) {
      if (pathname.endsWith(".js")) {
        return textResponse(401, "Autenticazione richiesta.");
      }
      return new Response(null, {
        status: 302,
        headers: { Location: `/login.html?next=${encodeURIComponent("/admin.html")}` }
      });
    }
  }

  if (isLoginPage) {
    const session = await getSession(env, request);
    if (session) {
      return new Response(null, { status: 302, headers: { Location: "/admin.html" } });
    }
    // /login e /login/ servono la pagina di accesso dagli static assets.
    if (pathname !== "/login.html") {
      return env.ASSETS.fetch(new Request(new URL("/login.html", url), request));
    }
  }

  // /admin e /admin/ servono admin.html dagli static assets.
  if (isAdminPage && pathname !== "/admin.html") {
    return env.ASSETS.fetch(new Request(new URL("/admin.html", url), request));
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const secure = isSecureRequest(url);

    try {
      let response;
      if (url.pathname.startsWith("/api/")) {
        response = await handleApi(request, env, ctx, url, secure);
      } else if (url.pathname.startsWith("/uploads/")) {
        const id = url.pathname.slice("/uploads/".length);
        response = id
          ? await handleUploadServe(request, env, ctx, id)
          : notFound();
      } else {
        response = await handleGate(request, env, url);
      }
      return withSecurityHeaders(response, secure);
    } catch (err) {
      console.error("[worker]", err);
      return withSecurityHeaders(json(500, { error: "Errore interno del server." }), secure);
    }
  }
};
