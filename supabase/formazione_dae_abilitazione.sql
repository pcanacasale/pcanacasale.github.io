-- DAE: da corso obbligatorio ad abilitazione (novembre 2026).
-- La voce DAE del catalogo diventa un'abilitazione (prima delle altre abilitazioni nell'elenco) e le righe
-- del registro collegate passano a tipo ABILITAZIONE. Il codice 'DAE' resta: serve a ricopiare esito e
-- scadenza nei campi volontari.dae e volontari.scad_dae, che non cambiano.
-- Il trigger formazione_registro_catalogo non tratta il DAE come corso fisso (sceglie la voce dal codice o
-- dalle parole chiave): non serve modificarlo. formazione_voce() cerca per tipo, quindi dopo questo
-- aggiornamento i titoli "DAE", "BLSD", "defibrillatore" si riconoscono tra le abilitazioni.
-- Nessun dato cancellato. Si può rieseguire.

update public.formazione_catalogo
set tipo = 'ABILITAZIONE', ordine = 19
where codice = 'DAE' and (tipo <> 'ABILITAZIONE' or ordine <> 19);

update public.formazione_registro
set tipo = 'ABILITAZIONE'
where tipo <> 'ABILITAZIONE'
  and (codice = 'DAE' or catalogo_id = (select id from public.formazione_catalogo where codice = 'DAE'));
