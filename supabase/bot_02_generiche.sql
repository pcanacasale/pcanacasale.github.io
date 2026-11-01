-- Segnalazioni generiche del bot: foto ricevute quando nessuna emergenza o esercitazione è IN CORSO.
-- Già applicata al database (migrazione bot_segnalazioni_generiche); qui per riferimento.
alter table evento_segnalazioni alter column evento_id drop not null;
alter table bot_attese add column if not exists generica boolean not null default false;
create index if not exists evento_segnalazioni_generiche_idx on evento_segnalazioni (creato_il desc) where evento_id is null;
