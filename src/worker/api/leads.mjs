// Rotte /api/contact (pubblica) e /api/admin/leads*. Porting della gestione
// richieste, filtri, statistiche e notifica push senza dati personali.

import {
  ClientInputError,
  cleanEmail,
  cleanMultilineText,
  cleanPhone,
  cleanText,
  json,
  nowIso,
  readBody
} from "../lib.mjs";
import { userPayload, checkContactRate } from "../auth.mjs";
import {
  deleteLead,
  insertLead,
  leadExists,
  loadLeads,
  updateLead
} from "../db.mjs";
import { notifyNewLead } from "../push.mjs";

function normalizeLead(input) {
  const timestamp = nowIso();
  return {
    id: `lead-${crypto.randomUUID()}`,
    name: cleanText(input.name, 100),
    phone: cleanPhone(input.phone),
    email: cleanEmail(input.email),
    day: cleanText(input.day, 80, false),
    slot: cleanText(input.slot, 80, false),
    message: cleanMultilineText(input.message, 1200, false),
    status: "new",
    read: false,
    source: "form-frontend",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function adminLead(lead) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    day: lead.day,
    slot: lead.slot,
    message: lead.message,
    status: lead.status,
    read: lead.read,
    source: lead.source,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

function leadStats(leads) {
  return {
    total: leads.length,
    new: leads.filter((lead) => lead.status === "new").length,
    reviewed: leads.filter((lead) => lead.status === "reviewed").length,
    archived: leads.filter((lead) => lead.status === "archived").length
  };
}

function filterLeads(leads, url) {
  const query = cleanText(url.searchParams.get("q") || "", 120, false).toLowerCase();
  const status = cleanText(url.searchParams.get("status") || "active", 20, false);
  return leads.filter((lead) => {
    const statusOk =
      status === "all" ||
      (status === "active" && lead.status !== "archived") ||
      lead.status === status;
    if (!statusOk) return false;
    if (!query) return true;
    const haystack = [lead.name, lead.email, lead.phone, lead.day, lead.slot, lead.message]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export async function handleContact(request, env, ctx) {
  if (request.method !== "POST") return json(405, { error: "Metodo non consentito." });
  if (!(await checkContactRate(env, request))) {
    return json(429, { error: "Troppe richieste ravvicinate. Riprova tra qualche minuto." });
  }
  try {
    const body = await readBody(request);
    const lead = normalizeLead(body);
    await insertLead(env, lead);
    // La notifica push non deve ritardare la risposta al visitatore.
    ctx.waitUntil(notifyNewLead(env));
    return json(201, {
      ok: true,
      message: "Richiesta ricevuta. Ti ricontatteremo al più presto.",
      id: lead.id
    });
  } catch (err) {
    if (err instanceof ClientInputError) return json(400, { error: err.message });
    console.error("[contact] errore salvataggio richiesta:", err);
    return json(500, { error: "Impossibile salvare la richiesta in questo momento." });
  }
}

// parts = ["api","admin","leads", id?]
export async function handleAdminLeads(request, env, session, url, parts) {
  if (parts.length === 3 && request.method === "GET") {
    const leads = await loadLeads(env);
    const filtered = filterLeads(leads, url);
    return json(200, {
      leads: filtered.map(adminLead),
      stats: leadStats(leads),
      ...userPayload(session)
    });
  }

  if (parts[3]) {
    const id = decodeURIComponent(parts[3]);
    if (!(await leadExists(env, id))) return json(404, { error: "Richiesta non trovata." });

    if (request.method === "PATCH") {
      const body = await readBody(request);
      const updates = { updatedAt: nowIso() };
      if (Object.prototype.hasOwnProperty.call(body, "read")) updates.read = Boolean(body.read);
      if (Object.prototype.hasOwnProperty.call(body, "status")) {
        const status = cleanText(body.status, 20);
        if (!["new", "reviewed", "archived"].includes(status)) {
          throw new ClientInputError("Stato richiesta non valido.");
        }
        updates.status = status;
        updates.read = status !== "new";
      }
      await updateLead(env, id, updates);
      const leads = await loadLeads(env);
      return json(200, {
        lead: adminLead(leads.find((lead) => lead.id === id)),
        stats: leadStats(leads)
      });
    }

    if (request.method === "DELETE") {
      await deleteLead(env, id);
      const leads = await loadLeads(env);
      return json(200, { ok: true, stats: leadStats(leads) });
    }
  }

  return json(405, { error: "Metodo non consentito." });
}
