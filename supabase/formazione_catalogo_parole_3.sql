-- Catalogo formazione: "motoseghe" (plurale) = abilitazione Motosega e decespugliatore
-- (es. "Utilizzo motoseghe e utensili manuali da taglio"). Novembre 2026.
-- Aggiunge solo se manca. Si può rieseguire. Nessun dato cancellato.
-- Dopo: Formazione → "Importa da Drive".
update public.formazione_catalogo
set parole_chiave = array_append(parole_chiave, 'motoseghe')
where codice = 'MOTOSEGA' and not ('motoseghe' = any(parole_chiave));
