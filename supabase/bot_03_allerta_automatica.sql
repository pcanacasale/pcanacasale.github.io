-- Già applicata al database; qui per riferimento.
alter table bot_avvisi_stato add column if not exists valore text;
-- pg_cron: alle 12:10, 12:40, 13:10 e 13:40 UTC (circa 14:10-15:40, ora legale e solare) chiama la Edge Function bot-allerta (invio ai volontari collegati)
-- select cron.schedule('bot-allerta', '10,40 12,13 * * *', $$select net.http_post(url := 'https://pggtmyarpuztfewqgwyc.supabase.co/functions/v1/bot-allerta', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$$);
-- Per sospendere l'invio:  insert into bot_avvisi_stato(chiave) values ('allerta_sospesa');
-- Per riattivarlo:         delete from bot_avvisi_stato where chiave = 'allerta_sospesa';

-- Promemoria in app: mio_bot_collegato() dice a chi accede se ha collegato il bot (true/false, null senza scheda).
-- create or replace function public.mio_bot_collegato() returns boolean language sql stable security definer set search_path = public as $$
--   select case when public.mio_volontario_id() is null then null else exists (select 1 from bot_chat where volontario_id = public.mio_volontario_id()) end $$;
-- revoke all on function public.mio_bot_collegato() from public, anon; grant execute on function public.mio_bot_collegato() to authenticated;
