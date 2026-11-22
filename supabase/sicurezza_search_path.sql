-- Fissa il search_path delle funzioni di servizio segnalate dal Security Advisor
-- ("Function Search Path Mutable"). Nessuna cambia comportamento: usano già nomi
-- completi (public.…, storage.…) o solo funzioni di base.
--
-- Idempotente: si può rieseguire; salta le funzioni che non esistono.
-- Non modifica e non cancella nessun dato.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.update_updated_at()',
    'public.pdf_touch()',
    'public._almeno_un_master()',
    'public._chiudi_tabella(text)',
    'public._regole_staff(text,text[],text[])',
    'public._regole_bucket(text,text[],text[])',
    'public.ripristina_regole(text)',
    'public.formazione_norm(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = public, pg_temp', f);
    else
      raise notice 'Funzione non trovata, saltata: %', f;
    end if;
  end loop;
end $$;

-- Controllo (deve dare 8 righe, tutte con search_path=public, pg_temp):
-- select p.oid::regprocedure, p.proconfig
--   from pg_proc p
--  where p.pronamespace = 'public'::regnamespace
--    and p.proname in ('update_updated_at','pdf_touch','_almeno_un_master','_chiudi_tabella',
--                      '_regole_staff','_regole_bucket','ripristina_regole','formazione_norm');
