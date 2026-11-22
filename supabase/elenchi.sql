-- Pagina Elenchi (Amministrazione): permesso 'elenchi'.
-- Idempotente: si può rieseguire. Non cancella né modifica dati esistenti.
--
-- 1. Tabella elenchi_salvati: gli elenchi salvati con nome (solo la definizione: filtri e colonne,
--    mai i dati dei volontari). Non si cancellano: "Elimina" mette attivo = false.
-- 2. Funzione elenchi_extra(): dati che la pagina non può leggere direttamente dalle tabelle
--    - collegati al bot Telegram (sì/no), con il permesso 'elenchi'
--    - taglie DPI, solo con il permesso 'aggiornamento_dati' (come nella scheda volontario)

-- 1. ELENCHI SALVATI
create table if not exists public.elenchi_salvati (
  id            bigint generated always as identity primary key,
  nome          text not null,
  argomento     text not null check (argomento in ('volontari', 'mezzi', 'dotazioni')),
  definizione   jsonb not null default '{}'::jsonb,
  attivo        boolean not null default true,
  creato_da     bigint,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

alter table public.elenchi_salvati enable row level security;

drop policy if exists lettura on public.elenchi_salvati;
create policy lettura on public.elenchi_salvati for select to authenticated
  using ((select ho_permesso('elenchi')));

drop policy if exists inserimento on public.elenchi_salvati;
create policy inserimento on public.elenchi_salvati for insert to authenticated
  with check ((select ho_permesso('elenchi')));

drop policy if exists modifica on public.elenchi_salvati;
create policy modifica on public.elenchi_salvati for update to authenticated
  using ((select ho_permesso('elenchi')))
  with check ((select ho_permesso('elenchi')));
-- nessuna policy di delete: gli elenchi si disattivano

grant select, insert, update on public.elenchi_salvati to authenticated;
revoke all on public.elenchi_salvati from anon;

-- 2. DATI EXTRA PER GLI ELENCHI DEI VOLONTARI
create or replace function public.elenchi_extra()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb := '{}'::jsonb;
begin
  if not ho_permesso('elenchi') then
    raise exception 'permesso negato';
  end if;

  r := r || jsonb_build_object('telegram',
    coalesce((select jsonb_agg(distinct volontario_id) from bot_chat where volontario_id is not null), '[]'::jsonb));

  if ho_permesso('aggiornamento_dati') then
    r := r || jsonb_build_object('taglie', coalesce((
      select jsonb_agg(jsonb_build_object(
               'v', av.volontario_id, 'capo', c.nome, 'cat', c.categoria,
               'taglia', d.taglia, 'consegnato', d.consegnato))
        from agg_dpi_volontario d
        join agg_volontari av on av.id = d.volontario_id
        join agg_dpi_catalogo c on c.id = d.dpi_id
       where av.volontario_id is not null), '[]'::jsonb));
  end if;

  return r;
end;
$$;

revoke all on function public.elenchi_extra() from public, anon;
grant execute on function public.elenchi_extra() to authenticated;
