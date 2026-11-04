-- Aggiornamento dati — modulo cartaceo compilato e ricaricato.
-- 1) agg_documenti.tipo ammette anche 'MODULO_COMPILATO'
-- 2) registrato_il / registrato_da: il modulo resta "da registrare" finché un
--    master non lo segna fatto (agg-api → doc_registrato).
-- Idempotente: si può rieseguire. Nessun dato esistente viene toccato.
-- Eseguire dall'SQL Editor di Supabase PRIMA del deploy di agg-api.

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.agg_documenti'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.agg_documenti drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.agg_documenti
  add constraint agg_documenti_tipo_check
  check (tipo in ('FOTO', 'CARTA_IDENTITA', 'CODICE_FISCALE', 'PATENTE', 'ATTESTATO', 'ABILITAZIONE', 'FIRMA', 'MODULO_COMPILATO'));

alter table public.agg_documenti add column if not exists registrato_il timestamptz;
alter table public.agg_documenti add column if not exists registrato_da text;

-- La tabella ha già RLS attiva senza policy (accesso solo da agg-api con service role): nessuna policy nuova.
