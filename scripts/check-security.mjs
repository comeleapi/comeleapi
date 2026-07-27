import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function listRepositoryTextFiles(directory) {
  const skippedDirectories = new Set([
    ".git",
    ".venv-opt",
    "data",
    "dist",
    "node_modules",
    "output",
    "tmp",
    "uploads"
  ]);
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listRepositoryTextFiles(file));
    else if (/\.(?:css|html|js|json|jsonc|md|mjs|sql|toml|txt|xml|ya?ml)$/i.test(entry.name)) files.push(file);
  }
  return files;
}

const forbiddenLocationDigest = "fa0f4be95c3c0feff1a936abc84e79ed6aa3ee3d14041f3f0ff1cc2ece2a3407";
function containsForbiddenLocation(source) {
  const tokens = source
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (let index = 0; index <= tokens.length - 4; index += 1) {
    if (createHash("sha256").update(tokens.slice(index, index + 4).join(" ")).digest("hex") === forbiddenLocationDigest) {
      return true;
    }
  }
  return false;
}

const wrangler = await readFile(path.join(ROOT, "wrangler.jsonc"), "utf8");
const index = await readFile(path.join(ROOT, "src/worker/index.mjs"), "utf8");
const auth = await readFile(path.join(ROOT, "src/worker/auth.mjs"), "utf8");
const lib = await readFile(path.join(ROOT, "src/worker/lib.mjs"), "utf8");
const uploads = await readFile(path.join(ROOT, "src/worker/api/uploads.mjs"), "utf8");
const login = await readFile(path.join(ROOT, "src/worker/api/auth.mjs"), "utf8");
const schema = await readFile(path.join(ROOT, "d1/schema.sql"), "utf8");
const buildSite = await readFile(path.join(ROOT, "scripts/build-site.mjs"), "utf8");
const packageManifest = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const nodeVersion = (await readFile(path.join(ROOT, ".node-version"), "utf8")).trim();

