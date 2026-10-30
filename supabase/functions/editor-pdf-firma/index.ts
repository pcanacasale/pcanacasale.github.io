// Supabase Edge Function: editor-pdf-firma
//
// Unico punto di accesso alle tabelle pdf_* e ai bucket privati pdf-modelli e
// pdf-documenti (RLS senza policy: la chiave anonima non legge nulla). Tutto ciò che
// si modifica nel PDF resta nel browser: qui arrivano solo i modelli salvati e i PDF
// mandati in firma.
//
// Azioni pubbliche, con token monouso (pagina firma.html):
//   apri, firma
// Azioni riservate, con { username, password } come agg-api: la regola è quella di
// hasPerm() per il permesso editor_pdf, riverificata qui a ogni chiamata.
//   crea, revoca,
//   documento_nuovo, documento_conferma, documenti_lista, documento_url,
//   documento_annulla, documento_elimina,
//   modello_nuovo, modelli_lista, modello_url, modello_salva, modello_elimina
//
// Deploy senza verifica JWT: config.toml -> [functions.editor-pdf-firma] verify_jwt = false
// Secret facoltativo: PUBLIC_SITE_URL (predefinito https://pcanacasale.com).
// È firma elettronica semplice, non firma digitale.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { scriviFirma, verificaPdf } from "./firma-pdf.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://pcanacasale.com").replace(/\/$/, "");
const BUCKET_DOC = "pdf-documenti";
const BUCKET_MOD = "pdf-modelli";
const ORE_DEFAULT = 48;
const ORE_MAX = 168; // 7 giorni

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

// ---------- utilità ----------
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function nuovoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const adesso = () =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }).format(new Date());
function infoClient(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  return { ip, ua };
}
async function audit(r: Record<string, unknown>) {
  const { error } = await admin.from("pdf_audit").insert(r);
  if (error) console.error("audit", error);
}
async function logAttivita(u: Utente, azione: string) {
  const { error } = await admin.from("log_attivita").insert({ utente_nome: u.nome, azione });
  if (error) console.error("log", error);
}
const ampiezzaValida = (c: any) =>
  c && typeof c.id === "string" && c.id && Number(c.pagina) >= 1 &&
  [c.x, c.y, c.larghezza, c.altezza].every((n) => Number.isFinite(Number(n))) && Number(c.larghezza) > 0 && Number(c.altezza) > 0;

type Utente = { id: string; nome: string };

// Stessa regola di hasPerm(): master sì salvo permesso tolto, standard solo se concesso, volontari mai
async function utenteAutorizzato(b: any): Promise<Utente | null> {
  if (typeof b.username !== "string" || typeof b.password !== "string" || !b.username || !b.password) return null;
  const { data } = await admin.from("utenti").select("id, nome, tipo_accesso, permessi")
    .eq("username", b.username).eq("password", b.password).eq("attivo", true).limit(1);
  const u = data?.[0];
  if (!u || u.tipo_accesso === "volontario") return null;
  const p = u.permessi?.editor_pdf;
  if (p === false) return null;
  return u.tipo_accesso === "master" || p ? { id: u.id, nome: u.nome } : null;
}

type Richiesta = {
  id: string; documento_id: string; campo_id: string; firmatario_nome: string;
  scade_il: string; aperto_il: string | null; usato_il: string | null; revocato_il: string | null;
};
async function trovaRichiesta(token: unknown): Promise<{ r?: Richiesta; err?: string }> {
  if (typeof token !== "string" || token.length < 30 || token.length > 100) return { err: "non_valido" };
  const { data: r } = await admin.from("pdf_firme_richieste").select("*").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!r) return { err: "non_valido" };
  if (r.revocato_il) return { err: "revocato" };
  if (r.usato_il) return { err: "usato" };
  if (new Date(r.scade_il) < new Date()) return { err: "scaduto" };
  return { r };
}

