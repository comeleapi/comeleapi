import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FAQ_DEFINITIONS } from "./structured-data.mjs";
import { escapeHtml } from "./html-inject.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DIST = path.join(ROOT, "dist");
const SITE_URL = "https://comeleapi.it/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function typesOf(node) {
  return Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]].filter(Boolean);
}

function parseStructuredData(html, file) {
  const matches = [...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  assert(matches.length === 1, `${file}: atteso un solo blocco JSON-LD`);
  const parsed = JSON.parse(matches[0][1]);
  assert(parsed["@context"] === "https://schema.org", `${file}: @context non valido`);
  assert(Array.isArray(parsed["@graph"]), `${file}: @graph mancante`);
  return parsed;
}

function collectIdReferences(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (typeof value["@id"] === "string") output.push(value["@id"]);
  if (Array.isArray(value)) {
    value.forEach((item) => collectIdReferences(item, output));
  } else {
    Object.values(value).forEach((item) => collectIdReferences(item, output));
  }
  return output;
}

function priceToDecimal(value) {
  return Number(
    String(value || "")
      .replace(/\s/g, "")
      .replace(/€/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
  ).toFixed(2);
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function listTextFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listTextFiles(file));
    else if (/\.(?:html|css|js|json|xml|txt)$/i.test(entry.name)) output.push(file);
  }
  return output;
}

const homeHtml = await readFile(path.join(DIST, "index.html"), "utf8");
const linksHtml = await readFile(path.join(DIST, "links/index.html"), "utf8");
const products = JSON.parse(await readFile(path.join(ROOT, "products.json"), "utf8"))
  .filter((product) => product.visible !== false)
  .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
const homeSchema = parseStructuredData(homeHtml, "index.html");
const linksSchema = parseStructuredData(linksHtml, "links/index.html");
const graph = homeSchema["@graph"];
const ids = graph.map((node) => node["@id"]);

assert(ids.every(Boolean), "JSON-LD homepage: ogni nodo deve avere @id");
assert(new Set(ids).size === ids.length, "JSON-LD homepage: @id duplicati");
const byId = new Map(graph.map((node) => [node["@id"], node]));
for (const id of collectIdReferences(graph)) {
  if (id.startsWith(SITE_URL) && id.includes("#")) {
    assert(byId.has(id), `JSON-LD homepage: riferimento interno non risolto ${id}`);
  }
}

const nodesByType = (type) => graph.filter((node) => typesOf(node).includes(type));
assert(nodesByType("WebSite").length === 1, "JSON-LD: WebSite mancante o duplicato");
assert(nodesByType("WebPage").length === 1, "JSON-LD: WebPage mancante o duplicato");
// Due Organization attese: comeleapi e Young Living (venditore reale dei kit).
assert(nodesByType("Organization").length === 2, "JSON-LD: attese Organization comeleapi + Young Living");
// LocalBusiness richiede `address` (proprietà obbligatoria per Google) e
// comeleapi non ha sede aperta al pubblico: il tipo non deve tornare.
assert(nodesByType("LocalBusiness").length === 0, "JSON-LD: LocalBusiness richiede address, non usarlo");
assert(nodesByType("Person").length === 1, "JSON-LD: Person mancante o duplicata");
assert(nodesByType("Service").length === 7, "JSON-LD: attesi 7 Service");
assert(nodesByType("OfferCatalog").length === 1, "JSON-LD: OfferCatalog mancante");
assert(nodesByType("ItemList").length === 1, "JSON-LD: ItemList prodotti mancante");
assert(nodesByType("Product").length === products.length, "JSON-LD: numero Product non coerente");
assert(nodesByType("DigitalDocument").length === 1, "JSON-LD: DigitalDocument mancante");
assert(nodesByType("ContactPoint").length === 1, "JSON-LD: ContactPoint mancante");
assert(nodesByType("EducationalOccupationalCredential").length === 0, "JSON-LD: credenziale non visibile pubblicata");
assert(nodesByType("Audience").length === 0, "JSON-LD: Audience non documentata presente");
assert(nodesByType("BreadcrumbList").length === 0, "JSON-LD: breadcrumb non visibile presente");
// Le FAQ vivono nella pagina dedicata /faq/: la home non deve pubblicare
// FAQPage (Google richiede che lo schema coincida con il contenuto visibile).
assert(nodesByType("FAQPage").length === 0, "JSON-LD: FAQPage deve vivere solo su /faq/");

