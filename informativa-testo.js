// informativa-testo.js — testo UNICO dell'informativa privacy per i volontari,
// usato dal modulo cartaceo PDF (modulo-cartaceo.js, area riservata) e dalla
// pagina del link personale (aggiorna.html).
//
// TESTO PROVVISORIO: va sostituito con quello definitivo dopo il parere del
// consulente privacy. Finché INFORMATIVA_DEFINITIVA è false il PDF riporta
// "BOZZA" in piè di pagina. Le parti tra [ ] sono da completare a cura della Sezione.
'use strict';

const INFORMATIVA_DEFINITIVA = false;

const INFORMATIVA_PDF = {
  titolo: 'Informativa sul trattamento dei dati personali dei volontari (artt. 13 e 14 Regolamento UE 2016/679)',
  sezioni: [
    { titolo: '1. Titolare del trattamento',
      testo: 'Titolare del trattamento è l\'Associazione Nazionale Alpini — Sezione di Casale Monferrato, per la propria Unità di Protezione Civile, con sede in [indirizzo], email [indirizzo email], telefono [numero]. Referente privacy: [nome e contatti].' },
    { titolo: '2. Dati trattati',
      testo: 'Dati anagrafici e di contatto (nome, cognome, codice fiscale, data e luogo di nascita, residenza, telefono, email); dati su titolo di studio, professione, patenti, tessera ANA; taglie e dotazioni personali (DPI); copie dei documenti di identità, del codice fiscale e della patente; attestati di formazione e abilitazioni; fotografia per il tesserino; dati sull\'idoneità alle attività (visite mediche), che rientrano tra i dati relativi alla salute; dati sulla partecipazione a esercitazioni, interventi ed eventi.' },
    { titolo: '3. Finalità e base giuridica',
      testo: 'I dati sono trattati per: gestire l\'iscrizione e l\'attività del volontario nell\'Unità di Protezione Civile; tenere gli elenchi e le comunicazioni previste dal Codice della Protezione Civile (D.Lgs. 1/2018) e dalle norme regionali; garantire la copertura assicurativa e i benefici di legge (rimborsi al datore di lavoro, permessi); gestire formazione, dotazioni e sicurezza (D.Lgs. 81/2008 per quanto applicabile); organizzare esercitazioni, emergenze ed eventi; rilasciare il tesserino di riconoscimento. La base giuridica è il rapporto associativo e di volontariato (art. 6.1.b), gli obblighi di legge (art. 6.1.c) e, per i dati relativi alla salute, l\'art. 9.2.b e 9.2.h del Regolamento. [da confermare]' },
    { titolo: '4. Conferimento dei dati',
      testo: 'Il conferimento dei dati indicati è necessario per far parte dell\'Unità di Protezione Civile e per essere attivati: senza questi dati non è possibile partecipare alle attività operative. Il consenso all\'uso delle immagini per la comunicazione (punto 8) è invece facoltativo e non incide sulla partecipazione.' },
    { titolo: '5. Modalità e sicurezza',
      testo: 'I dati sono trattati su carta e con strumenti informatici, da persone incaricate e istruite della Sezione, con misure di sicurezza adeguate: accesso riservato con credenziali personali, archivi informatici protetti, registro degli accessi, documenti cartacei custoditi in luogo chiuso.' },
    { titolo: '6. Destinatari',
      testo: 'I dati possono essere comunicati, solo per le finalità indicate, a: Regione Piemonte e Coordinamento Regionale del Volontariato di Protezione Civile; Dipartimento della Protezione Civile; Associazione Nazionale Alpini (Sede Nazionale e Coordinamento delle Sezioni Piemontesi); compagnie assicurative; autorità e enti che coordinano gli interventi (Comuni, Prefettura); fornitori di servizi informatici che agiscono come responsabili del trattamento. I dati non sono diffusi e non sono trasferiti fuori dall\'Unione Europea. [da verificare per i fornitori informatici]' },
    { titolo: '7. Conservazione',
      testo: 'I dati sono conservati per tutta la durata dell\'attività di volontariato e, dopo la cessazione, per il tempo necessario agli obblighi di legge e alla tutela dei diritti, di regola 10 anni. Le copie dei documenti scaduti o sostituiti vengono eliminate. [da confermare]' },
    { titolo: '8. Immagini',
      testo: 'Durante le attività possono essere scattate foto e riprese. Quelle necessarie a documentare gli interventi restano negli archivi interni della Sezione. La pubblicazione di immagini in cui il volontario è riconoscibile sui siti e sui canali social della Sezione avviene solo con il consenso facoltativo espresso nel modulo, revocabile in ogni momento.' },
    { titolo: '9. Diritti dell\'interessato',
      testo: 'Il volontario può chiedere in ogni momento l\'accesso ai propri dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità e opporsi al trattamento (artt. 15–22 del Regolamento), scrivendo ai contatti del Titolare. Può revocare il consenso facoltativo senza conseguenze sui trattamenti già fatti. Ha diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).' },
  ],
  dichiarazione: 'Il/La sottoscritto/a dichiara di aver ricevuto e letto l\'informativa sul trattamento dei dati personali e di aver compilato il presente modulo con dati veri e aggiornati.',
  consenso_immagini: {
    titolo: 'Consenso facoltativo — immagini sui siti e sui social',
    testo: 'Riguardo alla pubblicazione, sui siti e sui canali social della Sezione, di foto e video in cui sono riconoscibile, scattati durante le attività di protezione civile:',
  },
};

// Versione HTML per le pagine web (aggiorna.html): solo le sezioni dell'informativa.
function informativaHtml() {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return INFORMATIVA_PDF.sezioni.map(s => '<p><strong>' + esc(s.titolo) + '.</strong> ' + esc(s.testo) + '</p>').join('')
    + (INFORMATIVA_DEFINITIVA ? '' : '<p><em>Testo provvisorio, in attesa della versione definitiva.</em></p>');
}