// ---------- firma a distanza ----------
async function crea(u: Utente, b: any) {
  const nome = String(b.firmatario_nome ?? "").trim();
  if (!b.documento_id || !b.campo_id || !nome) return json({ errore: "dati_mancanti" }, 400);

  const { data: doc } = await admin.from("pdf_documenti")
    .select("id, stato, campi, firme_completate, pdf_path").eq("id", b.documento_id).maybeSingle();
  if (!doc) return json({ errore: "documento_non_trovato" }, 404);
  if (doc.stato !== "in_firma") return json({ errore: "documento_chiuso" }, 409);
  if (!doc.pdf_path) return json({ errore: "pdf_mancante" }, 409);
  if (!(doc.campi ?? []).some((c: any) => c.id === b.campo_id)) return json({ errore: "campo_non_valido" }, 400);
  if ((doc.firme_completate ?? []).includes(b.campo_id)) return json({ errore: "campo_gia_firmato" }, 409);

  const ora = new Date().toISOString();
  // un solo link attivo per campo: i precedenti vengono revocati
  await admin.from("pdf_firme_richieste").update({ revocato_il: ora, revocato_da: u.id })
    .eq("documento_id", doc.id).eq("campo_id", b.campo_id).is("usato_il", null).is("revocato_il", null);

  const token = nuovoToken();
  const ore = Math.min(Math.max(Number(b.ore_validita) || ORE_DEFAULT, 1), ORE_MAX);
  const scade = new Date(Date.now() + ore * 3600_000).toISOString();

  const { data: ric, error } = await admin.from("pdf_firme_richieste").insert({
    documento_id: doc.id, campo_id: b.campo_id, firmatario_nome: nome,
    firmatario_contatto: b.firmatario_contatto ?? null,
    token_hash: await sha256Hex(token), scade_il: scade, creato_da: u.id,
  }).select("id").single();
  if (error) { console.error(error); return json({ errore: "errore_interno" }, 500); }

  await audit({ documento_id: doc.id, evento: "link_creato", campo_id: b.campo_id, attore: u.nome, utente_id: u.id,
    dettagli: { richiesta_id: ric.id, firmatario: nome, scade_il: scade } });
  return json({ richiesta_id: ric.id, link: `${SITE}/firma.html?t=${token}`, scade_il: scade });
}

async function revoca(u: Utente, b: any) {
  const { data: r } = await admin.from("pdf_firme_richieste")
    .update({ revocato_il: new Date().toISOString(), revocato_da: u.id })
    .eq("id", b.richiesta_id).is("usato_il", null).is("revocato_il", null)
    .select("id, documento_id, campo_id").maybeSingle();
  if (!r) return json({ errore: "non_revocabile" }, 409);
  await audit({ documento_id: r.documento_id, evento: "link_revocato", campo_id: r.campo_id, attore: u.nome, utente_id: u.id,
    dettagli: { richiesta_id: r.id } });
  return json({ ok: true });
}

async function apri(req: Request, b: any) {
  const t = await trovaRichiesta(b.token);
  if (t.err) return json({ errore: t.err }, 410);
  const r = t.r!;
  const { data: doc } = await admin.from("pdf_documenti")
    .select("id, titolo, stato, pdf_path, campi").eq("id", r.documento_id).single();
  if (!doc || doc.stato !== "in_firma" || !doc.pdf_path) return json({ errore: "revocato" }, 410);

  const campo = (doc.campi ?? []).find((c: any) => c.id === r.campo_id);
  const { data: url } = await admin.storage.from(BUCKET_DOC).createSignedUrl(doc.pdf_path, 600);
  const { ip, ua } = infoClient(req);
  if (!r.aperto_il) await admin.from("pdf_firme_richieste").update({ aperto_il: new Date().toISOString() }).eq("id", r.id);
  await audit({ documento_id: doc.id, evento: "link_aperto", campo_id: r.campo_id, attore: r.firmatario_nome, ip, user_agent: ua });

  return json({
    titolo: doc.titolo, firmatario_nome: r.firmatario_nome, scade_il: r.scade_il, pdf_url: url?.signedUrl,
    campo: campo && { nome: campo.nome, pagina: campo.pagina, x: campo.x, y: campo.y, larghezza: campo.larghezza, altezza: campo.altezza },
  });
}