const organization = byId.get(`${SITE_URL}#organization`);
assert(typesOf(organization).includes("Organization"), "Organization: tipo mancante");
assert(!typesOf(organization).includes("LocalBusiness"), "Organization: LocalBusiness senza address non ammesso");
// `publicAccess` è proprietà di Place: senza LocalBusiness non è nel dominio
// del nodo. L'assenza di sede resta dichiarata in description e nelle FAQ.
assert(!Object.hasOwn(organization, "publicAccess"), "Organization: publicAccess è proprietà di Place");
assert(
  /senza studio né sede aperta al pubblico/.test(organization.description || ""),
  "Organization: la description deve dichiarare l'assenza di sede aperta al pubblico"
);
assert(organization.founder?.["@id"] === `${SITE_URL}#sara-bordenga`, "Organization: founder non collegata");
assert(organization.hasOfferCatalog?.["@id"] === `${SITE_URL}#services`, "Organization: catalogo servizi non collegato");

const forbiddenLocationKeys = new Set(["address", "streetAddress", "geo", "latitude", "longitude"]);
function assertNoPrivateLocation(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach(assertNoPrivateLocation);
  for (const [key, child] of Object.entries(value)) {
    assert(!forbiddenLocationKeys.has(key), `JSON-LD: proprieta privata vietata ${key}`);
    assertNoPrivateLocation(child);
  }
}
assertNoPrivateLocation(homeSchema);

const expectedAreas = ["Bresso", "Cusano Milanino", "Cormano", "Cinisello Balsamo", "Sesto San Giovanni", "Milano"];
const areaNames = nodesByType("City").map((node) => node.name);
assert(JSON.stringify(areaNames) === JSON.stringify(expectedAreas), "JSON-LD: aree servite non coerenti");

// Le card della home sono link verso /servizi/<slug>/: nome, prezzo e
// destinazione devono restare allineati ai nodi Service del grafo.
const serviceCardMatches = [
  ...homeHtml.matchAll(
    /<a\s+class="service-card service-card--link[^"]*"[^>]*href="\/servizi\/([a-z0-9-]+)\/"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g
  )
];
const serviceNamesInHtml = serviceCardMatches.map((match) => match[2].trim());
const serviceSlugsInHtml = serviceCardMatches.map((match) => match[1]);
const services = nodesByType("Service");
assert(
  JSON.stringify(services.map((service) => service["@id"])) ===
    JSON.stringify(serviceSlugsInHtml.map((slug) => `${SITE_URL}#service-${slug}`)),
  "index.html: le card servizio devono linkare la pagina del Service corrispondente"
);
assert(
  JSON.stringify(services.map((service) => service.name)) === JSON.stringify(serviceNamesInHtml),
  "JSON-LD: nomi Service non allineati alle card"
);