// ── Configurazione Worker (wrangler.jsonc) ──────────────────────────
assert(/"name":\s*"comeleapi"/.test(wrangler), "Wrangler: il nome del Worker deve essere comeleapi (deve coincidere su Workers Builds)");
assert(/"main":\s*"src\/worker\/index\.mjs"/.test(wrangler), "Wrangler: entrypoint del Worker mancante");
assert(/"not_found_handling":\s*"404-page"/.test(wrangler), "Wrangler: not_found_handling deve servire la 404-page");
for (const route of ["/api/*", "/admin*", "/login*", "/uploads/*"]) {
  assert(wrangler.includes(`"${route}"`), `Wrangler: run_worker_first deve includere ${route}`);
}
assert(/"binding":\s*"DB"/.test(wrangler) && /"database_name":\s*"comeleapi-db"/.test(wrangler), "Wrangler: binding D1 DB mancante");
assert(/"observability":\s*\{\s*"enabled":\s*true/.test(wrangler), "Wrangler: observability non attiva");
assert(!/SESSION_SECRET"\s*:/.test(wrangler) && !/ADMIN_PASSWORD"\s*:/.test(wrangler) && !/VAPID_PRIVATE_KEY"\s*:/.test(wrangler), "Wrangler: i segreti non devono stare in vars, solo come secret");

// ── Gate del gestionale e API (index.mjs) ───────────────────────────
assert(index.includes("async function handleGate"), "Worker: gate del gestionale mancante");
assert(index.includes('pathname === "/admin.html"') && index.includes('Location: `/login.html'), "Worker: redirect a login per /admin senza sessione mancante");
assert(index.includes("await getSession(env, request)"), "Worker: gate senza verifica sessione");
assert(index.includes("if (!verifyCsrf(request, session)) return json(403"), "Worker: le rotte admin devono verificare il CSRF");
assert(index.includes('pathname === "/api/health"'), "Worker: health endpoint mancante");
assert(index.includes('database: "unreachable"'), "Worker: stato database health mancante");
assert(!index.includes("Access-Control-Allow-Credentials") && !lib.includes("Access-Control-Allow-Credentials"), "Sicurezza: CORS credentialed non necessario (stessa origine)");
assert(!index.includes("Access-Control-Allow-Origin") && !lib.includes("Access-Control-Allow-Origin"), "Sicurezza: nessun header CORS deve essere impostato (stessa origine)");

// ── Header di sicurezza del Worker (lib.mjs) ────────────────────────
assert(lib.includes('headers.set("X-Frame-Options", "DENY")'), "Sicurezza: X-Frame-Options DENY mancante nel Worker");
assert(lib.includes('headers.set("X-Content-Type-Options", "nosniff")'), "Sicurezza: X-Content-Type-Options mancante nel Worker");
assert(lib.includes("Strict-Transport-Security"), "Sicurezza: HSTS mancante nel Worker");
assert(lib.includes('"connect-src \'self\'"'), "Sicurezza: connect-src deve essere 'self' (nessun backend esterno)");
assert(lib.includes('SameSite=${options.sameSite || "Lax"}'), "Sicurezza: cookie SameSite=Lax mancante");
assert(lib.includes('pieces.push("HttpOnly")'), "Sicurezza: cookie HttpOnly mancante");

// ── Autenticazione (auth.mjs) ───────────────────────────────────────
assert(auth.includes("const PBKDF2_ITERATIONS = 100000"), "Auth: PBKDF2 con 100.000 iterazioni mancante");
assert(auth.includes('hash: "SHA-256"'), "Auth: PBKDF2 deve usare SHA-256");
assert(auth.includes("timingSafeEqualBytes(expected, actual)"), "Auth: confronto password non constant-time");
assert(auth.includes("export function verifyCsrf"), "Auth: verifica CSRF mancante");
assert(auth.includes("timingSafeEqualStrings(token, session.csrfToken)"), "Auth: confronto CSRF non constant-time");
assert(auth.includes("value.length < 14"), "Auth: requisito password forte (>=14) mancante");
assert(auth.includes("LEGACY_WEAK_ADMIN_PASSWORDS"), "Auth: blocco password predefinite mancante");
assert(auth.includes("crypto.subtle.sign(\"HMAC\", key")||auth.includes('crypto.subtle.sign("HMAC", key'), "Auth: cookie di sessione non firmato HMAC");
assert(auth.includes("DELETE FROM sessions WHERE expires_at <"), "Auth: pulizia delle sessioni scadute mancante");
assert(auth.includes("export async function checkLoginRate") && auth.includes("export async function checkContactRate"), "Auth: rate limiting login/contact mancante");
assert(auth.includes("`login:${clientIp(request)}`"), "Rate limit: il login deve essere limitato per IP");
assert(login.includes("checkLoginRate"), "Auth: la login deve applicare il rate limiting");

// ── Upload immagini (uploads.mjs) ───────────────────────────────────
assert(uploads.includes("MAX_UPLOAD_BYTES"), "Upload: limite dimensione file mancante");
assert(lib.includes("export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024"), "Upload: limite BLOB D1 (2 MB) mancante");

// ── Schema D1 ───────────────────────────────────────────────────────
for (const table of ["products", "leads", "users", "push_subscriptions", "sessions", "rate_limits", "images"]) {
  assert(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${table}\\b`, "i").test(schema), `Schema D1: tabella ${table} mancante`);
}

// ── CSP e header degli static assets (build-site.mjs) ───────────────
assert(buildSite.includes("buildHeadersFile") && buildSite.includes('writeFile(path.join(OUT, "_headers")'), "Build: generazione _headers mancante");
assert(buildSite.includes("buildRedirectsFile") && buildSite.includes('writeFile(path.join(OUT, "_redirects")'), "Build: generazione _redirects mancante");
assert(buildSite.includes('writeFile(path.join(OUT, "404.html")'), "Build: generazione 404.html mancante");
assert(buildSite.includes('"connect-src \'self\'"'), "Build: CSP degli static assets deve avere connect-src 'self'");
assert(buildSite.includes("Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"), "Build: HSTS negli static assets mancante");
assert(buildSite.includes("require-trusted-types-for 'script'"), "Build: Trusted Types nella CSP degli static assets mancante");

// ── Nessun residuo dell'infrastruttura precedente ───────────────────
for (const source of [wrangler, index, auth, lib, buildSite]) {
  assert(!/onrender\.com/i.test(source), "Residuo: riferimento a Render (onrender.com) ancora presente");
  assert(!/supabase/i.test(source), "Residuo: riferimento a Supabase ancora presente");
}
assert(!("dependencies" in packageManifest) || Object.keys(packageManifest.dependencies || {}).length === 0, "package.json: nessuna dipendenza runtime attesa (Supabase/web-push rimossi)");
assert(packageManifest.devDependencies?.wrangler, "package.json: wrangler mancante tra le devDependencies");
assert(!packageManifest.dependencies?.["@supabase/supabase-js"], "package.json: @supabase/supabase-js deve essere rimosso");
assert(!packageManifest.dependencies?.["web-push"], "package.json: web-push deve essere rimosso");

// ── Runtime ─────────────────────────────────────────────────────────
assert(nodeVersion === "24.18.0", "Runtime: .node-version deve fissare Node 24.18.0");
assert(
  packageManifest.engines?.node === ">=24.18.0 <25.0.0",
  "Runtime: engines.node deve essere coerente con Node 24 e avere un limite superiore"
);

for (const file of await listRepositoryTextFiles(ROOT)) {
  assert(
    !containsForbiddenLocation(await readFile(file, "utf8")),
    `Privacy: dato di localizzazione privato presente in ${path.relative(ROOT, file)}`
  );
}

console.log("Check sicurezza completato: Worker Cloudflare hardenizzato, segreti fuori dal codice, CSP e gate /admin coerenti.");
