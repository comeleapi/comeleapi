import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(relativePath) {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

// Il deploy è gestito da Cloudflare Workers Builds (connesso al repo GitHub):
// ogni push su main esegue `npm run build` + `npx wrangler deploy`. Non esiste
// più un workflow GitHub Actions (né il keep-alive di Render).
const packageManifest = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const wranglerSource = await readFile(path.join(ROOT, "wrangler.jsonc"), "utf8");

const scripts = packageManifest.scripts || {};
assert(scripts.build?.includes("build:site"), "CI/CD: lo script build deve usare build:site");
assert(scripts["build:site"] === "node scripts/build-site.mjs", "CI/CD: build:site deve invocare scripts/build-site.mjs");
assert(/\bwrangler deploy\b/.test(scripts.deploy || ""), "CI/CD: lo script deploy deve invocare wrangler deploy");
assert(scripts.deploy?.includes("npm run build"), "CI/CD: il deploy deve ricostruire dist prima di pubblicare");
assert(/\bwrangler dev\b/.test(scripts.dev || ""), "CI/CD: script dev (wrangler dev) mancante per lo sviluppo locale");
assert(scripts["db:schema"]?.includes("d1/schema.sql"), "CI/CD: script db:schema mancante");
assert(scripts["db:seed"]?.includes("d1/seed.sql"), "CI/CD: script db:seed mancante");

// JSONC minimale: rimuove i commenti e verifica che la configurazione sia valida
// e coerente con il nome del Worker richiesto da Workers Builds.
const wranglerJson = JSON.parse(
  wranglerSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
);
assert(wranglerJson.name === "comeleapi", "CI/CD: il name del Worker deve coincidere con quello configurato su Workers Builds");
assert(wranglerJson.main === "src/worker/index.mjs", "CI/CD: main del Worker non coerente");
assert(wranglerJson.assets?.directory === "./dist", "CI/CD: gli static assets devono puntare a ./dist (output della build)");
assert(Array.isArray(wranglerJson.d1_databases) && wranglerJson.d1_databases[0]?.binding === "DB", "CI/CD: binding D1 mancante nella configurazione");

// L'infrastruttura precedente (Render keep-alive, Netlify) non deve più esistere.
for (const legacyPath of [".github/workflows/keep-alive.yml", "render.yaml", "netlify.toml", "server.js"]) {
  assert(!(await exists(legacyPath)), `CI/CD: file legacy ancora presente, va rimosso: ${legacyPath}`);
}

console.log("Check workflow completato: deploy via Workers Builds coerente, nessun residuo Render/Netlify.");