async function firma(req: Request, b: any) {
  if (b.consenso !== true) return json({ errore: "consenso_mancante" }, 400);
  const png64 = b.firma_png;
  if (typeof png64 !== "string" || !png64.startsWith("data:image/png;base64,") || png64.length > 700_000)
    return json({ errore: "firma_non_valida" }, 400);

  const t = await trovaRichiesta(b.token);
  if (t.err) return json({ errore: t.err }, 410);
  const r = t.r!;
  const { ip, ua } = infoClient(req);

  // prenotazione atomica del token: se due richieste arrivano insieme ne passa una sola
  const { data: lock } = await admin.from("pdf_firme_richieste")
    .update({ usato_il: new Date().toISOString(), ip, user_agent: ua })
    .eq("id", r.id).is("usato_il", null).is("revocato_il", null).gt("scade_il", new Date().toISOString())
    .select("id").maybeSingle();
  if (!lock) return json({ errore: "usato" }, 410);

  try {
    const png = Uint8Array.from(atob(png64.split(",")[1]), (c) => c.charCodeAt(0));

    // fino a 3 tentativi se un'altra firma sullo stesso documento arriva in contemporanea
    for (let tentativo = 0; tentativo < 3; tentativo++) {
      const { data: doc } = await admin.from("pdf_documenti").select("*").eq("id", r.documento_id).single();
      if (!doc || doc.stato !== "in_firma") throw new Error("documento_chiuso");
      const campo = (doc.campi ?? []).find((c: any) => c.id === r.campo_id);
      if (!campo) throw new Error("campo_non_trovato");

      const { data: file, error: dlErr } = await admin.storage.from(BUCKET_DOC).download(doc.pdf_path);
      if (dlErr || !file) throw dlErr ?? new Error("pdf_non_trovato");

      const bytes = await scriviFirma(new Uint8Array(await file.arrayBuffer()), campo, png,
        `Firmato elettronicamente da ${r.firmatario_nome} il ${adesso()}`);
      const hash = await sha256Hex(bytes);
      const versione = (doc.versione_pdf ?? 0) + 1;
      const path = `${doc.id}/v${versione}.pdf`;

      const up = await admin.storage.from(BUCKET_DOC).upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (up.error) {
        if (/exist|duplicate/i.test(up.error.message)) continue; // qualcun altro ha già creato vN: riprovo sulla nuova
        throw up.error;
      }

      const firme = [...new Set([...(doc.firme_completate ?? []), campo.id])];
      const obbligatorie = (doc.campi ?? []).filter((c: any) => c.obbligatorio !== false).map((c: any) => c.id);
      const completo = obbligatorie.every((id: string) => firme.includes(id));
      const ora = new Date().toISOString();

      const { data: ok } = await admin.from("pdf_documenti").update({
        pdf_path: path, versione_pdf: versione, sha256: hash, firme_completate: firme,
        stato: completo ? "firmato" : "in_firma", firmato_il: completo ? ora : null,
      }).eq("id", doc.id).eq("versione_pdf", doc.versione_pdf ?? 0).select("id").maybeSingle();
      if (!ok) continue; // conflitto: il file vN resta come storico, riprovo

      await audit({ documento_id: doc.id, evento: "firma_link", campo_id: campo.id, attore: r.firmatario_nome,
        ip, user_agent: ua, sha256: hash, dettagli: { richiesta_id: r.id, versione } });
      if (completo) await audit({ documento_id: doc.id, evento: "completato", sha256: hash, dettagli: { versione } });

      return json({ ok: true, sha256: hash, completo });
    }
    throw new Error("conflitto_ripetuto");
  } catch (e) {
    console.error("firma", e);
    // libero il token così il firmatario può riprovare
    await admin.from("pdf_firme_richieste").update({ usato_il: null, ip: null, user_agent: null }).eq("id", r.id);
    const msg = e instanceof Error ? e.message : "";
    if (msg === "documento_chiuso") return json({ errore: "revocato" }, 410);
    return json({ errore: "errore_interno" }, 500);
  }
}

// ---------- PDF mandati in firma ----------
// Il browser carica il file direttamente con un link temporaneo: passando di qui
// un PDF da 20 MB supererebbe i limiti della function.
async function documentoNuovo(u: Utente, b: any) {
  const titolo = String(b.titolo ?? "").trim().slice(0, 200);
  const campi = Array.isArray(b.campi) ? b.campi : [];
  if (!titolo || !campi.length || !campi.every(ampiezzaValida)) return json({ errore: "dati_mancanti" }, 400);

  const { data: doc, error } = await admin.from("pdf_documenti")
    .insert({ titolo, campi, creato_da: u.id, creato_da_nome: u.nome }).select("id").single();
  if (error) { console.error(error); return json({ errore: "errore_interno" }, 500); }
  const { data: up, error: upErr } = await admin.storage.from(BUCKET_DOC).createSignedUploadUrl(`${doc.id}/v1.pdf`);
  if (upErr) { console.error(upErr); return json({ errore: "errore_interno" }, 500); }
  return json({ documento_id: doc.id, upload_url: up.signedUrl });
}

