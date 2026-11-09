-- Registro formazione: collegamento ai file dell'archivio Google Drive.
-- Il pulsante "Importa da Drive" della pagina Formazione (Edge Function archivio-volontario,
-- azione importa) scrive qui l'id del file da cui ha preso data e scadenza:
-- rilanciando l'import, i file già importati si saltano e nulla si duplica.
-- Nessun dato cancellato o modificato. Si può rieseguire.

alter table public.formazione_registro add column if not exists drive_file_id text;

create unique index if not exists formazione_registro_drive_file_idx
  on public.formazione_registro (drive_file_id)
  where drive_file_id is not null;

comment on column public.formazione_registro.drive_file_id is
  'Id del file Google Drive (cartella Attestati del volontario) da cui viene la riga; vuoto per le righe inserite a mano.';
