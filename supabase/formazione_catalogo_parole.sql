-- Catalogo formazione: parole chiave aggiunte dopo il controllo delle cartelle Drive (novembre 2026).
--   - "capisquadra": attestati "Sicurezza capisquadra PC" / "Sensibilizzazione sicurezza capisquadra PC" = Corso Caposquadra
--   - "formazione generale": "Formazione generale salute e sicurezza volontari PC" = Corso 4 ore
-- Aggiunge solo se mancano. Si può rieseguire. Nessun dato cancellato.
-- Dopo: premere "Importa da Drive" nella pagina Formazione per collegare gli attestati.

update public.formazione_catalogo
set parole_chiave = array_append(parole_chiave, 'capisquadra')
where codice = 'CAPOSQ' and not ('capisquadra' = any(parole_chiave));

update public.formazione_catalogo
set parole_chiave = array_append(parole_chiave, 'formazione generale')
where codice = '4_ORE' and not ('formazione generale' = any(parole_chiave));
