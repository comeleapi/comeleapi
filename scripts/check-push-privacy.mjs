import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const pushSource = await readFile(path.resolve(SCRIPT_DIR, "..", "src/worker/push.mjs"), "utf8");

for (const helper of [
  "normalizePushSubscription",
  "loadPushSubscriptions",
  "removePushSubscriptions",
  "sendPushToAll"
]) {
  if (!pushSource.includes(helper)) {
    throw new Error(`Helper push mancante: ${helper}`);
  }
}

// La pulizia deve rimuovere solo gli endpoint 404/410 dello snapshot inviato.
if (!pushSource.includes("statusCode === 404 || statusCode === 410") || !pushSource.includes("removePushSubscriptions(env, staleEndpoints)")) {
  throw new Error("La pulizia push deve rimuovere solo gli endpoint 404/410 dello snapshot inviato.");
}

const functionStart = pushSource.indexOf("export async function notifyNewLead");
if (functionStart < 0) {
  throw new Error("Funzione notifyNewLead non trovata.");
}
const notificationSource = pushSource.slice(functionStart);

if (!notificationSource.startsWith("export async function notifyNewLead(env)")) {
  throw new Error("notifyNewLead deve ricevere solo env, mai dati personali del lead.");
}
if (/\blead\s*\./i.test(notificationSource)) {
  throw new Error("La notifica push non deve leggere campi del lead.");
}
if (!notificationSource.includes("Apri il gestionale autenticato per visualizzare i dettagli.")) {
  throw new Error("La notifica push deve rimandare al gestionale senza mostrare dettagli personali.");
}

console.log("Check privacy push completato: nessun dato del lead nel payload.");
