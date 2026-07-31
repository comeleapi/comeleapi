import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import CleanCSS from "clean-css";
import { minify } from "terser";
import {
  buildHomeStructuredData,
  buildLinksStructuredData
} from "./structured-data.mjs";
import {
  injectStructuredData,
  injectProductsGrid
} from "./html-inject.mjs";
import { buildSitemapXml, SITEMAP_PAGES, SITE_ORIGIN } from "./generate-sitemap.mjs";
import {
  contentHash,
  hashBytes,
  resolveLastmods,
  LASTMOD_MANIFEST_FILE,
  LASTMOD_PLACEHOLDER
} from "./content-freshness.mjs";
import {
  renderSitePages,
  GENERATED_PAGE_DIRS,
  LEGAL_PAGE_ROUTES
} from "./site-pages.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const OUT = path.join(ROOT, "dist");

// Asset pubblici del sito. Il gestionale (admin/login) viene aggiunto più sotto
// perché ora vive sullo stesso Worker Cloudflare e non su Render.
const PUBLIC_FILES = [
  "index.html",
  "robots.txt",
  "products.json",
  "links/index.html",
  "assets/css/styles.css",
  "assets/css/links.css",
  "assets/js/trusted-types.js",
  "assets/js/analytics.js",
  "assets/js/config.js",
  "assets/js/data.js",
  "assets/js/app.js",
  "assets/js/links.js",
  "assets/js/pages.js",
  "assets/pdf/mini-guida-oli-comeleapi.pdf",
  "assets/img/logo-comeleapi.png",
  "assets/img/logo-comeleapi-256.png",
  "assets/img/logo-comeleapi-512.png",
  "assets/img/logo-comeleapi-1024.png",
  "assets/img/logo-comeleapi-96.webp",
  "assets/img/logo-comeleapi-256.webp",
  "assets/img/signatures/sara-bordenga-signature-320.webp",
  "assets/img/signatures/sara-bordenga-signature.webp"
];

// Pagine, manifest e service worker del gestionale, ora serviti dal Worker.
const ADMIN_MANIFEST = "admin.webmanifest";
const ADMIN_HTML_PAGES = ["admin.html", "login.html"];
const ADMIN_CSS_FILES = ["assets/css/admin.css", "assets/css/login.css"];
const ADMIN_JS_FILES = ["assets/js/pwa.js", "assets/js/admin.js", "assets/js/login.js"];
const ADMIN_SERVICE_WORKER = "sw.js";

const PUBLIC_HERO_FILES = new Set([
  "hero-massaggio-professionale-comeleapi-mobile.webp",
  "hero-massaggio-professionale-comeleapi.webp",
  "hero-comeleapi-botanica.jpg",
  "hero-massage-sara.jpg"
]);

const PUBLIC_DECOR_FILES = new Set([
  "lavanda.webp",
  "eucalipto.webp",
  "resina.webp"
]);

const LINKS_ICON_PNGS = new Set([
  "icon-scroll.png",
  "icon-download-v3.png",
  "icon-arrow.png",
  "icon-seal.png",
  "icon-drop.png",
  "icon-hands.png",
  "icon-community.png",
  "social-whatsapp.png",
  "social-instagram.png"
]);

// Icone PNG usate solo dal gestionale (statiche in admin.html o generate da admin.js).
const ADMIN_ICON_PNGS = new Set([
  "admin-box.png",
  "admin-down.png",
  "admin-edit.png",
  "admin-external.png",
  "admin-eye.png",
  "admin-eye-off.png",
  "admin-plus.png",
  "admin-reset.png",
  "admin-tag.png",
  "admin-trash.png",
  "admin-up.png",
  "icon-chat.png",
  "icon-calendar.png",
  "icon-seal.png",
  "icon-spark.png"
]);

const PUBLIC_FONT_FILES = new Set([
  "cormorant-garamond-variable-latin.woff2",
  "cormorant-garamond-italic-variable-latin.woff2",
  "mulish-variable-latin.woff2"
]);

