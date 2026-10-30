-- Stato allerta in Home: ultimo bollettino ARPA Piemonte letto dalla Edge Function
-- allerta-arpa. Una sola riga (id = 1). Tabella nuova, nessuna modifica alle esistenti.
-- Eseguire una volta dall'SQL Editor di Supabase, PRIMA del deploy della function.

create table if not exists public.allerta_cache (
  id                  smallint primary key default 1 check (id = 1),
  zona                text,
  numero_bollettino   text,
  emesso_il           timestamptz,
  valido_dal          timestamptz,
  valido_al           timestamptz,
  evento              text,        -- livello del bollettino per la zona, come scritto da ARPA
  effetti             text,        -- "EFFETTI SUL TERRITORIO", testo integrale
  rischi              jsonb,       -- { idrogeologico: { g0, g1 }, idraulico, temporali, neve }
  aggiornato_il       timestamptz, -- ultima lettura riuscita
  ultimo_tentativo_il timestamptz, -- ultima lettura tentata, riuscita o no
  ultimo_errore       text
);

alter table public.allerta_cache enable row level security;

-- Dato pubblico: tutti leggono. Scrive solo la function con la service role key.
drop policy if exists allerta_cache_lettura on public.allerta_cache;
create policy allerta_cache_lettura on public.allerta_cache
  for select to anon, authenticated using (true);

grant select on public.allerta_cache to anon, authenticated;
