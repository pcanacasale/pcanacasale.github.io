# Guida all'Area Riservata – PC ANA Casale

Sito statico da mettere in `guida/` nel repo pcanacasale.github.io → pcanacasale.com/guida/
File: `index.html` (motore, uguale per tutte le guide), `dati.js` (impostazioni e contenuti), `icon-192.png`.
Lo script audio è lo stesso della guida del Polo (`genera-audio.mjs` con `--gemini`, voce Charon).

## Due percorsi
In `dati.js`, `GUIDA.percorsi` definisce Volontari e Staff. Ogni pagina ha `percorso:["volontari"]`,
`["staff"]` oppure entrambi (Accesso, Galleria). `ordine` stabilisce la sequenza delle pagine dello staff.

## Link utili
- Una pagina: `…/guida/#bot`, `#volontari`, `#eventi` …
- Solo alcune pagine: `?solo=benvenuto,accesso,scheda,bot` (il pulsante "Guida su misura" li crea da solo)

## Modificare i testi
Passo: `{t:"titolo", d:"testo scritto", h:"elemento della schermata", v:"testo parlato"}`.
Pagina: `intro` è il parlato iniziale. Dopo ogni modifica: `node genera-audio.mjs --gemini` (rigenera solo i cambiati).

## Video
`video:"ID_YOUTUBE"` nella pagina.