// Tutti e sette i trattamenti espongono un prezzo visibile in pagina
// (card home, pagine /servizi/*, FAQ): ognuno deve avere l'Offer corrispondente,
// così il listino è leggibile anche dai motori e dagli agenti AI.
const expectedServiceOffers = new Map([
  ["Massaggio sportivo", "50.00"],
  ["Massaggio decontratturante", "50.00"],
  ["Massaggio relax", "40.00"],
  ["Massaggio drenante", "50.00"],
  ["Trattamento Mirato 30 minuti", "30.00"],
  ["Kinesio taping", "10.00"],
  ["Massaggio con oli essenziali", "70.00"]
]);
const serviceCatalog = nodesByType("OfferCatalog")[0];
assert(serviceCatalog.numberOfItems === expectedServiceOffers.size, "JSON-LD: numero offerte nel catalogo servizi errato");
assert(
  serviceCatalog.itemListElement.every((item) => byId.get(item?.["@id"])?.["@type"] === "Offer"),
  "JSON-LD: OfferCatalog deve contenere soltanto Offer documentate"
);
for (const service of services) {
  const expectedPrice = expectedServiceOffers.get(service.name);
  if (!expectedPrice) {
    assert(!service.offers, `JSON-LD: Offer ambiguo pubblicato per ${service.name}`);
    continue;
  }
  const offer = byId.get(service.offers?.["@id"]);
  assert(offer?.["@type"] === "Offer", `JSON-LD: Offer servizio mancante per ${service.name}`);
  assert(offer.price === expectedPrice && offer.priceCurrency === "EUR", `JSON-LD: prezzo servizio errato per ${service.name}`);
  assert(offer.itemOffered?.["@id"] === service["@id"], `JSON-LD: itemOffered servizio errato per ${service.name}`);
}

const homePage = byId.get(`${SITE_URL}#webpage`);
// Unica rappresentazione indicizzabile: italiano. La resa inglese di app.js è
// una comodità di runtime per le persone (i crawler ricevono sempre italiano,
// vedi la guardia in assets/js/app.js) e non ha URL né hreflang propri.
assert(homePage.inLanguage === "it-IT", "JSON-LD: la pagina indicizzabile è in italiano");
const homepageAboutIds = new Set((homePage.about || []).map((item) => item?.["@id"]));
for (const service of services) {
  assert(homepageAboutIds.has(service["@id"]), `JSON-LD: Service non collegato alla pagina ${service.name}`);
}

const itemList = byId.get(`${SITE_URL}#products`);
assert(itemList.numberOfItems === products.length, "JSON-LD: numberOfItems prodotti errato");
assert(itemList.itemListElement.length === products.length, "JSON-LD: itemListElement prodotti errato");

for (const [index, product] of products.entries()) {
  const slug = String(product.id).replace(/^p-/, "");
  const productNode = byId.get(`${SITE_URL}#product-${slug}`);
  const listItem = byId.get(`${SITE_URL}#list-item-${slug}`);
  const offer = byId.get(`${SITE_URL}#offer-product-${slug}`);
  const imageUrl = new URL(product.image, SITE_URL).href;
  const productUrl = new URL(product.link, SITE_URL).href;

  assert(productNode?.name === product.name, `JSON-LD: nome Product errato per ${product.id}`);
  assert(productNode.image === imageUrl, `JSON-LD: immagine Product errata per ${product.id}`);
  assert(productNode.url === productUrl, `JSON-LD: URL Product errato per ${product.id}`);
  assert(productNode.brand?.["@id"] === `${SITE_URL}#young-living-brand`, `JSON-LD: brand Product errato per ${product.id}`);
  assert(!Object.hasOwn(productNode, "manufacturer"), `JSON-LD: manufacturer non confermato per ${product.id}`);
  assert(productNode.offers?.["@id"] === offer?.["@id"], `JSON-LD: Offer Product non collegata per ${product.id}`);

  assert(listItem?.position === index + 1, `JSON-LD: posizione ListItem errata per ${product.id}`);
  assert(listItem.item?.["@id"] === productNode["@id"], `JSON-LD: ListItem non collegato per ${product.id}`);
  assert(listItem.image === imageUrl && listItem.url === productUrl, `JSON-LD: ListItem incoerente per ${product.id}`);

  assert(offer?.price === priceToDecimal(product.price), `JSON-LD: prezzo Product errato per ${product.id}`);
  assert(offer.priceCurrency === "EUR", `JSON-LD: valuta Product errata per ${product.id}`);
  assert(offer.url === productUrl, `JSON-LD: URL Offer errato per ${product.id}`);
  assert(offer.itemOffered?.["@id"] === productNode["@id"], `JSON-LD: itemOffered Product errato per ${product.id}`);
  // Il venditore dev'essere Young Living: mai comeleapi, che non vende né spedisce.
  assert(
    offer.seller?.["@id"] === `${SITE_URL}#young-living`,
    `JSON-LD: il venditore del prodotto deve essere Young Living (${product.id})`
  );

  const sourceImage = path.join(ROOT, product.image.split("?", 1)[0]);
  const builtImage = path.join(DIST, product.image.split("?", 1)[0]);
  assert((await stat(sourceImage)).isFile() && (await stat(builtImage)).isFile(), `Immagine Product mancante per ${product.id}`);
  assert(await sha256(sourceImage) === await sha256(builtImage), `Immagine Product modificata dalla build per ${product.id}`);
}

