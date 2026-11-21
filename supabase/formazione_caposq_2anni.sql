-- Già eseguito su Supabase; qui solo per archivio. Idempotente: si può rieseguire.
-- Il corso Caposquadra vale 2 anni, non 5. Catalogo a 2 anni e scadenze del registro ricalcolate.
update public.formazione_catalogo set validita_anni = 2 where codice = 'CAPOSQ';
update public.formazione_registro set scadenza = (data_corso + interval '2 years')::date
 where catalogo_id = (select id from public.formazione_catalogo where codice = 'CAPOSQ') and data_corso is not null;
