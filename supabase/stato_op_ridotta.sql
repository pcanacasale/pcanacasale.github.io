-- Nuovo stato del volontario: OP_RIDOTTA (Operatività ridotta).
-- In forza come gli attivi: convocabile, negli eventi e nel bot Telegram; corsi e visite
-- seguono le spunte di esonero già presenti, non lo stato.
-- Idempotente: si può rieseguire. Non modifica nessun dato.

alter table public.volontari drop constraint if exists volontari_stato_check;
alter table public.volontari add constraint volontari_stato_check
  check (stato = any (array['ATTIVO'::text, 'OP_RIDOTTA'::text, 'SOSPESO'::text, 'DIMESSO'::text]));
