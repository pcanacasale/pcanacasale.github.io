-- Visite mediche: campo Note per ogni volontario (pagina Amministrazione → Visite mediche).
-- Idempotente: si può rieseguire. Non tocca i dati esistenti.
alter table public.volontari add column if not exists note_visita text;
comment on column public.volontari.note_visita is 'Note sulla visita medica (pagina Visite mediche)';
