-- Stato allerta in Home: lettura automatica ogni 30 minuti.
-- Eseguire una volta dall'SQL Editor, DOPO il deploy della function allerta-arpa.
-- Attiva pg_cron e pg_net se non lo sono già (le estensioni si vedono anche in
-- Database > Extensions). La function è pubblica: non serve nessuna chiave.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'allerta-arpa-30min',
  '*/30 * * * *',
  $$ select net.http_post(
       url := 'https://pggtmyarpuztfewqgwyc.supabase.co/functions/v1/allerta-arpa',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