async function documentoConferma(u: Utente, b: any) {
  const { data: doc } = await admin.from("pdf_documenti").select("id, titolo, pdf_path").eq("id", b.documento_id).maybeSingle();
  if (!doc) return json({ errore: "documento_non_trovato" }, 404);
  if (doc.pdf_path) return json({ errore: "documento_chiuso" }, 409);
  const path = `${doc.id}/v1.pdf`;
  const { data: file, error } = await admin.storage.from(BUCKET_DOC).download(path);
  if (error || !file) return json({ errore: "pdf_mancante" }, 409);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { await verificaPdf(bytes); } catch { return json({ errore: "pdf_mancante" }, 409); }
  const hash = await sha256Hex(bytes);
  await admin.from("pdf_documenti").update({ pdf_path: path, versione_pdf: 1, sha256: hash }).eq("id", doc.id);
  await audit({ documento_id: doc.id, evento: "creato", attore: u.nome, utente_id: u.id, sha256: hash });
  await logAttivita(u, "ha mandato in firma il PDF: " + doc.titolo);
  return json({ ok: true, sha256: hash });
}

async function documentiLista() {
  const { data, error } = await admin.from("pdf_documenti")
    .select("id, titolo, stato, campi, firme_completate, sha256, creato_da_nome, creato_il, firmato_il, annullato_il, motivo_annullo")
    .not("pdf_path", "is", null).order("creato_il", { ascending: false });
  if (error) { console.error(error); return json({ errore: "errore_interno" }, 500); }
  const ids = (data ?? []).map((d: any) => d.id);
  const { data: richieste } = ids.length
    ? await admin.from("pdf_firme_richieste")
      .select("id, documento_id, campo_id, firmatario_nome, scade_il, aperto_il, usato_il, revocato_il").in("documento_id", ids)
    : { data: [] };
  return json({ documenti: data ?? [], richieste: richieste ?? [] });
}

async function documentoUrl(b: any) {
  const { data: doc } = await admin.from("pdf_documenti").select("titolo, pdf_path").eq("id", b.documento_id).maybeSingle();
  if (!doc?.pdf_path) return json({ errore: "documento_non_trovato" }, 404);
  const nome = doc.titolo.replace(/[^\w.\- ]/g, "_") + ".pdf";
  const { data } = await admin.storage.from(BUCKET_DOC).createSignedUrl(doc.pdf_path, 300, b.scarica ? { download: nome } : undefined);
  return json({ url: data?.signedUrl });
}

async function documentoAnnulla(u: Utente, b: any) {
  const motivo = String(b.motivo ?? "").trim();
  if (!motivo) return json({ errore: "dati_mancanti" }, 400);
  const ora = new Date().toISOString();
  const { data: doc } = await admin.from("pdf_documenti")
    .update({ stato: "annullato", annullato_il: ora, annullato_da: u.id, motivo_annullo: motivo })
    .eq("id", b.documento_id).eq("stato", "in_firma").select("id, titolo").maybeSingle();
  if (!doc) return json({ errore: "documento_chiuso" }, 409);
  await admin.from("pdf_firme_richieste").update({ revocato_il: ora, revocato_da: u.id })
    .eq("documento_id", doc.id).is("usato_il", null).is("revocato_il", null);
  await audit({ documento_id: doc.id, evento: "annullato", attore: u.nome, utente_id: u.id, dettagli: { motivo } });
  await logAttivita(u, "ha annullato il PDF in firma: " + doc.titolo);
  return json({ ok: true });
}

// Toglie riga, link e tutti i file; in pdf_audit restano chi, quando, motivo, titolo, stato,
// impronta e firmatari. Per un PDF già firmato il motivo è obbligatorio.
async function documentoElimina(u: Utente, b: any) {
  const { data: doc } = await admin.from("pdf_documenti").select("id, titolo, stato, sha256").eq("id", b.documento_id).maybeSingle();
  if (!doc) return json({ errore: "documento_non_trovato" }, 404);
  const motivo = String(b.motivo ?? "").trim();
  if (doc.stato === "firmato" && !motivo) return json({ errore: "dati_mancanti" }, 400);

  const { data: richieste } = await admin.from("pdf_firme_richieste").select("firmatario_nome").eq("documento_id", doc.id);
  const { data: files } = await admin.storage.from(BUCKET_DOC).list(doc.id, { limit: 1000 });
  if (files?.length) {
    const { error } = await admin.storage.from(BUCKET_DOC).remove(files.map((f: any) => `${doc.id}/${f.name}`));
    if (error) { console.error(error); return json({ errore: "errore_interno" }, 500); }
  }
  await audit({ documento_id: doc.id, evento: "documento_eliminato", attore: u.nome, utente_id: u.id, sha256: doc.sha256,
    dettagli: { titolo: doc.titolo, stato: doc.stato, motivo: motivo || null, firmatari: (richieste ?? []).map((r: any) => r.firmatario_nome) } });
  await admin.from("pdf_firme_richieste").delete().eq("documento_id", doc.id);
  await admin.from("pdf_documenti").delete().eq("id", doc.id);
  await logAttivita(u, "ha eliminato il PDF: " + doc.titolo);
  return json({ ok: true });
}

