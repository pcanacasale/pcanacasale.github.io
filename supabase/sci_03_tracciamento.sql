-- S.C.I. fase 2: tracciamento in diretta durante un evento.
-- Già eseguito su Supabase; qui solo per archivio. Idempotente: si può rieseguire.
-- Testo ricavato dal database (novembre 2026).
-- Le righe le scrive solo il bot (Edge Function bot-telegram e bot-app, service role): nessuna
-- policy di scrittura per anon/authenticated. Le posizioni restano per sempre (mai cancellate).

-- Richiesta di posizione: una riga per evento e volontario
create table if not exists public.evento_tracciamento (
  id            bigint generated always as identity primary key,
  evento_id     bigint not null references public.eventi(id),
  volontario_id bigint not null references public.volontari(id),
  richiesto_il  timestamptz not null default now(),
  richiesto_da  text,
  iniziato_il   timestamptz,
  ultimo_il     timestamptz,
  fermato_il    timestamptz,
  fermato_da    text,
  unique (evento_id, volontario_id)
);
create index if not exists evento_tracciamento_vol_idx on public.evento_tracciamento (volontario_id) where fermato_il is null;

-- Posizioni ricevute (in diretta o singole)
create table if not exists public.evento_posizioni (
  id            bigint generated always as identity primary key,
  evento_id     bigint not null references public.eventi(id),
  volontario_id bigint not null references public.volontari(id),
  lat           double precision not null,
  lon           double precision not null,
  precisione    double precision,
  in_diretta    boolean not null default true,
  creato_il     timestamptz not null default now()
);
create index if not exists evento_posizioni_evento_idx on public.evento_posizioni (evento_id, volontario_id, creato_il);

alter table public.evento_tracciamento enable row level security;
alter table public.evento_posizioni enable row level security;

drop policy if exists lettura on public.evento_tracciamento;
create policy lettura on public.evento_tracciamento for select to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])));

drop policy if exists lettura on public.evento_posizioni;
create policy lettura on public.evento_posizioni for select to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])));
