-- Editor PDF (1 di 2): tabelle. Solo tabelle nuove, nessuna modifica alle esistenti.
-- Eseguire una volta dall'SQL Editor di Supabase, prima di editor_pdf_02_storage.sql.
--
-- Il PDF si modifica nel browser e sul server arrivano soltanto:
--   pdf_modelli  -> moduli da compilare ogni volta, se l'utente sceglie di salvarli
--   pdf_documenti, pdf_firme_richieste, pdf_audit -> PDF mandati in firma con link
--
-- RLS attiva senza policy, come le tabelle agg_*: la chiave anonima non legge né
-- scrive nulla. Ogni accesso passa dalle Edge Function con la service role key, che
-- ricontrollano il permesso editor_pdf. Gli utenti sono quelli della tabella utenti:
-- *_da contiene utenti.id e *_nome il nome al momento dell'operazione.

create table if not exists public.pdf_modelli (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  pdf_path       text not null,               -- bucket pdf-modelli
  pagine         jsonb not null default '[]', -- [{ larghezza, altezza, rotazione }] in punti PDF
  elementi       jsonb not null default '[]', -- testi, date, segni, firme e campi da compilare
  attivo         boolean not null default true,
  creato_da      uuid,
  creato_da_nome text,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now()
);

create table if not exists public.pdf_documenti (
  id               uuid primary key default gen_random_uuid(),
  titolo           text not null,
  stato            text not null default 'in_firma' check (stato in ('in_firma', 'firmato', 'annullato')),
  campi            jsonb not null default '[]', -- campi firma: [{ id, nome, pagina, x, y, larghezza, altezza }]
  firme_completate jsonb not null default '[]', -- id dei campi già firmati
  pdf_path         text,                        -- versione corrente nel bucket pdf-documenti
  versione_pdf     int not null default 0,      -- blocco ottimistico per firme contemporanee
  sha256           text,                        -- impronta della versione corrente
  creato_da        uuid,
  creato_da_nome   text,
  creato_il        timestamptz not null default now(),
  aggiornato_il    timestamptz not null default now(),
  firmato_il       timestamptz,
  annullato_il     timestamptz,
  annullato_da     uuid,
  motivo_annullo   text
);
create index if not exists pdf_documenti_stato_idx on public.pdf_documenti (stato);

create table if not exists public.pdf_firme_richieste (
  id                  uuid primary key default gen_random_uuid(),
  documento_id        uuid not null references public.pdf_documenti (id),
  campo_id            text not null,
  firmatario_nome     text not null,
  firmatario_contatto text,
  token_hash          text unique not null, -- sha256 del token: il token in chiaro non si salva mai
  scade_il            timestamptz not null,
  aperto_il           timestamptz,
  usato_il            timestamptz,
  revocato_il         timestamptz,
  revocato_da         uuid,
  ip                  text,
  user_agent          text,
  creato_da           uuid,
  creato_il           timestamptz not null default now()
);
create index if not exists pdf_firme_richieste_doc_idx on public.pdf_firme_richieste (documento_id);

-- Prove della firma (chi, quando, IP, impronta): solo aggiunta, nessuna pagina la mostra in elenco
create table if not exists public.pdf_audit (
  id           bigint generated always as identity primary key,
  documento_id uuid,          -- senza vincolo: le prove restano anche se il documento viene eliminato
  evento       text not null, -- creato, link_creato, link_revocato, link_aperto, firma_link, completato, annullato
  campo_id     text,
  attore       text,          -- nome dell'utente o del firmatario
  utente_id    uuid,
  ip           text,
  user_agent   text,
  sha256       text,
  dettagli     jsonb,
  creato_il    timestamptz not null default now()
);
create index if not exists pdf_audit_doc_idx on public.pdf_audit (documento_id, creato_il);

create or replace function public.pdf_touch() returns trigger
language plpgsql as $$ begin new.aggiornato_il = now(); return new; end $$;

drop trigger if exists pdf_modelli_touch on public.pdf_modelli;
create trigger pdf_modelli_touch before update on public.pdf_modelli
  for each row execute function public.pdf_touch();
drop trigger if exists pdf_documenti_touch on public.pdf_documenti;
create trigger pdf_documenti_touch before update on public.pdf_documenti
  for each row execute function public.pdf_touch();

alter table public.pdf_modelli         enable row level security;
alter table public.pdf_documenti       enable row level security;
alter table public.pdf_firme_richieste enable row level security;
alter table public.pdf_audit           enable row level security;
