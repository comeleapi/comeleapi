/**
 * Data di ultima modifica reale di ogni URL canonica.
 *
 * Perché non i mtime del filesystem: la build di produzione gira su Workers
 * Builds a partire da un clone git fresco, dove il mtime di ogni file è
 * l'istante del checkout. Usandoli, `<lastmod>` diventerebbe l'orario di build
 * per tutte le URL a ogni deploy — esattamente il segnale che Google dichiara
 * di ignorare quando non è costantemente accurato
 * (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
 *
 * Qui la data cambia solo quando cambia davvero il contenuto della pagina:
 * per ogni URL si calcola l'hash del contenuto canonico e lo si confronta con
 * il manifest versionato in `sitemap-lastmod.json`. Hash invariato ⇒ data
 * invariata; hash diverso (o URL nuova) ⇒ data della build corrente.
 *
 * Lo stesso valore alimenta `<lastmod>` nella sitemap e `dateModified` nei nodi
 * WebPage dei dati strutturati: un unico segnale di freschezza, coerente tra
 * sitemap, HTML e agenti AI.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export const LASTMOD_MANIFEST_FILE = "sitemap-lastmod.json";

/** Placeholder sostituito dopo il calcolo dell'hash (evita la dipendenza circolare
 *  contenuto → dateModified → contenuto). */
export const LASTMOD_PLACEHOLDER = "__COMELEAPI_LASTMOD__";

/** Le cache key `?v=<hash>` cambiano a ogni modifica di CSS/JS: non sono
 *  contenuto della pagina e non devono spostare la data di aggiornamento. */
export function contentHash(source) {
  const normalized = String(source)
    .replace(/\?v=[A-Za-z0-9._-]+/g, "")
    .replace(new RegExp(LASTMOD_PLACEHOLDER, "g"), "");
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashBytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** W3C Datetime con offset, stabile e leggibile da Search Console. */
export function toW3cDatetime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

async function readManifest(manifestPath) {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} manifestPath percorso di sitemap-lastmod.json
 * @param {Array<{loc: string, hash: string}>} entries una voce per URL canonica
 * @param {Date} now istante della build, usato solo per le voci cambiate
 * @returns {Promise<{lastmodByLoc: Map<string, string>, changed: string[]}>}
 */
export async function resolveLastmods(manifestPath, entries, now = new Date()) {
  const previous = await readManifest(manifestPath);
  const buildDatetime = toW3cDatetime(now);
  const lastmodByLoc = new Map();
  const next = {};
  const changed = [];

  for (const { loc, hash } of entries) {
    const stored = previous[loc];
    const unchanged = stored && stored.hash === hash && typeof stored.lastmod === "string";
    const lastmod = unchanged ? stored.lastmod : buildDatetime;
    if (!unchanged) changed.push(loc);
    lastmodByLoc.set(loc, lastmod);
    next[loc] = { hash, lastmod };
  }

  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const previousSerialized = `${JSON.stringify(previous, null, 2)}\n`;
  if (serialized !== previousSerialized) {
    await writeFile(manifestPath, serialized);
  }

  return { lastmodByLoc, changed };
}
