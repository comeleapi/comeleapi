// Rotta /api/admin/uploads: upload immagini salvate come BLOB in D1 e servite
// su /uploads/:id. Parsing multipart e sniffing del tipo come in server.js.

import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, json, randomHex } from "../lib.mjs";
import { getImage, insertImage } from "../db.mjs";

function indexOfSub(haystack, needle, start = 0) {
  outer: for (let i = start; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let idx;
  while ((idx = indexOfSub(buffer, delimiter, start)) !== -1) {
    parts.push(buffer.subarray(start, idx));
    start = idx + delimiter.length;
  }
  parts.push(buffer.subarray(start));
  return parts;
}

const CRLF = new TextEncoder().encode("\r\n");
const HEADER_BREAK = new TextEncoder().encode("\r\n\r\n");
const DASH_DASH = new TextEncoder().encode("--");

function parseMultipart(buffer, boundary) {
  const delimiter = new TextEncoder().encode(`--${boundary}`);
  const decoder = new TextDecoder();
  return splitBuffer(buffer, delimiter)
    .map((part) => {
      let chunk = part;
      if (chunk.length >= 2 && bytesEqual(chunk.subarray(0, 2), CRLF)) chunk = chunk.subarray(2);
      if (chunk.length >= 2 && bytesEqual(chunk.subarray(chunk.length - 2), CRLF)) {
        chunk = chunk.subarray(0, chunk.length - 2);
      }
      if (bytesEqual(chunk, DASH_DASH) || !chunk.length) return null;
      if (chunk.length >= 2 && bytesEqual(chunk.subarray(chunk.length - 2), DASH_DASH)) {
        chunk = chunk.subarray(0, chunk.length - 2);
      }
      const headerEnd = indexOfSub(chunk, HEADER_BREAK);
      if (headerEnd < 0) return null;
      const headerText = decoder.decode(chunk.subarray(0, headerEnd));
      const content = chunk.subarray(headerEnd + HEADER_BREAK.length);
      const headers = {};
      headerText.split("\r\n").forEach((line) => {
        const idx = line.indexOf(":");
        if (idx > 0) headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
      });
      const disposition = headers["content-disposition"] || "";
      const name = disposition.match(/name="([^"]+)"/)?.[1] || "";
      const filename = disposition.match(/filename="([^"]*)"/)?.[1] || "";
      return { name, filename, contentType: headers["content-type"] || "", content };
    })
    .filter(Boolean);
}

function detectImageType(buffer, declaredType) {
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  const decoder = new TextDecoder();
  if (
    buffer.length >= 12 &&
    decoder.decode(buffer.subarray(0, 4)) === "RIFF" &&
    decoder.decode(buffer.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return UPLOAD_TYPES[declaredType] ? declaredType : "";
}

export async function handleUpload(request, env) {
  if (request.method !== "POST") return json(405, { error: "Metodo non consentito." });
  const contentType = request.headers.get("content-type") || "";
  const boundary =
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ||
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!contentType.includes("multipart/form-data") || !boundary) {
    return json(400, { error: "Upload non valido." });
  }

  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > MAX_UPLOAD_BYTES) {
    return json(400, { error: "File troppo grande. Dimensione massima: 2 MB." });
  }

  const parts = parseMultipart(raw, boundary);
  const file = parts.find((part) => part.name === "image" && part.filename && part.content.length);
  if (!file) return json(400, { error: "Seleziona un'immagine da caricare." });

  const imageType = detectImageType(file.content, file.contentType);
  const ext = UPLOAD_TYPES[imageType];
  if (!ext) {
    return json(400, { error: "Formato non supportato. Usa JPG, PNG o WebP." });
  }

  const filename = `${Date.now()}-${randomHex(10)}${ext}`;
  const bytes = file.content.slice();
  await insertImage(env, {
    id: filename,
    contentType: imageType,
    bytes,
    size: bytes.length
  });
  return json(201, { url: `/uploads/${filename}`, filename });
}

// Serving immagini caricate su /uploads/:id, con cache immutabile.
export async function handleUploadServe(request, env, ctx, id) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const row = await getImage(env, decodeURIComponent(id));
  if (!row) return new Response("Not found", { status: 404 });

  const bytes = row.bytes instanceof ArrayBuffer ? new Uint8Array(row.bytes) : row.bytes;
  const response = new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": row.content_type,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}
