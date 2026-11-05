-- Visite mediche: Esito visita e Data di scadenza della visita (pagina Amministrazione → Visite mediche).
-- Idempotente: si può rieseguire. Non tocca i dati esistenti.
alter table public.volontari add column if not exists esito_visita text;
alter table public.volontari add column if not exists scadenza_visita date;

alter table public.volontari drop constraint if exists volontari_esito_visita_check;
alter table public.volontari add constraint volontari_esito_visita_check
  check (esito_visita is null or esito_visita in ('IDONEO', 'IDONEO_LIMITAZIONI', 'IDONEO_PRESCRIZIONI', 'INIDONEO'));

comment on column public.volontari.esito_visita is 'Esito visita medica: IDONEO, IDONEO_LIMITAZIONI, IDONEO_PRESCRIZIONI, INIDONEO';
comment on column public.volontari.scadenza_visita is 'Scadenza della visita medica (facoltativa)';
