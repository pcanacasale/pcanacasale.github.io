-- Generatore convocazioni: liste destinatari e storico. Solo tabelle e funzioni nuove,
-- nessuna modifica alle esistenti. Eseguire una volta dall'SQL Editor di Supabase;
-- si può rieseguire.
--
-- Il sito non usa l'autenticazione di Supabase: ogni richiesta arriva con la stessa
-- chiave anonima, quindi una policy RLS non può sapere chi sta chiedendo. Per questo RLS è
-- attiva SENZA policy (la chiave anonima non legge né scrive nulla) e si passa solo dalle
-- funzioni qui sotto, che ricontrollano ogni volta le credenziali:
--   conv_api       -> utenti dell'area riservata, secondo i permessi
--   conv_mie_liste -> volontario: sola lettura delle liste di cui fa parte
--
-- Permessi, con la stessa regola di hasPerm() (master sì salvo permesso tolto,
-- standard solo se concesso, volontari mai):
--   convocazioni           -> vede convocazioni e liste
--   convocazioni_gestione  -> crea convocazioni e gestisce le liste (richiede anche l'altra)

create table if not exists public.liste_convocazioni (
  id        bigint generated always as identity primary key,
  nome      text not null,
  creata_da text,                                   -- nome dell'utente al momento della creazione
  creata_il timestamptz not null default now()
);

create table if not exists public.liste_convocazioni_membri (
  id            bigint generated always as identity primary key,
  lista_id      bigint not null references public.liste_convocazioni(id) on delete cascade,
  volontario_id bigint references public.volontari(id) on delete cascade, -- vuoto per gli esterni
  nome          text,                                                     -- solo esterni
  email         text,                                                     -- solo esterni
  check (volontario_id is not null or nome is not null)
);
create index if not exists liste_conv_membri_lista_idx on public.liste_convocazioni_membri (lista_id);
create index if not exists liste_conv_membri_vol_idx on public.liste_convocazioni_membri (volontario_id);
create unique index if not exists liste_conv_membri_unico_idx
  on public.liste_convocazioni_membri (lista_id, volontario_id) where volontario_id is not null;

create table if not exists public.convocazioni (
  id        bigint generated always as identity primary key,
  dati      jsonb not null,                                                   -- campi del form
  lista_id  bigint references public.liste_convocazioni(id) on delete set null,
  creata_da text,
  creata_il timestamptz not null default now()
);
create index if not exists convocazioni_data_idx on public.convocazioni (creata_il desc);

alter table public.liste_convocazioni enable row level security;
alter table public.liste_convocazioni_membri enable row level security;
alter table public.convocazioni enable row level security;
revoke all on public.liste_convocazioni, public.liste_convocazioni_membri, public.convocazioni from anon, authenticated;

-- 0 nessun accesso, 1 vede, 2 crea e gestisce. Non esposta: la usa solo conv_api.
create or replace function public.conv_livello(p_username text, p_password text, out livello int, out nome text)
language plpgsql stable security definer set search_path = public as $$
declare
  u record;
  v jsonb;
  g jsonb;
begin
  livello := 0;
  select * into u from public.utenti
    where username = p_username and password = p_password and attivo = true limit 1;
  if not found or u.tipo_accesso = 'volontario' then return; end if;
  nome := u.nome;
  v := u.permessi -> 'convocazioni';
  g := u.permessi -> 'convocazioni_gestione';
  if v = 'false'::jsonb then return; end if;
  if u.tipo_accesso <> 'master' and v is distinct from 'true'::jsonb then return; end if;
  livello := 1;
  if g = 'false'::jsonb then return; end if;
  if u.tipo_accesso = 'master' or g = 'true'::jsonb then livello := 2; end if;
end $$;
revoke all on function public.conv_livello(text, text) from public, anon, authenticated;

create or replace function public.conv_api(p_username text, p_password text, p_azione text, p_dati jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u record;
  nuovo bigint;
  esito bigint;
begin
  select * into u from public.conv_livello(p_username, p_password);
  if u.livello < 1 then return jsonb_build_object('errore', 'non_autorizzato'); end if;

  -- lettura
  if p_azione = 'liste' then
    return jsonb_build_object('livello', u.livello, 'liste', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'creata_da', l.creata_da, 'membri', coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', m.id, 'volontario_id', m.volontario_id,
              'nome', coalesce(trim(v.cognome || ' ' || v.nome), m.nome),
              'email', coalesce(nullif(trim(v.email), ''), m.email))
            order by coalesce(v.cognome, m.nome), v.nome)
          from public.liste_convocazioni_membri m
          left join public.volontari v on v.id = m.volontario_id
          where m.lista_id = l.id), '[]'::jsonb)) order by l.nome)
      from public.liste_convocazioni l), '[]'::jsonb));
  elsif p_azione = 'convocazioni' then
    return jsonb_build_object('convocazioni', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.creata_il desc)
      from (select id, dati, lista_id, creata_da, creata_il from public.convocazioni
            order by creata_il desc limit 50) r), '[]'::jsonb));
  end if;

  -- scrittura
  if u.livello < 2 then return jsonb_build_object('errore', 'non_autorizzato'); end if;

  if p_azione = 'lista_salva' then
    if coalesce(trim(p_dati->>'nome'), '') = '' then return jsonb_build_object('errore', 'dati_mancanti'); end if;
    if p_dati ? 'id' then
      update public.liste_convocazioni set nome = trim(p_dati->>'nome') where id = (p_dati->>'id')::bigint;
      return jsonb_build_object('id', (p_dati->>'id')::bigint);
    end if;
    insert into public.liste_convocazioni (nome, creata_da) values (trim(p_dati->>'nome'), u.nome) returning id into nuovo;
    return jsonb_build_object('id', nuovo);
  elsif p_azione = 'lista_elimina' then
    delete from public.liste_convocazioni where id = (p_dati->>'id')::bigint;
    return jsonb_build_object('ok', true);
  elsif p_azione = 'membro_aggiungi' then
    if nullif(p_dati->>'volontario_id', '') is not null then
      insert into public.liste_convocazioni_membri (lista_id, volontario_id)
        values ((p_dati->>'lista_id')::bigint, (p_dati->>'volontario_id')::bigint)
        on conflict do nothing;
    elsif coalesce(trim(p_dati->>'nome'), '') <> '' then
      insert into public.liste_convocazioni_membri (lista_id, nome, email)
        values ((p_dati->>'lista_id')::bigint, trim(p_dati->>'nome'), nullif(trim(p_dati->>'email'), ''));
    else
      return jsonb_build_object('errore', 'dati_mancanti');
    end if;
    return jsonb_build_object('ok', true);
  elsif p_azione = 'membro_togli' then
    delete from public.liste_convocazioni_membri where id = (p_dati->>'id')::bigint;
    return jsonb_build_object('ok', true);
  elsif p_azione = 'conv_salva' then
    if jsonb_typeof(p_dati->'dati') is distinct from 'object' then return jsonb_build_object('errore', 'dati_mancanti'); end if;
    if nullif(p_dati->>'id', '') is not null then
      update public.convocazioni
        set dati = p_dati->'dati', lista_id = nullif(p_dati->>'lista_id', '')::bigint
        where id = (p_dati->>'id')::bigint returning id into esito;
      if esito is not null then return jsonb_build_object('id', esito); end if;
    end if;
    insert into public.convocazioni (dati, lista_id, creata_da)
      values (p_dati->'dati', nullif(p_dati->>'lista_id', '')::bigint, u.nome) returning id into nuovo;
    return jsonb_build_object('id', nuovo);
  elsif p_azione = 'conv_elimina' then
    delete from public.convocazioni where id = (p_dati->>'id')::bigint;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('errore', 'azione_sconosciuta');
