-- Bot Telegram: registrazione interventi da messaggio (staff con la spunta "bot_interventi").
-- La conversazione con l'assistente resta qui finché non si preme Salva o Annulla
-- (scade dopo 30 minuti senza risposta). La scrive e la legge solo la Edge Function
-- bot-telegram con la service role: nessuna regola per anon e authenticated.
--
-- Idempotente: si può rieseguire. Non modifica e non cancella nessun dato esistente.

create table if not exists public.bot_conversazioni (
  chat_id        bigint primary key,
  volontario_id  bigint not null references public.volontari(id),
  messaggi       jsonb not null default '[]'::jsonb,   -- conversazione con l'assistente (formato messages di Anthropic)
  bozza          jsonb,                                -- ultimo riepilogo proposto, in attesa di Salva
  aggiornato_il  timestamptz not null default now()
);

alter table public.bot_conversazioni enable row level security;
revoke all on public.bot_conversazioni from anon, authenticated;

-- Controllo:
-- select relrowsecurity from pg_class where oid = 'public.bot_conversazioni'::regclass;
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'bot_conversazioni' and grantee in ('anon','authenticated');   -- nessuna riga
