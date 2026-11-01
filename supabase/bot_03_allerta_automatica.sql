-- Già applicata al database; qui per riferimento.
alter table bot_avvisi_stato add column if not exists valore text;
-- pg_cron: alle 12:10, 12:40, 13:10 e 13:40 UTC (circa 14:10-15:40, ora legale e solare) chiama la Edge Function bot-allerta (invio ai volontari collegati)
-- select cron.schedule('bot-allerta', '10,40 12,13 * * *', $$select net.http_post(url := 'https://pggtmyarpuztfewqgwyc.supabase.co/functions/v1/bot-allerta', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$$);
-- Per sospendere l'invio:  insert into bot_avvisi_stato(chiave) values ('allerta_sospesa');
-- Per riattivarlo:         delete from bot_avvisi_stato where chiave = 'allerta_sospesa';