const forbiddenOptionalProperties = [
  "sku",
  "gtin",
  "availability",
  "itemCondition",
  "priceValidUntil",
  "shippingDetails",
  "hasMerchantReturnPolicy",
  "review",
  "aggregateRating"
];
const serializedHomeSchema = JSON.stringify(homeSchema);
for (const property of forbiddenOptionalProperties) {
  assert(!serializedHomeSchema.includes(`"${property}"`), `JSON-LD: proprieta non verificata ${property}`);
}
assert(!serializedHomeSchema.includes("Diploma di Massaggiatrice 2017"), "JSON-LD: vecchia qualifica 2017 presente");
assert(!serializedHomeSchema.includes("Aromaterapia e Oli Essenziali 2019"), "JSON-LD: vecchia qualifica 2019 presente");
assert(!serializedHomeSchema.includes("Riflessologia Plantare 2020"), "JSON-LD: vecchia qualifica 2020 presente");
assert(!serializedHomeSchema.includes("HACCP e Sicurezza 2024"), "JSON-LD: vecchia qualifica 2024 presente");
assert(!serializedHomeSchema.includes('"hasCredential"'), "JSON-LD: hasCredential non visibile presente");
// knowsAbout è ammesso solo per competenze con riscontro visibile in pagina:
// i sette trattamenti nelle card di /#servizi e le tre voci di formazione
// mostrate nel blocco "THE FOUNDER". Qualsiasi altra voce è un claim non verificato.
const allowedKnowsAbout = new Set([
  ...services.map((service) => service.name),
  "Aromaterapia",
  "Oli essenziali Young Living",
  "Igiene e sicurezza nei trattamenti a domicilio"
]);
const person = byId.get(`${SITE_URL}#sara-bordenga`);
for (const topic of person.knowsAbout || []) {
  assert(allowedKnowsAbout.has(topic), `JSON-LD: competenza senza riscontro visibile: ${topic}`);
}
for (const label of ["Diploma professionale", "Aromaterapia", "Igiene e sicurezza"]) {
  assert(homeHtml.includes(label), `index.html: formazione dichiarata ma non visibile: ${label}`);
}
assert(!serializedHomeSchema.includes("Massaggio sportivo di 2° livello"), "JSON-LD: dettaglio credenziale non visibile presente");

const digitalDocument = nodesByType("DigitalDocument")[0];
assert(
  digitalDocument.author?.["@id"] === `${SITE_URL}#organization`,
  "JSON-LD: la guida non deve avere un'autorialita personale non confermata"
);
assert(
  digitalDocument.publisher?.["@id"] === `${SITE_URL}#organization`,
  "JSON-LD: publisher corporate della guida mancante"
);

const sourcePdf = path.join(ROOT, "assets/pdf/mini-guida-oli-comeleapi.pdf");
const builtPdf = path.join(DIST, "assets/pdf/mini-guida-oli-comeleapi.pdf");
assert(await sha256(sourcePdf) === await sha256(builtPdf), "PDF modificato durante la build");

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
    const digest = createHash("sha256").update(tokens.slice(index, index + 4).join(" ")).digest("hex");
    if (digest === forbiddenLocationDigest) return true;
  }
  return false;
}
for (const file of await listTextFiles(DIST)) {
  const source = await readFile(file, "utf8");
  assert(!containsForbiddenLocation(source), `Dato privato presente nell'output: ${path.relative(DIST, file)}`);
  assert(!/(?:SUPABASE_SERVICE_KEY|SESSION_SECRET|ADMIN_PASSWORD)\s*=/i.test(source), `Possibile secret nel bundle: ${path.relative(DIST, file)}`);
}

