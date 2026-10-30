-- Editor PDF (2 di 2): bucket privati. Eseguire dopo editor_pdf_01_tabelle.sql.
-- Nessuna policy: i file si leggono e si scrivono solo dalle Edge Function, che
-- danno al browser link temporanei. Solo PDF, massimo 20 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pdf-modelli',   'pdf-modelli',   false, 20971520, array['application/pdf']),
  ('pdf-documenti', 'pdf-documenti', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
