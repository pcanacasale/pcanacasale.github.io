-- Esonero dai corsi obbligatori 12 ore e Caposquadra (novembre 2026).
-- Un volontario esonerato non risulta "mai fatto" / "scaduto" nella dashboard della pagina Formazione
-- e non compare tra i "Da sistemare" per il corso 12 ore.
-- Si imposta dalla scheda volontario (Formazione) o dalla dashboard: chi può modificare i volontari.
-- Solo colonne nuove con valore predefinito "no": nessun dato esistente cambia. Si può rieseguire.

alter table public.volontari add column if not exists esonero_12_ore boolean not null default false;
alter table public.volontari add column if not exists esonero_caposq boolean not null default false;

comment on column public.volontari.esonero_12_ore is 'Esonerato dal corso 12 ore (rischio alto): non conta tra i mancanti e gli scaduti.';
comment on column public.volontari.esonero_caposq is 'Esonerato dal corso Caposquadra: non conta tra i mancanti e gli scaduti.';