const linksGraph = linksSchema["@graph"];
const linksIds = new Set(linksGraph.map((node) => node["@id"]));
for (const id of collectIdReferences(linksGraph)) {
  if (id.startsWith(SITE_URL) && id.includes("#")) {
    assert(linksIds.has(id), `JSON-LD links: riferimento interno non risolto ${id}`);
  }
}
const linksPage = linksGraph.find((node) => node["@id"] === `${SITE_URL}links/#webpage`);
assert(linksPage?.url === `${SITE_URL}links/`, "JSON-LD links: WebPage canonica mancante");
assert(linksPage.inLanguage === "it-IT", "JSON-LD links: la pagina indicizzabile è in italiano");
const linksOrganization = linksGraph.find((node) => node["@id"] === `${SITE_URL}#organization`);
assert(linksOrganization, "JSON-LD links: entita business mancante");
assert(
  JSON.stringify(linksOrganization["@type"]) === JSON.stringify("Organization"),
  "JSON-LD links: LocalBusiness senza address non ammesso"
);
assert(
  !["email", "telephone", "founder", "areaServed", "contactPoint", "hasOfferCatalog"].some(
    (property) => Object.hasOwn(linksOrganization, property)
  ),
  "JSON-LD links: dettagli identitari non necessari presenti"
);
for (const type of ["Person", "ContactPoint", "ServiceChannel", "City", "EducationalOccupationalCredential"] ) {
  assert(!linksGraph.some((node) => typesOf(node).includes(type)), `JSON-LD links: nodo non necessario ${type}`);
}
assert(linksGraph.length === 5, "JSON-LD links: il grafo deve restare minimo e aderente alla pagina");
const linksDocument = linksGraph.find((node) => node["@type"] === "DigitalDocument");
assert(linksDocument, "JSON-LD links: DigitalDocument mancante");
assert(linksDocument.author?.["@id"] === `${SITE_URL}#organization`, "JSON-LD links: autore corporate della guida mancante");
assert(!linksGraph.some((node) => node["@type"] === "BreadcrumbList"), "JSON-LD links: breadcrumb non visibile presente");

// Pagina /faq/: il nodo FAQPage deve coincidere con FAQ_DEFINITIONS e con il
// testo visibile dell'accordion (parità schema/contenuto richiesta da Google).
const faqHtml = await readFile(path.join(DIST, "faq/index.html"), "utf8");
const faqSchema = parseStructuredData(faqHtml, "faq/index.html");
const faqPage = faqSchema["@graph"].find((node) => typesOf(node).includes("FAQPage"));
assert(faqPage, "JSON-LD faq: nodo FAQPage mancante");
assert(
  faqPage.mainEntity?.length === FAQ_DEFINITIONS.length,
  "JSON-LD faq: numero di domande non allineato a FAQ_DEFINITIONS"
);
for (const [index, item] of FAQ_DEFINITIONS.entries()) {
  const question = faqPage.mainEntity[index];
  assert(question?.name === item.q, `JSON-LD faq: domanda non allineata (${item.q})`);
  assert(question?.acceptedAnswer?.text === item.a, `JSON-LD faq: risposta non allineata (${item.q})`);
  assert(faqHtml.includes(escapeHtml(item.q)), `faq/index.html: domanda non visibile in pagina (${item.q})`);
  assert(faqHtml.includes(escapeHtml(item.a)), `faq/index.html: risposta non visibile in pagina (${item.q})`);
}
assert(
  faqSchema["@graph"].filter((node) => typesOf(node).includes("FAQPage")).length === 1,
  "JSON-LD faq: FAQPage duplicata"
);

console.log(`Check dati strutturati completato: 7 servizi e ${products.length} prodotti verificati senza dati privati.`);
