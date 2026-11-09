-- Catalogo corsi e abilitazioni.
-- Una voce per ogni corso o abilitazione, con nome ufficiale, validità e parole chiave.
-- Ogni riga di formazione_registro si collega alla sua voce (catalogo_id): la pagina Formazione
-- raggruppa per voce e i titoli scritti in modi diversi ("Gru per autocarro tesserino",
-- "Aggiornamento gru su autocarro"…) finiscono nello stesso blocco. Il titolo originale resta.
--
-- Un automatismo (trigger) su formazione_registro, per ogni riga nuova o modificata:
--   - se manca la voce, la sceglie: dal codice dei corsi fissi, altrimenti dalle parole chiave
--     (vince la voce con "ordine" più basso); le abilitazioni non riconosciute vanno in "Da verificare";
--   - segna "aggiornamento" se il titolo contiene "aggiornamento";
--   - se manca la scadenza, la calcola: data del corso + validità della voce (se indicata).
--
-- Nessun dato cancellato: le voci non si eliminano, si disattivano (o si uniscono in un'altra).
-- Si può rieseguire: le voci iniziali si inseriscono solo se mancano (per codice).

-- 1. TABELLA
create table if not exists public.formazione_catalogo (
  id            bigint generated always as identity primary key,
  tipo          text not null default 'CORSO' check (tipo in ('CORSO', 'ABILITAZIONE')),
  codice        text unique,                          -- voci iniziali; per i corsi fissi = formazione_registro.codice
  titolo        text not null,
  validita_anni integer check (validita_anni between 1 and 50),
  parole_chiave text[] not null default '{}',         -- inizio di parola, senza maiuscole né accenti
  ordine        integer not null default 100,         -- a parità di parole, vince il più basso
  attivo        boolean not null default true,
  unita_in      bigint references public.formazione_catalogo(id),  -- voce in cui è stata unita
  creato_il     timestamptz not null default now()
);

alter table public.formazione_registro add column if not exists catalogo_id bigint references public.formazione_catalogo(id);
alter table public.formazione_registro add column if not exists aggiornamento boolean not null default false;
create index if not exists formazione_registro_catalogo_idx on public.formazione_registro (catalogo_id);

-- 2. REGOLE DI ACCESSO: tutti gli utenti collegati leggono (serve anche alla scheda personale),
--    scrive chi ha il permesso Formazione o Modifica volontari. Nessuna cancellazione.
alter table public.formazione_catalogo enable row level security;

drop policy if exists lettura on public.formazione_catalogo;
create policy lettura on public.formazione_catalogo for select to authenticated using (true);

drop policy if exists inserimento on public.formazione_catalogo;
create policy inserimento on public.formazione_catalogo for insert to authenticated
  with check ((select public.ho_uno_di(array['formazione', 'modifica_volontari'])));

drop policy if exists modifica on public.formazione_catalogo;
create policy modifica on public.formazione_catalogo for update to authenticated
  using ((select public.ho_uno_di(array['formazione', 'modifica_volontari'])))
  with check ((select public.ho_uno_di(array['formazione', 'modifica_volontari'])));

revoke all on public.formazione_catalogo from anon;
grant select, insert, update on public.formazione_catalogo to authenticated;

-- 3. RICONOSCIMENTO DAL TITOLO
create or replace function public.formazione_norm(t text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    translate(lower(coalesce(t, '')), 'àáâäèéêëìíîïòóôöùúûü''’', 'aaaaeeeeiiiioooouuuu  '),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- Voce per tipo e titolo: la prima (per ordine) con una parola chiave all'inizio di una parola del titolo
create or replace function public.formazione_voce(p_tipo text, p_titolo text)
returns bigint language sql stable set search_path = public as $$
  select c.id
  from formazione_catalogo c
  where c.attivo and c.tipo = p_tipo
    and exists (
      select 1 from unnest(c.parole_chiave) k
      where formazione_norm(k) <> ''
        and position(' ' || formazione_norm(k) in ' ' || formazione_norm(p_titolo) || ' ') > 0
    )
  order by c.ordine, c.id
  limit 1
$$;

create or replace function public.formazione_registro_catalogo()
returns trigger language plpgsql set search_path = public as $$
declare
  anni integer;
begin
  if new.catalogo_id is null and new.codice is not null then
    select id into new.catalogo_id from formazione_catalogo where codice = new.codice;
  end if;
  if new.catalogo_id is null then
    new.catalogo_id := formazione_voce(new.tipo, new.titolo);
  end if;
  if new.catalogo_id is null and new.tipo = 'ABILITAZIONE' then
    select id into new.catalogo_id from formazione_catalogo where codice = 'DA_VERIFICARE';
  end if;
  -- una voce unita in un'altra porta alla voce di arrivo
  select coalesce(c.unita_in, c.id) into new.catalogo_id from formazione_catalogo c where c.id = new.catalogo_id;
  if tg_op = 'INSERT' then
    new.aggiornamento := new.aggiornamento or formazione_norm(new.titolo) like '%aggiornament%';
  end if;
  if new.scadenza is null and new.data_corso is not null and new.catalogo_id is not null then
    select validita_anni into anni from formazione_catalogo where id = new.catalogo_id;
    if anni is not null then new.scadenza := (new.data_corso + make_interval(years => anni))::date; end if;
  end if;
  return new;
end $$;

drop trigger if exists formazione_registro_catalogo on public.formazione_registro;
create trigger formazione_registro_catalogo
  before insert or update of titolo, tipo, codice, catalogo_id, data_corso, scadenza on public.formazione_registro
  for each row execute function public.formazione_registro_catalogo();

-- 4. VOCI INIZIALI (solo se mancano)
insert into public.formazione_catalogo (codice, tipo, titolo, validita_anni, parole_chiave, ordine)
select * from (values
  ('4_ORE',         'CORSO',        'Corso 4 ore',                                            null::integer, array['4 ore', 'quattro ore', 'sensibilizzazione rischio', 'sensibilizzazione al rischio'], 10),
  ('12_ORE',        'CORSO',        'Corso 12 ore',                                           5,  array['12 ore', 'dodici ore', 'rischio alto'], 11),
  ('CAPOSQ',        'CORSO',        'Corso Caposquadra',                                      5,  array['caposquadra', 'capo squadra'], 12),
  ('DAE',           'CORSO',        'DAE',                                                    2,  array['dae', 'defibrillat', 'blsd', 'aed'], 13),
  ('TELESCOPICI',   'ABILITAZIONE', 'Carrelli a braccio telescopico',                         5,  array['braccio telescopico', 'telescopic'], 20),
  ('CARRELLI',      'ABILITAZIONE', 'Carrelli elevatori semoventi con conducente a bordo',    5,  array['carrell'], 21),
  ('PLE',           'ABILITAZIONE', 'PLE – Piattaforme di lavoro elevabili',                  5,  array['ple', 'piattaforma aerea', 'piattaforme di lavoro elevabili'], 22),
  ('GRU_AUTOCARRO', 'ABILITAZIONE', 'Gru per autocarro',                                      5,  array['gru per autocarro', 'gru su autocarro'], 23),
  ('GRU_MOBILI',    'ABILITAZIONE', 'Gru mobili autocarrate e semoventi',                     5,  array['gru mobil'], 24),
  ('GRU_TORRE',     'ABILITAZIONE', 'Gru a torre',                                            5,  array['gru a torre'], 25),
  ('TRATTORI',      'ABILITAZIONE', 'Trattori agricoli o forestali',                          5,  array['trattor'], 26),
  ('MMT',           'ABILITAZIONE', 'Macchine movimento terra',                               5,  array['macchine movimento terra', 'escavator', 'pale caricatric', 'caricatori', 'terne'], 27),
  ('MOTOSEGA',      'ABILITAZIONE', 'Motosega e decespugliatore',                             5,  array['motosega', 'decespugliat'], 28),
  ('DA_VERIFICARE', 'ABILITAZIONE', 'Da verificare',                                          null, array[]::text[], 999)
) as v(codice, tipo, titolo, validita_anni, parole_chiave, ordine)
where not exists (select 1 from public.formazione_catalogo c where c.codice = v.codice);

-- 5. COLLEGAMENTO DELLE RIGHE ESISTENTI (solo quelle senza voce; il trigger fa il resto)
update public.formazione_registro
set aggiornamento = aggiornamento or public.formazione_norm(titolo) like '%aggiornament%'
where catalogo_id is null;

update public.formazione_registro set catalogo_id = null where catalogo_id is null;  -- fa scattare il trigger
