-- Già eseguito su Supabase; qui solo per archivio. Idempotente: si può rieseguire.
-- Le foto del bucket segnalazioni si leggono anche con il solo permesso "eventi"
alter policy segnalazioni_lettura on storage.objects using (bucket_id = 'segnalazioni' and ((select ho_uno_di('{gestione_segnalazioni,sci,eventi}'::text[])) or owner = (select auth.uid())));
