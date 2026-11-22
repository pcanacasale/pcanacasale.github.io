-- Fogli firma (registro presenze) di esercitazioni e corsi.
-- Il foglio si stampa dall'app (Evento o Intervento) con i nomi già scritti, si firma su carta,
-- si scansiona e si allega all'intervento (e all'evento, se c'è).
--
-- 1) Evento di tipo CORSO, collegato a una voce del catalogo Formazione
-- 2) Impostazioni del foglio (titolo, argomenti, convalide…) in eventi.foglio_firma e interventi.foglio_firma
-- 3) Tabella fogli_firma: le scansioni, una o più per giorno
-- 4) Cartella privata fogli-firma
--
-- Idempotente: si può rieseguire. Non modifica e non cancella nessun dato esistente.

-- 1) Tipo CORSO (come l'esercitazione: data di fine obbligatoria)
alter table public.eventi drop constraint if exists eventi_tipo_check;
alter table public.eventi add constraint eventi_tipo_check
  check (tipo = any (array['ESERCITAZIONE'::text, 'EMERGENZA'::text, 'CORSO'::text]));

alter table public.eventi drop constraint if exists eventi_date_check;
alter table public.eventi add constraint eventi_date_check
  check (((tipo = any (array['ESERCITAZIONE'::text, 'CORSO'::text])) and (data_fine is not null))
      or ((tipo = 'EMERGENZA'::text) and ((data_fine is not null) or (fine_finestra is not null)))) not valid;

alter table public.eventi add column if not exists catalogo_id bigint
  references public.formazione_catalogo(id) on delete set null;

-- 2) Impostazioni del foglio firma
--    { titolo, anno, argomenti, convalide: [{ruolo, nome}], righe_vuote, copertina }
alter table public.eventi     add column if not exists foglio_firma jsonb not null default '{}'::jsonb;
alter table public.interventi add column if not exists foglio_firma jsonb not null default '{}'::jsonb;

-- 3) Scansioni dei fogli firmati
create table if not exists public.fogli_firma (
  id            bigint generated always as identity primary key,
  intervento_id bigint references public.interventi(id) on delete set null,
  evento_id     bigint references public.eventi(id) on delete set null,
  giorno        date not null,
  file          text not null,          -- 'fogli-firma/<percorso>' (sbPercorso), mai un link pubblico
  nome_file     text,
  note          text,
  caricato_da   text,
  caricato_il   timestamptz not null default now()
);
create index if not exists fogli_firma_intervento_idx on public.fogli_firma (intervento_id);
create index if not exists fogli_firma_evento_idx     on public.fogli_firma (evento_id);

alter table public.fogli_firma enable row level security;
revoke all on public.fogli_firma from anon;
grant select, insert, update, delete on public.fogli_firma to authenticated;

drop policy if exists lettura      on public.fogli_firma;
drop policy if exists inserimento  on public.fogli_firma;
drop policy if exists modifica     on public.fogli_firma;
drop policy if exists eliminazione on public.fogli_firma;
create policy lettura on public.fogli_firma for select to authenticated
  using ((select public.ho_uno_di(array['interventi','eventi','volontari'])));
create policy inserimento on public.fogli_firma for insert to authenticated
  with check ((select public.ho_uno_di(array['interventi','eventi'])));
create policy modifica on public.fogli_firma for update to authenticated
  using ((select public.ho_uno_di(array['interventi','eventi'])))
  with check ((select public.ho_uno_di(array['interventi','eventi'])));
-- Eliminare un foglio firmato è un'eccezione: solo con il permesso DB
create policy eliminazione on public.fogli_firma for delete to authenticated
  using ((select public.ho_uno_di(array['db'])));

-- 4) Cartella privata: PDF e foto, massimo 20 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fogli-firma', 'fogli-firma', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "fogli-firma_lettura"      on storage.objects;
drop policy if exists "fogli-firma_inserimento"  on storage.objects;
drop policy if exists "fogli-firma_modifica"     on storage.objects;
drop policy if exists "fogli-firma_eliminazione" on storage.objects;
create policy "fogli-firma_lettura" on storage.objects for select to authenticated
  using (bucket_id = 'fogli-firma' and (select public.ho_uno_di(array['interventi','eventi','volontari'])));
create policy "fogli-firma_inserimento" on storage.objects for insert to authenticated
  with check (bucket_id = 'fogli-firma' and (select public.ho_uno_di(array['interventi','eventi'])));
create policy "fogli-firma_modifica" on storage.objects for update to authenticated
  using (bucket_id = 'fogli-firma' and (select public.ho_uno_di(array['interventi','eventi'])))
  with check (bucket_id = 'fogli-firma' and (select public.ho_uno_di(array['interventi','eventi'])));
create policy "fogli-firma_eliminazione" on storage.objects for delete to authenticated
  using (bucket_id = 'fogli-firma' and (select public.ho_uno_di(array['db'])));

-- Controllo:
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'eventi_tipo_check';
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name in ('eventi','interventi') and column_name in ('foglio_firma','catalogo_id');
-- select polname from pg_policy where polrelid = 'public.fogli_firma'::regclass;
-- select id, public from storage.buckets where id = 'fogli-firma';
