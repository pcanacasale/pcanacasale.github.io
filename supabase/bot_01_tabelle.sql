-- Bot Telegram per Eventi: tabelle nuove. Da far rivedere, poi eseguire una volta dall'SQL Editor
-- di Supabase, PRIMA del deploy delle Edge Function bot-telegram e bot-app. Si può rieseguire.
-- Non cancella e non modifica nulla di esistente.
--
-- Le tabelle del vecchio bot (telegram_volontari, telegram_stato, telegram_posizioni_live,
-- bot_config) restano dove sono e NON vengono usate: i collegamenti in telegram_volontari
-- nascevano da un contatto inviato al bot, senza verificare che fosse di chi lo inviava.
-- Qui un collegamento nasce solo da un link monouso generato nell'app.
--
-- Requisiti già nel database: public.ho_permesso(chiave text), public.volontari, public.eventi,
-- bucket privato "segnalazioni" (ci scrive solo la service role).

-- Chat collegate. Una per volontario e un volontario per chat.
create table if not exists public.bot_chat (
  volontario_id bigint primary key references public.volontari(id) on delete cascade,
  chat_id       bigint not null unique,
  collegato_il  timestamptz not null default now()
);

-- Link monouso: si salva solo l'hash del token, mai il token.
create table if not exists public.bot_link_token (
  id            bigint generated always as identity primary key,
  token_hash    text not null unique,
  volontario_id bigint not null references public.volontari(id) on delete cascade,
  creato_il     timestamptz not null default now(),
  creato_da     text,
  scade_il      timestamptz not null,
  usato_il      timestamptz
);
create index if not exists bot_link_token_volontario_idx on public.bot_link_token (volontario_id);

-- Foto ricevute che aspettano la posizione o la scelta dell'emergenza. Valgono 10 minuti.
create table if not exists public.bot_attese (
  id            bigint generated always as identity primary key,
  chat_id       bigint not null,
  volontario_id bigint not null references public.volontari(id) on delete cascade,
  file_id       text not null,
  didascalia    text,
  lat           double precision,
  lon           double precision,
  evento_id     bigint references public.eventi(id) on delete cascade,
  creato_il     timestamptz not null default now()
);
create index if not exists bot_attese_chat_idx on public.bot_attese (chat_id, creato_il);

-- Ultime posizioni inviate: valgono per le foto dei 10 minuti successivi.
create table if not exists public.bot_posizioni (
  id        bigint generated always as identity primary key,
  chat_id   bigint not null,
  lat       double precision not null,
  lon       double precision not null,
  creato_il timestamptz not null default now()
);
create index if not exists bot_posizioni_chat_idx on public.bot_posizioni (chat_id, creato_il);

-- Aggiornamenti già visti: Telegram ripete quelli senza risposta.
create table if not exists public.bot_update_visti (
  update_id bigint primary key,
  visto_il  timestamptz not null default now()
);

-- Registro dei messaggi massivi.
create table if not exists public.bot_invii (
  id                bigint generated always as identity primary key,
  creato_il         timestamptz not null default now(),
  concluso_il       timestamptz,
  utente            text not null,
  testo             text not null,
  destinatari       text not null,
  con_arpa          boolean not null default false,
  n_destinatari     integer not null default 0,
  consegnati        integer not null default 0,
  falliti           integer not null default 0,
  dettaglio_falliti jsonb not null default '[]'::jsonb
);
create index if not exists bot_invii_data_idx on public.bot_invii (creato_il desc);

-- Regole: tutto chiuso. Scrivono solo le Edge Function con la service role, che non è soggetta
-- a RLS. Chi ha il permesso eventi legge registro e collegamenti; token, attese e posizioni
-- non hanno nessuna regola, quindi dall'app non si leggono.
alter table public.bot_chat         enable row level security;
alter table public.bot_link_token   enable row level security;
alter table public.bot_attese       enable row level security;
alter table public.bot_posizioni    enable row level security;
alter table public.bot_update_visti enable row level security;
alter table public.bot_invii        enable row level security;

revoke all on public.bot_chat, public.bot_link_token, public.bot_attese, public.bot_posizioni,
              public.bot_update_visti, public.bot_invii from anon, public;
revoke all on public.bot_link_token, public.bot_attese, public.bot_posizioni, public.bot_update_visti from authenticated;
revoke insert, update, delete, truncate on public.bot_chat, public.bot_invii from authenticated;
grant select on public.bot_chat, public.bot_invii to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bot_chat' and policyname = 'bot_chat_lettura') then
    create policy bot_chat_lettura on public.bot_chat for select to authenticated using (coalesce(public.ho_permesso('eventi'), false));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bot_invii' and policyname = 'bot_invii_lettura') then
    create policy bot_invii_lettura on public.bot_invii for select to authenticated using (coalesce(public.ho_permesso('eventi'), false));
  end if;
end $$;