// File sorgente che non devono mai finire in dist/. admin.html, login.html,
// admin.webmanifest e sw.js NON sono più vietati: ora vengono pubblicati e il
// gate di accesso è nel Worker.
const FORBIDDEN_OUTPUTS = [
  "server.js",
  "package.json",
  "package-lock.json",
  "render.yaml",
  "wrangler.jsonc",
  "data",
  "scripts",
  "output",
  ".env"
];

// Il lookbehind evita di trattare il segmento `/assets/...` di un URL assoluto
// (per esempio un'immagine Open Graph) come un riferimento locale relativo.
const ASSET_REFERENCE_RE = /(?<![A-Za-z0-9_./:-])(?:\.\.\/|\.\/)?(?:assets|foto-prodotti|fonts|img)\/[A-Za-z0-9_./-]+\.(?:woff2?|ttf|webp|png|jpe?g|pdf|json|css|js)(?:\?[^"'`\s)<>,]*)?/g;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyRelative(relativePath) {
  const source = path.join(ROOT, relativePath);
  const destination = path.join(OUT, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function copyDirectoryFiltered(relativeDirectory, includeFile) {
  const sourceRoot = path.join(ROOT, relativeDirectory);
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryFiltered(relativePath, includeFile);
    } else if (entry.isFile() && includeFile(entry.name, relativePath)) {
      await copyRelative(relativePath);
    }
  }
}

function shortHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

// Il PDF pubblico è una URL indicizzabile a sé (è in sitemap e nel nodo
// DigitalDocument): se il link in pagina portasse una cache key, esisterebbero
// due URL per lo stesso documento e un PDF non può dichiarare rel="canonical"
// nel markup. Resta fuori dal fingerprinting ed è già servito con
// `max-age=0, must-revalidate`, quindi non ha bisogno di cache busting.
const FINGERPRINT_EXCLUDED_RE = /(?:^|\/)assets\/pdf\//;

async function fingerprintReferences(source, baseDirectory) {
  const replacements = new Map();
  for (const match of source.matchAll(ASSET_REFERENCE_RE)) {
    const rawUrl = match[0];
    if (FINGERPRINT_EXCLUDED_RE.test(rawUrl)) continue;
    const cleanUrl = rawUrl.split("?", 1)[0];
    const filePath = path.resolve(baseDirectory, cleanUrl);
    if (!filePath.startsWith(`${ROOT}${path.sep}`) || !(await exists(filePath))) continue;
    const fileHash = shortHash(await readFile(filePath));
    replacements.set(rawUrl, `${cleanUrl}?v=${fileHash}`);
  }
  let output = source;
  const orderedReplacements = [...replacements].sort(([left], [right]) => right.length - left.length);
  const placeholders = orderedReplacements.map(([, versionedUrl], index) => ({
    marker: `__COMELEAPI_ASSET_${index}__`,
    versionedUrl
  }));
  orderedReplacements.forEach(([rawUrl], index) => {
    // Sostituzione boundary-aware: rispecchia il lookbehind di ASSET_REFERENCE_RE
    // così un riferimento relativo (es. foto-prodotti/x.webp) non viene rimpiazzato
    // quando compare come sottostringa di un URL assoluto (es. .../foto-prodotti/x.webp
    // nel JSON-LD), che deve restare canonico e senza cache key.
    const escaped = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundaryRe = new RegExp(`(?<![A-Za-z0-9_./:-])${escaped}`, "g");
    output = output.replace(boundaryRe, placeholders[index].marker);
  });
  for (const { marker, versionedUrl } of placeholders) {
    output = output.split(marker).join(versionedUrl);
  }
  return output;
}

async function minifyJavaScript(relativePath, documentBase = ROOT) {
  const sourcePath = path.join(ROOT, relativePath);
  const destinationPath = path.join(OUT, relativePath);
  const source = await fingerprintReferences(await readFile(sourcePath, "utf8"), documentBase);
  const result = await minify(source, {
    compress: { passes: 2 },
    mangle: true,
    ecma: 2020,
    format: { comments: false }
  });
  if (!result.code) throw new Error(`Minificazione JavaScript fallita: ${relativePath}`);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, `${result.code}\n`);
}

