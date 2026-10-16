-- Aggiornamento dati — firma per il consenso al trattamento dei dati personali.
-- La firma raccolta da aggiorna.html si salva come documento di tipo 'FIRMA'
-- in agg_documenti (PNG nel bucket privato agg-privato), con lo stesso
-- flusso degli altri file: IN_ATTESA finché il master non approva.
--
-- Se agg_documenti.tipo ha un vincolo CHECK sui valori ammessi, lo sostituisce
-- con uno che include anche 'FIRMA'. Se il vincolo non c'è, non fa nulla.
-- Eseguire una volta dall'SQL Editor di Supabase.

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
    raise notice 'rimosso vincolo %', c.conname;
  end loop;
end $$;

alter table public.agg_documenti
  add constraint agg_documenti_tipo_check
  check (tipo in ('FOTO', 'CARTA_IDENTITA', 'CODICE_FISCALE', 'PATENTE', 'ATTESTATO', 'ABILITAZIONE', 'FIRMA'));
