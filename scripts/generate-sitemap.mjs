/**
 * Genera sitemap.xml conforme a protocollo sitemaps.org + estensione immagini Google.
 * Regole 2026 (SEO + GEO):
 * - solo URL canoniche assolute HTTPS, senza fragment e senza www
 * - lastmod accurato in W3C Datetime, calcolato sull'hash del contenuto e non
 *   sui mtime (vedi scripts/content-freshness.mjs): cambia solo quando cambia
 *   davvero la pagina, altrimenti Google smette di fidarsene
 * - nessuna changefreq/priority (ignorate da Google, spesso fuorvianti)
 * - image:image solo per immagini di contenuto realmente presenti nella pagina
 *   dichiarata: le icone decorative (alt="") e le immagini assenti dalla pagina
 *   non hanno valore per Google Immagini e rendono la sitemap non affidabile
 * - documenti pubblici indexabili (PDF guida) come URL a sé
 * - escape XML completo e UTF-8
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { SUBPAGE_SITEMAP_ENTRIES } from "./site-pages.mjs";

export const SITE_ORIGIN = "https://comeleapi.it";

export const SITEMAP_PAGES = [
  { loc: `${SITE_ORIGIN}/`, kind: "home" },
  { loc: `${SITE_ORIGIN}/links/`, kind: "links" },
  // Sottopagine zone/servizi/faq generate da scripts/site-pages.mjs (le pagine
  // legali restano volutamente fuori: navigabili ma noindex).
  ...SUBPAGE_SITEMAP_ENTRIES.map(({ loc, kind }) => ({ loc, kind })),
  {
    loc: `${SITE_ORIGIN}/assets/pdf/mini-guida-oli-comeleapi.pdf`,
    kind: "pdf"
  }
];

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absoluteAssetUrl(relativePath) {
  const clean = relativePath.replace(/^\.?\//, "").replace(/^\/+/, "");
  return `${SITE_ORIGIN}/${clean}`;
}

// Google supporta oggi due soli tag: <image:image> e <image:loc>. <image:title>,
// <image:caption>, <image:license> e <image:geo_location> sono stati rimossi
// dalla documentazione a maggio 2022 e non vengono più letti — il testo
// descrittivo di un'immagine va nell'attributo alt del tag <img>.
// https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
function buildImageEntries(images) {
  return images
    .filter((image) => image?.loc)
    .map((image) =>
      [
        "    <image:image>",
        `      <image:loc>${escapeXml(image.loc)}</image:loc>`,
        "    </image:image>"
      ].join("\n")
    )
    .join("\n");
}

/**
 * Immagini dichiarate per URL. Solo la home ha immagini di contenuto
 * (hero, ritratto del trattamento, firma e foto dei kit): tutte hanno un `alt`
 * descrittivo e sono presenti nell'HTML generato. Le sottopagine usano
 * esclusivamente icone decorative `alt=""` e il marchio nell'header, che non
 * sono contenuto indicizzabile: dichiararle produrrebbe rumore, e dichiarare
 * l'hero (che in quelle pagine non compare) sarebbe semplicemente falso.
 * `check-public-seo.mjs` verifica che ogni image:loc dichiarata compaia davvero
 * nell'HTML della pagina corrispondente.
 */
export async function collectSitemapImages(root) {
  const products = JSON.parse(await readFile(path.join(root, "products.json"), "utf8"));
  const visibleProducts = products
    .filter((product) => product?.visible !== false && typeof product.image === "string")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Solo immagini realmente renderizzate: `hero-massage-sara.jpg` è dentro un
  // blocco `.client-hidden` (display:none) e resta quindi fuori.
  const homeImages = [
    { loc: absoluteAssetUrl("assets/img/hero/hero-massaggio-professionale-comeleapi.webp") },
    { loc: absoluteAssetUrl("assets/img/signatures/sara-bordenga-signature.webp") },
    ...visibleProducts.map((product) => ({
      loc: absoluteAssetUrl(product.image.split("?", 1)[0])
    }))
  ];

  return { [`${SITE_ORIGIN}/`]: homeImages };
}

/**
 * @param {string} root radice del repository
 * @param {Map<string,string>} lastmodByLoc date risolte da content-freshness.mjs
 */
export async function buildSitemapXml(root, lastmodByLoc) {
  const imagesByLoc = await collectSitemapImages(root);
  const urlBlocks = [];

  for (const page of SITEMAP_PAGES) {
    const lastmod = lastmodByLoc.get(page.loc);
    if (!lastmod) throw new Error(`lastmod non risolto per ${page.loc}`);
    const imageXml = buildImageEntries(imagesByLoc[page.loc] || []);
    urlBlocks.push(
      [
        "  <url>",
        `    <loc>${escapeXml(page.loc)}</loc>`,
        `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
        imageXml,
        "  </url>"
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `${urlBlocks.join("\n")}\n` +
    `</urlset>\n`
  );
}