// ---------- modelli ----------
async function modelloNuovo(u: Utente, b: any) {
  const nome = String(b.nome ?? "").trim().slice(0, 200);
  if (!nome) return json({ errore: "dati_mancanti" }, 400);
  const id = crypto.randomUUID();
  const path = `${id}.pdf`;
  const { data: up, error: upErr } = await admin.storage.from(BUCKET_MOD).createSignedUploadUrl(path);
  if (upErr) { console.error(upErr); return json({ errore: "errore_interno" }, 500); }
  const { error } = await admin.from("pdf_modelli").insert({
    id, nome, pdf_path: path, pagine: b.pagine ?? [], elementi: b.elementi ?? [], creato_da: u.id, creato_da_nome: u.nome,
  });
  if (error) { console.error(error); return json({ errore: "errore_interno" }, 500); }
  await logAttivita(u, "ha salvato il modello PDF: " + nome);
  return json({ id, upload_url: up.signedUrl });
}

async function modelliLista() {
  const { data, error } = await admin.from("pdf_modelli")
    .select("id, nome, pagine, elementi, creato_da_nome, aggiornato_il").eq("attivo", true).order("nome");
  if (error) { console.error(error); return json({ errore: "errore_interno" }, 500); }
  return json({ modelli: data ?? [] });
}

async function modelloUrl(b: any) {
  const { data: m } = await admin.from("pdf_modelli").select("pdf_path").eq("id", b.id).maybeSingle();
  if (!m) return json({ errore: "documento_non_trovato" }, 404);
  const { data } = await admin.storage.from(BUCKET_MOD).createSignedUrl(m.pdf_path, 300);
  return json({ url: data?.signedUrl });
}

async function modelloSalva(u: Utente, b: any) {
  const nome = String(b.nome ?? "").trim().slice(0, 200);
  if (!nome) return json({ errore: "dati_mancanti" }, 400);
  const { data: m } = await admin.from("pdf_modelli")
    .update({ nome, pagine: b.pagine ?? [], elementi: b.elementi ?? [] }).eq("id", b.id).select("id").maybeSingle();
  if (!m) return json({ errore: "documento_non_trovato" }, 404);
  await logAttivita(u, "ha modificato il modello PDF: " + nome);
  return json({ ok: true });
}

async function modelloElimina(u: Utente, b: any) {
  const { data: m } = await admin.from("pdf_modelli").select("id, nome, pdf_path").eq("id", b.id).maybeSingle();
  if (!m) return json({ errore: "documento_non_trovato" }, 404);
  await admin.storage.from(BUCKET_MOD).remove([m.pdf_path]);
  await admin.from("pdf_modelli").delete().eq("id", m.id);
  await logAttivita(u, "ha eliminato il modello PDF: " + m.nome);
  return json({ ok: true });
}

// ---------- router ----------
const RISERVATE: Record<string, (u: Utente, b: any) => Promise<Response>> = {
  crea, revoca,
  documento_nuovo: documentoNuovo, documento_conferma: documentoConferma,
  documenti_lista: () => documentiLista(), documento_url: (_u, b) => documentoUrl(b),
  documento_annulla: documentoAnnulla, documento_elimina: documentoElimina,
  modello_nuovo: modelloNuovo, modelli_lista: () => modelliLista(), modello_url: (_u, b) => modelloUrl(b),
  modello_salva: modelloSalva, modello_elimina: modelloElimina,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ errore: "metodo_non_consentito" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ errore: "richiesta_non_valida" }, 400); }
  try {
    if (b?.azione === "apri") return await apri(req, b);
    if (b?.azione === "firma") return await firma(req, b);
    const azione = RISERVATE[b?.azione];
    if (!azione) return json({ errore: "azione_sconosciuta" }, 400);
    const u = await utenteAutorizzato(b);
    if (!u) return json({ errore: "non_autorizzato" }, 401);
    return await azione(u, b);
  } catch (e) {
    console.error(e);
    return json({ errore: "errore_interno" }, 500);
  }
});
