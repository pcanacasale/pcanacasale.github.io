-- Registro formazione: corsi e abilitazioni svolti da ogni volontario.
-- Tabella nuova, nessuna modifica alle esistenti. Eseguire una volta dall'SQL Editor di
-- Supabase, PRIMA di pubblicare la pagina Formazione. Si può rieseguire senza duplicare.
--
-- codice collega la riga ai corsi fissi della scheda volontario (4_ORE, 12_ORE, CAPOSQ,
-- DAE): registrandoli, formazione.js aggiorna i campi di volontari.
-- È vuoto per i corsi liberi e per le abilitazioni.
--
-- Il sito scrive con la chiave anonima come per volontari: i permessi sono controllati
-- solo nell'interfaccia, quindi la tabella è accessibile a chiunque abbia quella chiave.

create table if not exists public.formazione_registro (
  id            bigint generated always as identity primary key,
  volontario_id bigint not null references public.volontari(id) on delete cascade,
  tipo          text not null default 'CORSO' check (tipo in ('CORSO', 'ABILITAZIONE')),
  codice        text check (codice in ('4_ORE', '12_ORE', 'CAPOSQ', 'DAE')),
  titolo        text not null,
  origine       text check (origine in ('INTERNO', 'ESTERNO')), -- vuoto solo per i dati pregressi
  ente          text,                                           -- chi l'ha tenuto o rilasciato
  data_corso    date,                                           -- vuota solo per i dati pregressi
  scadenza      date,
  ore           numeric(6,1),
  note          text,
  creato_il     timestamptz not null default now()
);
create index if not exists formazione_registro_volontario_idx on public.formazione_registro (volontario_id);

-- Per chi ha eseguito la prima versione: i CDC sono controlli sanitari, non corsi.
-- Il loro esito resta in volontari.cdc_1_step e cdc_2_step.
delete from public.formazione_registro where codice in ('CDC_1', 'CDC_2');
alter table public.formazione_registro drop constraint if exists formazione_registro_codice_check;
alter table public.formazione_registro add constraint formazione_registro_codice_check
  check (codice in ('4_ORE', '12_ORE', 'CAPOSQ', 'DAE'));

alter table public.formazione_registro enable row level security;

drop policy if exists formazione_registro_app on public.formazione_registro;
create policy formazione_registro_app on public.formazione_registro
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.formazione_registro to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;

-- Dati pregressi: una riga senza data per ogni corso già spuntato nella scheda
insert into public.formazione_registro (volontario_id, codice, titolo, scadenza)
select v.id, c.codice, c.titolo, case when c.codice = 'DAE' then v.scad_dae end
from public.volontari v
cross join lateral (values
  ('4_ORE',  'Corso 4 ore',       v.quattro_ore),
  ('12_ORE', 'Corso 12 ore',      v.dodici_ore),
  ('CAPOSQ', 'Corso Caposquadra', v.corso_caposq),
  ('DAE',    'DAE',               v.dae)
) as c(codice, titolo, svolto)
where c.svolto is true
  and not exists (
    select 1 from public.formazione_registro r
    where r.volontario_id = v.id and r.codice = c.codice
  );
