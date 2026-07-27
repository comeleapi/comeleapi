// Test di integrazione end-to-end sul Worker Cloudflare (wrangler dev + D1 locale).
//
// Avvia `wrangler dev --local` su una porta effimera, con un database D1 locale
// isolato (--persist-to su directory temporanea) a cui viene applicato lo schema
// d1/schema.sql. I secrets vengono iniettati via --var. Gli scenari HTTP replicano
// il flusso reale del gestionale: login + CSRF, lettura/modifica catalogo prodotti
// (con riflesso immediato sulla rotta pubblica) e invio di una richiesta dal form
// contatto che diventa un lead visibile nel gestionale.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const CURRENT_PRODUCTS = require("../products.json");

const STARTUP_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 250;

function wranglerBin() {
  const binName = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
  const binPath = path.join(ROOT, "node_modules", ".bin", binName);
  if (!fs.existsSync(binPath)) {
    throw new Error(
      `wrangler non trovato in node_modules/.bin. Esegui "npm install" prima dei test.`
    );
  }
  return binPath;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// wrangler dev richiede che la directory degli static assets (dist/) esista.
// Se manca (test eseguito senza build) creiamo un placeholder minimo e lo
// rimuoviamo al termine, senza toccare un'eventuale build reale.
function ensureAssetsDir() {
  const distDir = path.join(ROOT, "dist");
  if (fs.existsSync(distDir)) return null;
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><title>comeleapi</title>");
  fs.writeFileSync(path.join(distDir, "404.html"), "<!doctype html><title>404</title>");
  return distDir;
}

function applySchema(persistDir) {
  const result = spawnSync(
    wranglerBin(),
    [
      "d1",
      "execute",
      "comeleapi-db",
      "--local",
      "--persist-to",
      persistDir,
      "--file",
      path.join("d1", "schema.sql")
    ],
    {
      cwd: ROOT,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
      encoding: "utf8"
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `Applicazione schema D1 fallita (exit ${result.status}):\n${result.stdout || ""}${result.stderr || ""}`
    );
  }
}

function startDev({ port, persistDir, env }) {
  const child = spawn(
    wranglerBin(),
    [
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      persistDir,
      "--log-level",
      "error",
      "--var",
      `SESSION_SECRET:${env.SESSION_SECRET}`,
      "--var",
      `ADMIN_USER:${env.ADMIN_USER}`,
      "--var",
      `ADMIN_PASSWORD:${env.ADMIN_PASSWORD}`
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        CI: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  return child;
}

async function waitForHealth(child, port) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev terminato durante l'avvio:\n${output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        const payload = await response.json();
        if (payload.ok && payload.database === "reachable") return;
      }
    } catch {
      // Il server non è ancora pronto ad accettare connessioni.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timeout avvio wrangler dev:\n${output}`);
}

async function stopDev(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 5_000);
  });
}

test("il Worker su D1 serve il catalogo del gestionale e riflette le modifiche sul frontend", { timeout: STARTUP_TIMEOUT_MS + 30_000 }, async (t) => {
  const adminUser = "sync-test-admin";
  const adminPassword = "Product-sync-test-password-2026";
  const sessionSecret = crypto.randomBytes(48).toString("base64url");

  const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), "comeleapi-d1-"));
  const createdDist = ensureAssetsDir();
  t.after(() => {
    fs.rmSync(persistDir, { recursive: true, force: true });
    if (createdDist) fs.rmSync(createdDist, { recursive: true, force: true });
  });

  applySchema(persistDir);

  const port = await freePort();
  const child = startDev({
    port,
    persistDir,
    env: { SESSION_SECRET: sessionSecret, ADMIN_USER: adminUser, ADMIN_PASSWORD: adminPassword }
  });
  t.after(() => stopDev(child));
  await waitForHealth(child, port);

  const base = `http://127.0.0.1:${port}`;

  // 1) Login amministratore (bootstrap dai secrets al primo accesso).
  const loginResponse = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ username: adminUser, password: adminPassword })
  });
  assert.equal(loginResponse.status, 200, "login amministratore riuscito");
  const loginPayload = await loginResponse.json();
  assert.equal(loginPayload.user.username, adminUser);
  const cookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];
  const csrfToken = loginPayload.csrfToken;
  assert.ok(csrfToken, "il login restituisce un token CSRF");

  // 2) Le rotte admin richiedono la sessione: senza cookie → 401.
  const unauthorized = await fetch(`${base}/api/admin/products`, {
    headers: { "Accept": "application/json" }
  });
  assert.equal(unauthorized.status, 401, "senza sessione la rotta admin è protetta");

  // 3) Il gestionale mostra il catalogo seed (products.json) dal database D1.
  const adminResponse = await fetch(`${base}/api/admin/products`, {
    headers: { "Accept": "application/json", "Cookie": cookie }
  });
  assert.equal(adminResponse.status, 200);
  const adminPayload = await adminResponse.json();
  assert.deepEqual(
    adminPayload.products.map((product) => product.id).sort(),
    CURRENT_PRODUCTS.map((product) => product.id).sort(),
    "il gestionale deve mostrare lo stesso catalogo del frontend"
  );

  // 4) Una modifica senza token CSRF viene rifiutata (403).
  const target = adminPayload.products[0];
  const csrfMissing = await fetch(`${base}/api/admin/products/${encodeURIComponent(target.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Cookie": cookie },
    body: JSON.stringify({ ...target, price: "1,00 €" })
  });
  assert.equal(csrfMissing.status, 403, "la protezione CSRF blocca le modifiche senza token");

  // 5) CRUD prodotto: aggiornamento prezzo con CSRF valido.
  const changed = { ...target, price: "199,99 €" };
  const updateResponse = await fetch(`${base}/api/admin/products/${encodeURIComponent(changed.id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Cookie": cookie,
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(changed)
  });
  assert.equal(updateResponse.status, 200);

  // 6) La modifica del gestionale è immediatamente visibile sulla rotta pubblica.
  const publicResponse = await fetch(`${base}/api/products`);
  assert.equal(publicResponse.status, 200);
  const publicPayload = await publicResponse.json();
  const publicProduct = publicPayload.products.find((product) => product.id === changed.id);
  assert.ok(publicProduct, "il prodotto modificato è presente nel catalogo pubblico");
  assert.equal(publicProduct.price, "199,99 €", "il prezzo aggiornato è visibile dal frontend");

  // 7) Il form contatto crea un lead visibile nel gestionale (contact → lead).
  const contactResponse = await fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      name: "Mario Rossi",
      phone: "+39 333 1234567",
      email: "mario.rossi@example.com",
      message: "Vorrei informazioni sugli oli essenziali."
    })
  });
  assert.equal(contactResponse.status, 201, "la richiesta dal form viene accettata");
  const contactPayload = await contactResponse.json();
  assert.ok(contactPayload.id, "la richiesta salvata restituisce un id");

  const leadsResponse = await fetch(`${base}/api/admin/leads?status=all`, {
    headers: { "Accept": "application/json", "Cookie": cookie }
  });
  assert.equal(leadsResponse.status, 200);
  const leadsPayload = await leadsResponse.json();
  const savedLead = leadsPayload.leads.find((lead) => lead.id === contactPayload.id);
  assert.ok(savedLead, "il lead appena creato è visibile nel gestionale");
  assert.equal(savedLead.email, "mario.rossi@example.com");
  assert.equal(savedLead.status, "new");
  assert.ok(leadsPayload.stats.total >= 1, "le statistiche contano la nuova richiesta");
});