async function minifyCss(relativePath) {
  const sourcePath = path.join(ROOT, relativePath);
  const source = await fingerprintReferences(
    await readFile(sourcePath, "utf8"),
    path.dirname(sourcePath)
  );
  const result = new CleanCSS({
    level: { 1: { specialComments: 0 }, 2: false },
    rebase: false
  }).minify(source);
  if (result.errors.length) {
    throw new Error(`Minificazione CSS fallita (${relativePath}): ${result.errors.join("; ")}`);
  }
  return result.styles;
}

async function transformCatalog() {
  const sourcePath = path.join(ROOT, "products.json");
  const products = JSON.parse(await readFile(sourcePath, "utf8"));
  for (const product of products) {
    if (typeof product.image === "string") {
      product.image = await fingerprintReferences(product.image, ROOT);
    }
    if (typeof product.icon === "string") {
      product.icon = await fingerprintReferences(product.icon, ROOT);
    }
  }
  await writeFile(path.join(OUT, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
}

async function transformHome(styles, structuredData, products) {
  const sourcePath = path.join(ROOT, "index.html");
  let html = await readFile(sourcePath, "utf8");
  html = injectStructuredData(html, structuredData);
  html = injectProductsGrid(html, products);
  const stylesheetPattern = /\s*<link rel="stylesheet" href="assets\/css\/styles\.css\?[^\"]+" \/>/;
  if (!stylesheetPattern.test(html)) {
    throw new Error("Link al CSS principale non trovato in index.html");
  }
  const inlinedStyles = styles.split("../fonts/").join("assets/fonts/");
  html = html.replace(stylesheetPattern, `\n  <style data-source="assets/css/styles.css">${inlinedStyles}</style>`);
  html = await fingerprintReferences(html, OUT);
  await writeFile(path.join(OUT, "index.html"), html);
}

async function transformLinksPage(structuredData) {
  const sourcePath = path.join(ROOT, "links/index.html");
  const source = injectStructuredData(await readFile(sourcePath, "utf8"), structuredData);
  const html = await fingerprintReferences(
    source,
    path.join(OUT, "links")
  );
  await writeFile(path.join(OUT, "links/index.html"), html);
}

// admin.html/login.html restano pagine autonome (nessun inline del CSS): basta
// versionare i riferimenti agli asset del gestionale già minificati in dist/.
async function transformAdminPage(relativePath) {
  const source = await readFile(path.join(ROOT, relativePath), "utf8");
  const html = await fingerprintReferences(source, OUT);
  await writeFile(path.join(OUT, relativePath), html);
}

function resolveReferenceBase(filePath) {
  if (filePath.endsWith("links/index.html") || filePath.endsWith("assets/js/links.js")) {
    return path.join(OUT, "links");
  }
  if (filePath.endsWith(".css")) return path.dirname(filePath);
  return OUT;
}

async function assertReferencesExist(relativePaths) {
  const missing = new Set();
  for (const relativePath of relativePaths) {
    const filePath = path.join(OUT, relativePath);
    const source = await readFile(filePath, "utf8");
    for (const match of source.matchAll(ASSET_REFERENCE_RE)) {
      const rawUrl = match[0].split("?", 1)[0];
      const resolved = path.resolve(resolveReferenceBase(filePath), rawUrl);
      if (!resolved.startsWith(`${OUT}${path.sep}`) || !(await exists(resolved))) {
        missing.add(`${relativePath}: ${match[0]}`);
      }
    }
  }
  if (missing.size) {
    throw new Error(`Asset pubblici mancanti:\n${[...missing].join("\n")}`);
  }
}

async function directorySize(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    bytes += entry.isDirectory() ? await directorySize(filePath) : (await stat(filePath)).size;
  }
  return bytes;
}

// Header di sicurezza e cache, portati da netlify.toml al formato `_headers`
// degli static assets di Cloudflare Workers. connect-src resta 'self' (stessa
// origine del Worker): nessun riferimento a Render.
function buildHeadersFile() {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://wa.me",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "require-trusted-types-for 'script'",
    "trusted-types comeleapi",
    "upgrade-insecure-requests"
  ].join("; ");
  return `# Generato da scripts/build-site.mjs — non modificare a mano.
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Cross-Origin-Opener-Policy: same-origin
  X-XSS-Protection: 0
  Content-Security-Policy: ${csp}

# ATTENZIONE: Cloudflare applica TUTTE le regole che combaciano con la richiesta
# e unisce i valori duplicati con una virgola — la regola più specifica NON
# vince. I pattern Cache-Control qui sotto sono quindi disgiunti: un /assets/*
# generico si sommerebbe a quelli specifici producendo header contraddittori del
# tipo "max-age=0, must-revalidate, max-age=31536000, immutable".
# https://developers.cloudflare.com/workers/static-assets/headers/

# Documento indicizzabile: deve poter essere sostituito senza cache bloccate.
/assets/pdf/*
  Cache-Control: public, max-age=0, must-revalidate

# Immagini referenziate senza cache key (og:image, twitter:image, image sitemap
# e nodi ImageObject usano l'URL nuda): con cache immutable una sostituzione
# resterebbe invisibile fino a un anno negli scraper social e nelle cache edge.
/assets/img/hero/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/assets/img/signatures/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/assets/img/logo-comeleapi-1024.png
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

# Tutto il resto è referenziato solo con fingerprint ?v=<hash>: cache perpetua.
/assets/css/*
  Cache-Control: public, max-age=31536000, immutable

/assets/js/*
  Cache-Control: public, max-age=31536000, immutable

/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/assets/img/icons/*
  Cache-Control: public, max-age=31536000, immutable

/assets/img/decor/*
  Cache-Control: public, max-age=31536000, immutable

/assets/img/logo-comeleapi-96.webp
  Cache-Control: public, max-age=31536000, immutable

/assets/img/logo-comeleapi-256.webp
  Cache-Control: public, max-age=31536000, immutable

/assets/img/logo-comeleapi-256.png
  Cache-Control: public, max-age=31536000, immutable

/assets/img/logo-comeleapi-512.png
  Cache-Control: public, max-age=31536000, immutable

/assets/img/logo-comeleapi.png
  Cache-Control: public, max-age=31536000, immutable

/foto-prodotti/*
  Cache-Control: public, max-age=31536000, immutable

/products.json
  X-Robots-Tag: noindex
  Cache-Control: public, max-age=0, must-revalidate

/sitemap.xml
  Content-Type: application/xml; charset=UTF-8
  Cache-Control: public, max-age=0, must-revalidate

/robots.txt
  Content-Type: text/plain; charset=UTF-8
  Cache-Control: public, max-age=0, must-revalidate

/sw.js
  Cache-Control: public, max-age=0, must-revalidate

/admin.webmanifest
  Cache-Control: public, max-age=0, must-revalidate

/
  Cache-Control: public, max-age=0, must-revalidate

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/links/*
  Cache-Control: public, max-age=0, must-revalidate

/zone/*
  Cache-Control: public, max-age=0, must-revalidate

/servizi/*
  Cache-Control: public, max-age=0, must-revalidate

/faq/*
  Cache-Control: public, max-age=0, must-revalidate
${LEGAL_PAGE_ROUTES.map((legal) => `
/${legal.slug}/*
  X-Robots-Tag: noindex
  Cache-Control: public, max-age=0, must-revalidate
`).join("")}`;
}

// Redirect canonici (formato `_redirects` di Cloudflare). Il gate /admin e
// /login è gestito dal Worker; i file interni non vengono pubblicati e cadono
// naturalmente sulla 404-page.
function buildRedirectsFile() {
  const generatedRedirects = GENERATED_PAGE_DIRS
    .map((dir) => `/${dir}/index.html /${dir}/ 301`)
    .join("\n");
  return `# Generato da scripts/build-site.mjs — non modificare a mano.
/index.html / 301
/links/index.html /links/ 301
${generatedRedirects}
`;
}

function build404Page() {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Pagina non trovata — comeleapi</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FEEEEF;
      color: #4a2c2f;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      text-align: center;
      padding: 24px;
    }
    main { max-width: 32rem; }
    h1 { font-size: 3rem; margin: 0 0 0.5rem; }
    p { font-size: 1.1rem; line-height: 1.6; margin: 0 0 1.5rem; }
    a {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      border-radius: 999px;
      background: #c06c74;
      color: #fff;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main>
    <h1>404</h1>
    <p>La pagina che cerchi non esiste o è stata spostata.</p>
    <a href="/">Torna alla home</a>
  </main>
</body>
</html>
`;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const relativePath of PUBLIC_FILES) await copyRelative(relativePath);
await copyRelative(ADMIN_MANIFEST);
await copyDirectoryFiltered("assets/fonts", (name) => PUBLIC_FONT_FILES.has(name));
await copyDirectoryFiltered("assets/img/hero", (name) => PUBLIC_HERO_FILES.has(name));
await copyDirectoryFiltered("assets/img/decor", (name) => PUBLIC_DECOR_FILES.has(name));
await copyDirectoryFiltered(
  "assets/img/icons",
  (name) => name.endsWith(".webp") || LINKS_ICON_PNGS.has(name) || ADMIN_ICON_PNGS.has(name)
);
await copyDirectoryFiltered("foto-prodotti", (name) => name.endsWith(".webp"));

await transformCatalog();
const sourceProducts = JSON.parse(await readFile(path.join(ROOT, "products.json"), "utf8"));

const homeStyles = await minifyCss("assets/css/styles.css");
const linksStyles = await minifyCss("assets/css/links.css");
await writeFile(path.join(OUT, "assets/css/styles.css"), `${homeStyles}\n`);
await writeFile(path.join(OUT, "assets/css/links.css"), `${linksStyles}\n`);

// CSS del gestionale minificato (restano file esterni referenziati da admin/login).
for (const relativePath of ADMIN_CSS_FILES) {
  const minified = await minifyCss(relativePath);
  await writeFile(path.join(OUT, relativePath), `${minified}\n`);
}

await minifyJavaScript("assets/js/config.js");
await minifyJavaScript("assets/js/trusted-types.js");
await minifyJavaScript("assets/js/analytics.js");
await minifyJavaScript("assets/js/app.js");
await minifyJavaScript("assets/js/links.js", path.join(ROOT, "links"));
await minifyJavaScript("assets/js/pages.js");

// JavaScript del gestionale e service worker.
for (const relativePath of ADMIN_JS_FILES) await minifyJavaScript(relativePath);
await minifyJavaScript(ADMIN_SERVICE_WORKER);

// data.js viene elaborato dopo products.json, così il suo URL porta l'hash
// del catalogo finale già versionato.
const dataSourcePath = path.join(ROOT, "assets/js/data.js");
let dataSource = await readFile(dataSourcePath, "utf8");
const catalogHash = shortHash(await readFile(path.join(OUT, "products.json")));
dataSource = dataSource.replace(/products\.json\?[^"']+/, `products.json?v=${catalogHash}`);
const minifiedData = await minify(dataSource, {
  compress: { passes: 2 },
  mangle: true,
  ecma: 2020,
  format: { comments: false }
});
if (!minifiedData.code) throw new Error("Minificazione JavaScript fallita: assets/js/data.js");
await writeFile(path.join(OUT, "assets/js/data.js"), `${minifiedData.code}\n`);

// Pagine del gestionale: versionamento dei riferimenti dopo aver scritto css/js.
for (const relativePath of ADMIN_HTML_PAGES) await transformAdminPage(relativePath);

// Sottopagine statiche (zone, servizi, faq, informative): generate a valle di
// css/js già minificati in dist, così le URL root-relative portano l'hash
// definitivo. Il markup contiene ancora LASTMOD_PLACEHOLDER: viene sostituito
// più sotto, quando la data di aggiornamento è stata risolta sull'hash del
// contenuto.
const versionedAssetCache = new Map();
function versionedAsset(relativePath) {
  if (!versionedAssetCache.has(relativePath)) {
    const filePath = path.join(OUT, relativePath);
    let content;
    try {
      content = readFileSync(filePath);
    } catch {
      throw new Error(`Asset mancante in dist per le sottopagine: ${relativePath}`);
    }
    versionedAssetCache.set(relativePath, `/${relativePath}?v=${shortHash(content)}`);
  }
  return versionedAssetCache.get(relativePath);
}
const sitePages = renderSitePages(versionedAsset);

// ─── Freschezza dei contenuti ───────────────────────────────────────────────
// Un'unica risoluzione per tutte le URL canoniche: alimenta sia <lastmod> nella
// sitemap sia dateModified nei nodi WebPage. La data cambia solo se cambia
// l'hash del contenuto, quindi resta stabile tra build successive su CI.
const HOME_LOC = `${SITE_ORIGIN}/`;
const LINKS_LOC = `${SITE_ORIGIN}/links/`;
const PDF_LOC = `${SITE_ORIGIN}/assets/pdf/mini-guida-oli-comeleapi.pdf`;

const freshnessEntries = [
  {
    loc: HOME_LOC,
    // Sorgenti canonici della home: markup redazionale + catalogo prodotti.
    hash: contentHash(
      (await readFile(path.join(ROOT, "index.html"), "utf8")) +
        (await readFile(path.join(ROOT, "products.json"), "utf8"))
    )
  },
  {
    loc: LINKS_LOC,
    hash: contentHash(await readFile(path.join(ROOT, "links/index.html"), "utf8"))
  },
  ...sitePages.map((page) => ({ loc: page.canonical, hash: contentHash(page.html) })),
  {
    loc: PDF_LOC,
    hash: hashBytes(await readFile(path.join(ROOT, "assets/pdf/mini-guida-oli-comeleapi.pdf")))
  }
];

const { lastmodByLoc, changed } = await resolveLastmods(
  path.join(ROOT, LASTMOD_MANIFEST_FILE),
  freshnessEntries
);

const homeStructuredData = buildHomeStructuredData(sourceProducts, lastmodByLoc.get(HOME_LOC));
const linksStructuredData = buildLinksStructuredData(lastmodByLoc.get(LINKS_LOC));

await transformHome(homeStyles, homeStructuredData, sourceProducts);
await transformLinksPage(linksStructuredData);

for (const page of sitePages) {
  const lastmod = lastmodByLoc.get(page.canonical);
  if (!lastmod) throw new Error(`Data di aggiornamento non risolta per ${page.canonical}`);
  const destination = path.join(OUT, page.route);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, page.html.split(LASTMOD_PLACEHOLDER).join(lastmod));
}

const sitemapXml = await buildSitemapXml(ROOT, lastmodByLoc);
await writeFile(path.join(OUT, "sitemap.xml"), sitemapXml);
await writeFile(path.join(ROOT, "sitemap.xml"), sitemapXml);

// File di configurazione degli static assets Cloudflare + pagina 404.
await writeFile(path.join(OUT, "_headers"), buildHeadersFile());
await writeFile(path.join(OUT, "_redirects"), buildRedirectsFile());
await writeFile(path.join(OUT, "404.html"), build404Page());

await assertReferencesExist([
  "index.html",
  "products.json",
  "links/index.html",
  "assets/css/styles.css",
  "assets/css/links.css",
  "assets/js/trusted-types.js",
  "assets/js/analytics.js",
  "assets/js/app.js",
  "assets/js/data.js",
  "assets/js/links.js",
  "admin.html",
  "login.html",
  "assets/css/admin.css",
  "assets/css/login.css",
  "assets/js/admin.js",
  "assets/js/login.js",
  "assets/js/pwa.js"
]);

for (const forbidden of FORBIDDEN_OUTPUTS) {
  if (await exists(path.join(OUT, forbidden))) {
    throw new Error(`File non pubblico presente in dist: ${forbidden}`);
  }
}

const totalBytes = await directorySize(OUT);
console.log(
  `Build Cloudflare completata: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB in dist/ ` +
    `(sitemap: ${SITEMAP_PAGES.length} URL canoniche, ${sitePages.length} sottopagine generate)`
);
