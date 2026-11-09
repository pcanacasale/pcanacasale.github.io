-- Catalogo formazione: "Gestione situazioni di rischio" = Corso 4 ore
-- (controllo cartelle Attestati su Drive, novembre 2026: stesso corso del 1/3/2016 di "Sensibilizzazione rischio").
-- Aggiunge solo se manca. Si può rieseguire. Nessun dato cancellato.
-- Dopo: Formazione → "Importa da Drive".
update public.formazione_catalogo
set parole_chiave = array_append(parole_chiave, 'gestione situazioni di rischio')
where codice = '4_ORE' and not ('gestione situazioni di rischio' = any(parole_chiave));
