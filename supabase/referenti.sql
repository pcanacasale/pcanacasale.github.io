-- Referenti dei volontari: caposquadra referente (uno per squadra), coordinatore, segreteria.
-- Idempotente: si può rieseguire. Non cancella né modifica dati esistenti.
--
-- 1. Tabella referenti: chi è il referente per ogni ruolo. Si gestisce dall'Area Riservata
--    (permesso 'referenti', i master lo hanno di default). Le righe non si cancellano mai:
--    quando cambia il referente la vecchia riga va a attivo = false con la data "al" (storico).
--    Telefono ed email si prendono dalla scheda del volontario; i campi telefono/email/nome_libero
--    servono solo per un recapito comune (es. numero della segreteria) o per sostituire quello della scheda.
-- 2. Funzione miei_referenti(): al volontario collegato restituisce solo il caposquadra referente
--    della SUA squadra, il coordinatore e la segreteria (nome, telefono, email). Nient'altro.
-- I nomi NON stanno in questo file (repo pubblico): si inseriscono dall'Area Riservata o a mano.

-- 1. TABELLA
create table if not exists public.referenti (
  id            bigint generated always as identity primary key,
  ruolo         text not null check (ruolo in ('CAPOSQUADRA', 'COORDINATORE', 'SEGRETERIA')),
  squadra       text,
  volontario_id bigint references public.volontari(id),
  nome_libero   text,
  telefono      text,
  email         text,
  ordine        int not null default 0,
  attivo        boolean not null default true,
  dal           date not null default current_date,
  al            date,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  constraint referenti_squadra_solo_capo check ((ruolo = 'CAPOSQUADRA') = (squadra is not null)),
  constraint referenti_chi check (volontario_id is not null or nullif(trim(nome_libero), '') is not null)
);

-- un solo caposquadra referente attivo per squadra
create unique index if not exists referenti_un_capo_per_squadra
  on public.referenti (upper(squadra)) where ruolo = 'CAPOSQUADRA' and attivo;

-- niente doppioni della stessa persona nello stesso ruolo
create unique index if not exists referenti_no_doppioni
  on public.referenti (ruolo, coalesce(upper(squadra), ''), volontario_id) where attivo and volontario_id is not null;

alter table public.referenti enable row level security;

drop policy if exists lettura on public.referenti;
create policy lettura on public.referenti for select to authenticated
  using ((select public.ho_permesso('referenti')));

drop policy if exists inserimento on public.referenti;
create policy inserimento on public.referenti for insert to authenticated
  with check ((select public.ho_permesso('referenti')));

drop policy if exists modifica on public.referenti;
create policy modifica on public.referenti for update to authenticated
  using ((select public.ho_permesso('referenti')))
  with check ((select public.ho_permesso('referenti')));
-- nessuna policy di delete: i referenti si disattivano

grant select, insert, update on public.referenti to authenticated;
revoke all on public.referenti from anon;

-- 2. I MIEI REFERENTI (per la scheda personale)
create or replace function public.miei_referenti()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me  bigint := public.mio_volontario_id();
  sq  text;
begin
  if me is null then
    return '[]'::jsonb;
  end if;
  select upper(trim(squadra)) into sq from volontari where id = me;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'ruolo',    r.ruolo,
             'squadra',  r.squadra,
             'nome',     coalesce(nullif(trim(r.nome_libero), ''), initcap(trim(coalesce(v.nome, '') || ' ' || coalesce(v.cognome, '')))),
             'telefono', coalesce(nullif(trim(r.telefono), ''), v.telefono),
             'email',    coalesce(nullif(trim(r.email), ''), v.email))
           order by case r.ruolo when 'CAPOSQUADRA' then 1 when 'COORDINATORE' then 2 else 3 end, r.ordine, r.id)
      from referenti r
      left join volontari v on v.id = r.volontario_id
     where r.attivo
       and (r.volontario_id is null or v.stato is distinct from 'DIMESSO')
       and (r.ruolo <> 'CAPOSQUADRA' or upper(trim(r.squadra)) = sq)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.miei_referenti() from public, anon;
grant execute on function public.miei_referenti() to authenticated;
