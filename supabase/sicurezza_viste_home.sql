-- Sicurezza delle viste della Home: volontari_pubblici e interventi_recenti.
--
-- Problema 1 (grave): le due viste appartengono a postgres e non applicano le regole RLS,
-- ma qualsiasi utente entrato nell'Area Riservata aveva anche INSERT, UPDATE e DELETE.
-- Una scrittura sulla vista passa alla tabella sotto (volontari / interventi) saltando le regole:
-- un volontario semplice poteva modificare o cancellare anagrafiche e interventi.
-- L'app le usa solo in lettura (Home, compleanni, elenco Eventi): restano solo in lettura.
--
-- Problema 2: ogni volontario entrato vedeva la data di nascita completa di tutti.
-- Per i compleanni bastano giorno e mese: chi non ha accesso ai dati dei volontari
-- ora riceve la data con l'anno fisso 2000 (età nascosta, compleanni invariati).
-- Chi ha i permessi volontari / modifica_volontari / db vede la data vera, come già nella tabella.
--
-- Idempotente: si può rieseguire. Non modifica e non cancella nessun dato.

-- 1) Solo lettura per tutti, niente accesso senza login
revoke all on public.volontari_pubblici from anon;
revoke all on public.interventi_recenti from anon;
revoke insert, update, delete, truncate, references, trigger on public.volontari_pubblici from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.interventi_recenti from authenticated;
grant select on public.volontari_pubblici to authenticated;
grant select on public.interventi_recenti to authenticated;

-- 2) Data di nascita senza anno per chi non gestisce i volontari
--    (stesse colonne, stesso tipo e stesso ordine: create or replace non rompe nulla)
create or replace view public.volontari_pubblici as
  select v.id,
         v.cognome,
         v.nome,
         case
           when (select public.ho_uno_di(array['volontari','modifica_volontari','db'])) then v.data_nascita
           when v.data_nascita is null then null
           else make_date(2000, extract(month from v.data_nascita)::int, extract(day from v.data_nascita)::int)
         end as data_nascita,
         v.squadra,
         v.foto_url,
         v.stato
    from public.volontari v
   where (select public.mio_volontario_id()) is not null;

-- create or replace view conserva i permessi, ma li ribadiamo
revoke all on public.volontari_pubblici from anon;
revoke insert, update, delete, truncate, references, trigger on public.volontari_pubblici from authenticated;
grant select on public.volontari_pubblici to authenticated;

-- Controllo (deve dare solo SELECT per authenticated e nessuna riga per anon):
-- select grantee, table_name, string_agg(privilege_type, ',')
--   from information_schema.role_table_grants
--  where table_name in ('volontari_pubblici','interventi_recenti') and grantee in ('anon','authenticated')
--  group by 1, 2;
