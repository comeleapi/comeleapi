import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITEMAP_PAGES, SITE_ORIGIN } from "./generate-sitemap.mjs";
import { SEO_CHECK_PAGES, LEGAL_PAGE_ROUTES } from "./site-pages.mjs";
import { LASTMOD_MANIFEST_FILE } from "./content-freshness.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DIST = path.join(ROOT, "dist");

const pages = [
  {
    file: "index.html",
    canonical: `${SITE_ORIGIN}/`,
    schemaType: "WebPage",
    schemaId: `${SITE_ORIGIN}/#webpage`
  },
  {
    file: "links/index.html",
    canonical: `${SITE_ORIGIN}/links/`,
    schemaType: "WebPage",
    schemaId: `${SITE_ORIGIN}/links/#webpage`
  },
  // Sottopagine zone/servizi generate a build-time (stessi vincoli SEO).
  ...SEO_CHECK_PAGES
];

const htmlCanonicals = pages.map((page) => page.canonical);
const sitemapCanonicals = SITEMAP_PAGES.map((page) => page.loc);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

for (const page of pages) {
  const html = await readFile(path.join(DIST, page.file), "utf8");
  const canonical = escapeRegExp(page.canonical);

  assert(
    countMatches(html, new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${canonical}["']`, "gi")) === 1,
    `${page.file}: canonical unico mancante o errato`
  );
  assert(
    countMatches(html, new RegExp(`<meta\\s+property=["']og:url["']\\s+content=["']${canonical}["']`, "gi")) === 1,
    `${page.file}: og:url unico mancante o errato`
  );
  assert(countMatches(html, /<h1(?:\s|>)/gi) === 1, `${page.file}: deve contenere un solo H1`);

  const schemaBlocks = [...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  assert(schemaBlocks.length === 1, `${page.file}: deve contenere un solo blocco JSON-LD`);
  const schema = JSON.parse(schemaBlocks[0][1]);
  const graph = Array.isArray(schema["@graph"]) ? schema["@graph"] : [schema];
  const pageNode = graph.find((node) => node["@id"] === page.schemaId);
  assert(pageNode, `${page.file}: nodo WebPage canonico mancante`);
  const pageTypes = Array.isArray(pageNode["@type"]) ? pageNode["@type"] : [pageNode["@type"]];
  assert(pageTypes.includes(page.schemaType), `${page.file}: tipo JSON-LD inatteso`);
  assert(pageNode.url === page.canonical, `${page.file}: URL JSON-LD non canonico`);

  assert(!html.includes("../index.html"), `${page.file}: link interno non canonico ../index.html`);
  assert(
    !/<meta\s+name=["']robots["'][^>]*noindex/i.test(html),
    `${page.file}: pagina indicizzabile marcata noindex`
  );
}

// Pagine legali: navigabili ma senza valore strategico di posizionamento
// (noindex, canonical presente, fuori dalla sitemap).
for (const legal of LEGAL_PAGE_ROUTES) {
  const html = await readFile(path.join(DIST, legal.route), "utf8");
  assert(
    /<meta\s+name=["']robots["']\s+content=["']noindex[^"']*["']/i.test(html),
    `${legal.route}: meta robots noindex mancante`
  );
  assert(
    countMatches(html, new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${escapeRegExp(legal.canonical)}["']`, "gi")) === 1,
    `${legal.route}: canonical unico mancante o errato`
  );
  assert(countMatches(html, /<h1(?:\s|>)/gi) === 1, `${legal.route}: deve contenere un solo H1`);
}

const home = await readFile(path.join(DIST, "index.html"), "utf8");
assert(!home.includes('id="certificazioni"'), "index.html: sezione certificazioni non verificata ancora pubblicata");
assert(!home.includes('id="prenota"'), "index.html: sezione territoriale futura ancora pubblicata");

const linksPage = await readFile(path.join(DIST, "links/index.html"), "utf8");
const linksDescription = linksPage.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || "";
assert(
  !linksDescription.toLowerCase().includes("instagram"),
  "links/index.html: la meta description non deve promettere il link Instagram nascosto"
);

const sitemap = await readFile(path.join(DIST, "sitemap.xml"), "utf8");
assert(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "sitemap.xml: prologo XML UTF-8 mancante");
assert(
  /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemap),
  "sitemap.xml: namespace sitemaps.org 0.9 mancante"
);
assert(
  /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/.test(sitemap),
  "sitemap.xml: namespace image sitemap 1.1 mancante"
);
assert(!/<changefreq\b/i.test(sitemap), "sitemap.xml: changefreq non deve essere usata (ignorata da Google)");
assert(!/<priority\b/i.test(sitemap), "sitemap.xml: priority non deve essere usata (ignorata da Google)");
assert(!sitemap.includes("\uFEFF"), "sitemap.xml: BOM UTF-8 non consentito");

const pageLocs = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
for (const loc of pageLocs) {
  assert(loc.startsWith("https://"), `sitemap.xml: loc non HTTPS: ${loc}`);
  assert(!loc.includes("#"), `sitemap.xml: fragment non consentito: ${loc}`);
  assert(!loc.startsWith("https://www."), `sitemap.xml: host non canonico www: ${loc}`);
}
assert(
  JSON.stringify(pageLocs) === JSON.stringify(sitemapCanonicals),
  "sitemap.xml: URL pagina non allineati alle canoniche SITEMAP_PAGES"
);
assert(
  htmlCanonicals.every((url) => pageLocs.includes(url)),
  "sitemap.xml: pagine HTML canoniche assenti"
);
assert(
  LEGAL_PAGE_ROUTES.every((legal) => !pageLocs.includes(legal.canonical)),
  "sitemap.xml: le pagine legali non devono comparire in sitemap"
);
assert(
  pageLocs.includes(`${SITE_ORIGIN}/assets/pdf/mini-guida-oli-comeleapi.pdf`),
  "sitemap.xml: PDF guida pubblica assente"
);

const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
assert(lastmods.length === pageLocs.length, "sitemap.xml: ogni <url> deve avere <lastmod>");
const lastmodPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
for (const lastmod of lastmods) {
  assert(lastmodPattern.test(lastmod), `sitemap.xml: lastmod non W3C Datetime: ${lastmod}`);
  assert(!Number.isNaN(Date.parse(lastmod)), `sitemap.xml: lastmod non parseable: ${lastmod}`);
}

const imageLocs = [...sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((match) => match[1]);
assert(imageLocs.length >= 14, `sitemap.xml: image:loc insufficienti (${imageLocs.length})`);
for (const imageLoc of imageLocs) {
  assert(imageLoc.startsWith(`${SITE_ORIGIN}/`), `sitemap.xml: image non canonica: ${imageLoc}`);
  assert(!imageLoc.includes("?"), `sitemap.xml: image non deve avere query string: ${imageLoc}`);
}
assert(
  imageLocs.includes(`${SITE_ORIGIN}/assets/img/hero/hero-massaggio-professionale-comeleapi.webp`),
  "sitemap.xml: hero image mancante"
);
assert(
  imageLocs.some((url) => url.includes("/foto-prodotti/")),
  "sitemap.xml: immagini prodotto mancanti"
);

// Ogni immagine dichiarata deve essere davvero presente nella pagina che la
// dichiara: una image sitemap che elenca immagini assenti dalla pagina è un
// segnale non affidabile (Google usa la sitemap per scoprire le immagini *di
// quella* pagina). Le pagine senza immagini di contenuto non dichiarano nulla.
const distFileByLoc = new Map([
  [`${SITE_ORIGIN}/`, "index.html"],
  [`${SITE_ORIGIN}/links/`, "links/index.html"],
  ...SEO_CHECK_PAGES.map((page) => [page.canonical, page.file])
]);
const urlBlocks = sitemap.match(/<url>[\s\S]*?<\/url>/g) || [];
assert(urlBlocks.length === SITEMAP_PAGES.length, "sitemap.xml: numero blocchi <url> errato");
for (const block of urlBlocks) {
  const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
  const blockImages = [...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((match) => match[1]);
  if (loc?.endsWith(".pdf")) {
    assert(!blockImages.length, `sitemap.xml: PDF non deve avere image: ${loc}`);
    continue;
  }
  if (!blockImages.length) continue;
  // Tag rimossi da Google a maggio 2022: non devono tornare.
  assert(!block.includes("<image:title>"), `sitemap.xml: image:title deprecato presente per ${loc}`);
  assert(!block.includes("<image:caption>"), `sitemap.xml: image:caption deprecato presente per ${loc}`);
  assert(!block.includes("<image:license>"), `sitemap.xml: image:license deprecato presente per ${loc}`);
  const distFile = distFileByLoc.get(loc);
  assert(distFile, `sitemap.xml: pagina con immagini non mappata su dist: ${loc}`);
  const pageHtml = await readFile(path.join(DIST, distFile), "utf8");
  for (const imageLoc of blockImages) {
    const assetPath = imageLoc.slice(`${SITE_ORIGIN}/`.length);
    assert(
      pageHtml.includes(assetPath) || pageHtml.includes(assetPath.replace(/^assets\//, "../assets/")),
      `sitemap.xml: immagine dichiarata ma assente da ${distFile}: ${imageLoc}`
    );
  }
}

// lastmod e dateModified devono raccontare la stessa storia: entrambi derivano
// dall'hash del contenuto (scripts/content-freshness.mjs).
const lastmodByLoc = new Map(
  urlBlocks.map((block) => [
    block.match(/<loc>([^<]+)<\/loc>/)?.[1],
    block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]
  ])
);
for (const page of pages) {
  const html = await readFile(path.join(DIST, page.file), "utf8");
  const schema = JSON.parse(
    html.match(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/i)[1]
  );
  const pageNode = schema["@graph"].find((node) => node["@id"] === page.schemaId);
  assert(pageNode.dateModified, `${page.file}: dateModified mancante nel nodo WebPage`);
  assert(
    pageNode.dateModified === lastmodByLoc.get(page.canonical),
    `${page.file}: dateModified (${pageNode.dateModified}) diverso dal lastmod in sitemap`
  );
}

// Il manifest delle date deve coprire ogni URL canonica, altrimenti la build
// ricadrebbe silenziosamente sull'orario di build.
const lastmodManifest = JSON.parse(
  await readFile(path.join(ROOT, LASTMOD_MANIFEST_FILE), "utf8")
);
for (const loc of sitemapCanonicals) {
  assert(lastmodManifest[loc]?.lastmod, `${LASTMOD_MANIFEST_FILE}: voce mancante per ${loc}`);
}

function parseRobots(source) {
  const groups = [];
  let agents = [];
  let rules = [];

  const flush = () => {
    if (agents.length) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s*#.*$/, "").trim();
    if (!line) {
      if (agents.length && rules.length) flush();
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (directive === "user-agent") {
      if (agents.length && rules.length) flush();
      agents.push(value.toLowerCase());
    } else if (agents.length) {
      rules.push({ directive, value });
    }
  }
  flush();
  return groups;
}

const robots = await readFile(path.join(DIST, "robots.txt"), "utf8");
const robotsGroups = parseRobots(robots);
const explicitlyAllowedAgents = [
  "googlebot",
  "googlebot-image",
  "googlebot-video",
  "googlebot-news",
  "googleother",
  "googleother-image",
  "googleother-video",
  "bingbot",
  "google-extended",
  "google-cloudvertexbot",
  "oai-searchbot",
  "gptbot",
  "oai-adsbot",
  "chatgpt-user",
  "claude-searchbot",
  "claude-user",
  "claudebot",
  "anthropic-ai",
  "perplexitybot",
  "perplexity-user",
  "applebot",
  "applebot-extended",
  "ccbot",
  "*"
];

for (const agent of explicitlyAllowedAgents) {
  const groups = robotsGroups.filter((group) => group.agents.includes(agent));
  assert(groups.length === 1, `robots.txt: gruppo ${agent} mancante o duplicato`);
  assert(
    groups[0].rules.some((rule) => rule.directive === "allow" && rule.value === "/"),
    `robots.txt: ${agent} non consente l'intero sito pubblico`
  );
}

assert(
  !robotsGroups.some((group) => group.rules.some(
    (rule) => rule.directive === "disallow" && rule.value
  )),
  "robots.txt: trovata una regola Disallow incompatibile con la policy aperta"
);
assert(
  new RegExp(`^Sitemap:\\s+${escapeRegExp(SITE_ORIGIN)}/sitemap\\.xml\\s*$`, "im").test(robots),
  "robots.txt: dichiarazione sitemap assoluta mancante o errata"
);

// Gli header di cache/MIME sono ora nel file _headers degli static assets
// Cloudflare, generato da build-site.mjs (eseguito prima di questo check).
const headersConfig = await readFile(path.join(ROOT, "dist/_headers"), "utf8");

// Cloudflare applica tutte le regole che combaciano e unisce i valori duplicati
// con una virgola: la regola più specifica non sovrascrive la generica
// (https://developers.cloudflare.com/workers/static-assets/headers/). Un
// controllo sull'ordine testuale sarebbe quindi privo di significato: qui si
// simula il matching e si verifica che nessun percorso erediti due
// Cache-Control diversi.
function parseHeaderRules(source) {
  const rules = [];
  let current = null;
  for (const rawLine of source.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(rawLine)) {
      current = { pattern: rawLine.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      const separator = rawLine.indexOf(":");
      if (separator > 0) {
        current.headers.push({
          name: rawLine.slice(0, separator).trim().toLowerCase(),
          value: rawLine.slice(separator + 1).trim()
        });
      }
    }
  }
  return rules;
}

function patternMatches(pattern, pathname) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(pathname);
}

const headerRules = parseHeaderRules(headersConfig);
const cacheProbePaths = [
  "/assets/pdf/mini-guida-oli-comeleapi.pdf",
  "/assets/img/hero/hero-massaggio-professionale-comeleapi.webp",
  "/assets/img/signatures/sara-bordenga-signature.webp",
  "/assets/img/logo-comeleapi-1024.png",
  "/assets/img/logo-comeleapi-256.webp",
  "/assets/img/icons/icon-relax.webp",
  "/assets/css/styles.css",
  "/assets/js/app.js",
  "/assets/fonts/mulish-variable-latin.woff2",
  "/products.json",
  "/sitemap.xml",
  "/robots.txt"
];
for (const pathname of cacheProbePaths) {
  const values = headerRules
    .filter((rule) => patternMatches(rule.pattern, pathname))
    .flatMap((rule) => rule.headers.filter((header) => header.name === "cache-control"))
    .map((header) => header.value);
  assert(
    values.length === 1,
    `_headers: ${pathname} eredita ${values.length} regole Cache-Control (Cloudflare le unisce, non le sovrascrive): ${values.join(" | ")}`
  );
}

const pdfCache = headerRules
  .filter((rule) => patternMatches(rule.pattern, "/assets/pdf/mini-guida-oli-comeleapi.pdf"))
  .flatMap((rule) => rule.headers.filter((header) => header.name === "cache-control"))
  .map((header) => header.value)
  .join("");
assert(
  pdfCache === "public, max-age=0, must-revalidate",
  `_headers: il PDF canonico non deve avere cache browser immutabile (${pdfCache})`
);
assert(
  /\/sitemap\.xml\s*\n[\s\S]*?Content-Type:\s*application\/xml; charset=UTF-8/.test(headersConfig),
  "_headers: header Content-Type sitemap mancante"
);
assert(
  /\/sitemap\.xml\s*\n[\s\S]*?Cache-Control:\s*public, max-age=0, must-revalidate/.test(headersConfig),
  "_headers: header Cache-Control sitemap mancante"
);

console.log(
  `Check SEO pubblico completato: ${pages.length} pagine HTML, sitemap con ${pageLocs.length} URL ` +
    `(${imageLocs.length} immagini) e policy crawler aperta verificata.`
);