end $$;

-- Volontario: stesse credenziali del login. Vede nomi di liste e membri, mai le email.
create or replace function public.conv_mie_liste(p_cf text, p_data_nascita date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  vol bigint;
begin
  select id into vol from public.volontari
    where upper(codice_fiscale) = upper(p_cf) and data_nascita = p_data_nascita
      and coalesce(stato, 'ATTIVO') <> 'DIMESSO'
    limit 1;
  if vol is null then return jsonb_build_object('errore', 'non_autorizzato'); end if;
  return jsonb_build_object('liste', coalesce((
    select jsonb_agg(jsonb_build_object('nome', l.nome, 'membri', (
        select jsonb_agg(coalesce(trim(v.cognome || ' ' || v.nome), m.nome) order by coalesce(v.cognome, m.nome), v.nome)
        from public.liste_convocazioni_membri m
        left join public.volontari v on v.id = m.volontario_id
        where m.lista_id = l.id)) order by l.nome)
    from public.liste_convocazioni l
    where exists (select 1 from public.liste_convocazioni_membri x where x.lista_id = l.id and x.volontario_id = vol)
  ), '[]'::jsonb));
end $$;

revoke all on function public.conv_api(text, text, text, jsonb) from public;
revoke all on function public.conv_mie_liste(text, date) from public;
grant execute on function public.conv_api(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.conv_mie_liste(text, date) to anon, authenticated;
