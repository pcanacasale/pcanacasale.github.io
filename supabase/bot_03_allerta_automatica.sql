-- Già applicata al database; qui per riferimento.
alter table bot_avvisi_stato add column if not exists valore text;
-- pg_cron: ai minuti 5 e 35 chiama la Edge Function bot-allerta (invio ai volontari collegati)
-- select cron.schedule('bot-allerta', '5,35 * * * *', $$select net.http_post(url := 'https://pggtmyarpuztfewqgwyc.supabase.co/functions/v1/bot-allerta', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$$);
-- Per sospendere l'invio:  insert into bot_avvisi_stato(chiave) values ('allerta_sospesa');
-- Per riattivarlo:         delete from bot_avvisi_stato where chiave = 'allerta_sospesa';
