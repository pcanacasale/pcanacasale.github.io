/* =====================================================================
   GUIDA ALL'AREA RISERVATA – PC ANA Casale Monferrato
   GUIDA = impostazioni generali; PAGINE = contenuti.
   Ogni pagina: id, percorso (["volontari"], ["staff"] o entrambi), titolo,
   icona, perche, chi, video, intro (parlato), schermo, passi.
   Ogni passo: t (titolo), d (testo scritto), h (elemento indicato),
   v (testo parlato per l'audio).
   ===================================================================== */
const GUIDA = {
  titolo: "Guida all'Area Riservata",
  sottotitolo: "Protezione Civile ANA Casale Monferrato",
  nomeBreve: "Area Riservata",
  host: "pcanacasale.com",
  copertina: {
    h1: "Come si usa l'Area Riservata",
    testo: "Una pagina per ogni funzione, con la schermata, i passi da seguire e la spiegazione a voce. Scegli il tuo percorso.",
    accesso: "L'Area Riservata si apre su <b>pcanacasale.com/area-riservata.html</b>, entrando con Google o con un codice via email."
  },
  colori: { "--blu-900":"#072F63", "--blu-700":"#0A4C9E", "--blu-500":"#0A4C9E", "--segno":"#FFC20E", "--segno-testo":"#072F63" },
  percorsi: {
    volontari: { titolo:"Sono un volontario", breve:"Volontari", icona:"ti-user", nota:"Entrare, vedere la tua scheda, aggiornare i dati e usare il bot Telegram." },
    staff:     { titolo:"Gestisco l'Area Riservata", breve:"Staff", icona:"ti-users", nota:"Volontari, interventi, eventi, logistica e amministrazione.",
      ordine:["benvenuto-staff","accesso","home-staff","volontari","interventi","mezzi","dotazioni","pianicarico","tlc","postazioni","galleria","editorpdf","convocazioni","eventi","visite","formazione","aggiornamento-dati","verifica-piattaforme","statistiche","segnalazioni-staff","richieste","db","accessi","gestione-accessi","impostazioni"] }
  }
};

/* ---------- finta Area Riservata ---------- */
const MENU_STAFF = [["home","Home"],["volontari","Volontari"],["interventi","Interventi"]];
const MENU_VOL = [["home","Home"],["scheda","La mia scheda"]];
function app(attiva, titolo, corpo, vol){
  const menu = vol ? MENU_VOL : MENU_STAFF;
  return `<div class="m-app ar">
    <div class="m-top" data-h="menu">
      <span class="m-marchio"><img src="icon-192.png" alt="">PC ANA Casale</span>
      ${menu.map(([r,l]) => `<span class="m-tabtop${r===attiva?' on':''}">${l}</span>`).join("")}
      <span class="m-tabtop${attiva==='altro'?' on':''}" data-h="altro">Altro ▾</span>
      <span class="m-sp"></span><span class="m-av" data-h="utente">${vol?'MR':'LB'}</span>
    </div>
    <main class="m-main"><div class="m-titolo">${titolo}</div><div class="m-body">${corpo}</div></main>
  </div>`;
}
const btn = (txt, h, cl="") => `<span class="m-btn ${cl}"${h?` data-h="${h}"`:""}>${txt}</span>`;
const cerca = (ph, h) => `<span class="m-cerca"${h?` data-h="${h}"`:""}><i class="ti ti-search"></i>${ph}</span>`;
const sel = (txt, h) => `<span class="m-sel"${h?` data-h="${h}"`:""}>${txt} ▾</span>`;
const tabs = (arr, h) => `<div class="m-tabs"${h?` data-h="${h}"`:""}>${arr.map((t,i)=>`<span class="${i===0?'on':''}">${t}</span>`).join("")}</div>`;
const tab = (righe, h) => `<table class="m-tab"${h?` data-h="${h}"`:""}><tr>${righe[0].map(c=>`<th>${c}</th>`).join("")}</tr>${righe.slice(1).map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
const tag = (t, c) => `<span class="m-tag ${c}">${t}</span>`;
const box = (tit, righe, h) => `<div class="m-box"${h?` data-h="${h}"`:""}><div class="m-box-t">${tit}</div>${righe.map(r=>`<div class="m-riga">${r}</div>`).join("")}</div>`;
const allerta = h => `<div class="m-allerta"${h?` data-h="${h}"`:""}><b>Stato allerta</b><span>Casale Monferrato · Zona Piem-I</span>${tag("Nessuna allerta","v")}<small>Aggiornato alle 14:30</small></div>`;

const PAGINE = [
/* ======================= PERCORSO VOLONTARI ======================= */
{
  id:"benvenuto", percorso:["volontari"], titolo:"Benvenuto", icona:"ti-hand-finger",
  perche:"Cos'è l'Area Riservata per un volontario e come funziona questa guida.",
  chi:"Tutti i volontari.", video:"",
  intro:"Ciao, e benvenuto. In pochi minuti ti spiego come usare l'Area Riservata della Protezione Civile ANA di Casale Monferrato. Per un volontario sono poche cose, ma utili.",
  schermo: () => app("home","Home", `<div class="m-griglia2">${allerta()}${box("Cosa trovi",["🏠 Home con lo stato di allerta","🪪 La tua scheda personale","🖼️ Le foto degli eventi","🚩 Segnalazioni"],"cosa")}</div>`, true),
  passi:[
    {t:"A cosa serve", d:"Vedi la tua scheda personale, le foto degli eventi e lo stato di allerta, e segnali se qualcosa nei tuoi dati è sbagliato.", h:"cosa",
     v:"L'Area Riservata è il posto dove la Sezione tiene i dati di tutti i volontari. Tu da qui puoi vedere la tua scheda, cioè quello che la Sezione sa di te, guardare le foto degli eventi, e segnalare se qualcosa non è giusto."},
    {t:"Il menu", d:"In alto trovi Home e La mia scheda. Le altre voci sono sotto Altro. Dal telefono il menu è in basso.", h:"menu",
     v:"Il menu è in alto: Home, La mia scheda, e sotto la voce Altro trovi Galleria e Segnalazioni. Se sei dal telefono, le stesse voci le trovi nella barra in basso."},
    {t:"Il bot Telegram", d:"Oltre all'Area Riservata c'è il bot Telegram della Sezione, per mandare foto e posizione durante gli eventi.", h:"cosa",
     v:"E poi c'è il bot Telegram della Sezione, che è il modo più veloce per mandare foto e posizione quando sei in servizio. Ha una pagina tutta sua in questa guida."},
    {t:"Come usare la guida", d:"Tocca i numeri gialli sulla schermata, oppure premi Ascolta per sentire la spiegazione.", h:"cosa",
     v:"In ogni pagina trovi una schermata di esempio con dei numeri gialli: toccali per sapere a cosa serve quel pulsante. Oppure premi Ascolta, come adesso. Cominciamo da come si entra."}
  ]
},
{
  id:"accesso", percorso:["volontari","staff"], titolo:"Accesso", icona:"ti-login",
  perche:"Come entrare: con Google oppure con un codice che arriva per email.",
  chi:"Volontari e staff.", video:"",
  intro:"Vediamo come si entra. Non ci sono password da ricordare: entri con il tuo account Google, oppure con un codice che ti arriva per email.",
  schermo: () => `<div class="m-login"><div class="m-login-card">
      <img src="icon-192.png" alt=""><div class="m-login-t">PC ANA Casale</div>
      <span class="m-btn largo bianco" data-h="google">G&nbsp; Entra con Google</span>
      <small>Oppure ricevi un codice via email</small>
      <div class="m-login-campo" data-h="email"><label>Email</label><span>nome@esempio.it</span></div>
      <span class="m-btn largo" data-h="invia">Invia il codice</span>
      <div class="m-login-campo" data-h="codice"><label>Codice a 6 cifre</label><span>123456</span></div>
      <span class="m-btn largo">Accedi</span>
    </div></div>`,
  passi:[
    {t:"Entra con Google", d:"Se la tua email è un indirizzo Gmail, premi Entra con Google e scegli il tuo account.", h:"google",
     v:"Il modo più veloce è il pulsante Entra con Google. Lo premi, scegli il tuo account, e sei dentro."},
    {t:"Oppure con l'email", d:"Scrivi la tua email e premi Invia il codice.", h:"invia",
     v:"Se non usi Google, scrivi la tua email qui e premi Invia il codice."},
    {t:"Il codice", d:"Ti arriva per email un codice a 6 cifre: scrivilo qui e premi Accedi. Se non lo vedi, guarda nella posta indesiderata.", h:"codice",
     v:"Dopo pochi secondi ti arriva una mail con un codice di sei cifre. Lo scrivi qui sotto e premi Accedi. Se la mail non arriva, guarda anche nella posta indesiderata."},
    {t:"Mail non abilitata", d:"Se compare «Questa mail non è abilitata», la tua email non è registrata: contatta la segreteria.", h:"email",
     v:"Se ti compare il messaggio Questa mail non è abilitata, vuol dire che quell'indirizzo non è registrato nella tua scheda. Non è un errore tuo: avvisa la segreteria e te lo abilitano."},
    {t:"Resti collegato", d:"Una volta entrato, l'app ti riconosce anche le volte successive. Se usi un computer condiviso, ricordati di uscire.", h:"email",
     v:"Una volta entrato, l'app si ricorda di te e non devi rifare tutto ogni volta. Se però usi un computer che usano anche altri, quando hai finito esci."}
  ]
},
{
  id:"home-volontario", percorso:["volontari"], titolo:"Home", icona:"ti-home",
  perche:"La pagina che vedi appena entri: allerta meteo e compleanni del mese.",
  chi:"Tutti i volontari.", video:"",
  intro:"Questa è la Home, la pagina che ti si apre appena entri.",
  schermo: () => app("home","Home", `<div class="m-griglia2">${allerta("allerta")}${box("Compleanni di novembre",["🎂 3 · Mario Rossi","🎂 17 · Laura Bianchi"],"compleanni")}</div>`, true),
  passi:[
    {t:"Stato allerta", d:"Il bollettino di ARPA Piemonte per la nostra zona: verde nessuna allerta, poi giallo, arancione e rosso.", h:"allerta",
     v:"In alto c'è lo stato di allerta per la nostra zona, preso dal bollettino di ARPA Piemonte. Verde vuol dire tutto tranquillo. Giallo, arancione e rosso sono i livelli di allerta crescenti, e sotto vedi anche il tipo di rischio."},
    {t:"Compleanni", d:"I compleanni dei volontari del mese.", h:"compleanni",
     v:"E qui accanto i compleanni del mese, così nessuno si dimentica di fare gli auguri."}
  ]
},
{
  id:"scheda", percorso:["volontari"], titolo:"La mia scheda", icona:"ti-id",
  perche:"Tutto quello che la Sezione ha registrato su di te: dati, documenti, visita medica, corsi, dotazioni, interventi e l'archivio dei tuoi attestati.",
  chi:"Tutti i volontari.", video:"",
  intro:"La mia scheda è la pagina più importante per te. Qui vedi tutto quello che la Sezione ha registrato su di te.",
  schermo: () => app("scheda","La mia scheda", `
    <div class="m-modale">${tabs(["Dati","Documenti","Visita medica","Formazione","Dotazioni","Interventi"],"schede")}
      <div class="m-campi"><span>Cognome e nome <b>Rossi Mario</b></span><span>Squadra <b>CASALE</b></span><span>Mansione <b>LOGISTICA</b></span><span>Telefono <b>333 1234567</b></span></div></div>
    <div class="m-modale" data-h="archivio"><div class="m-box-t">Corsi obbligatori</div>
      <div class="m-campi"><span>Corso 12 ore <b>${tag("Svolto","b")}</b></span><span>DAE <b>${tag("In scadenza","g")}</b></span></div>
      <div class="m-box-t">Attestati (12)</div><div class="m-campi"><span>Cartografia e orientamento <b>22/05/2014</b></span><span>Operatori radio 1 livello <b>23/10/2020</b></span></div></div>
    <div class="m-azioni">${btn("Segnala un errore","errore","giallo")}</div>`, true),
  passi:[
    {t:"Le schede", d:"Dati: anagrafica e contatti. Documenti: documento d'identità, attestati e altri file. Visita medica: lo stato della tua visita. Formazione: i corsi fatti. Dotazioni: cosa ti è stato consegnato. Interventi: i servizi a cui hai partecipato, con le ore.", h:"schede",
     v:"La scheda è divisa in parti. In Dati trovi anagrafica e contatti. In Documenti i file caricati, come il documento d'identità e gli attestati. In Visita medica lo stato della tua visita. In Formazione i corsi che hai fatto. In Dotazioni quello che ti è stato consegnato, dalla divisa ai dispositivi di protezione. E in Interventi tutti i servizi a cui hai partecipato, con le ore."},
    {t:"Controlla i tuoi dati", d:"Dai un'occhiata ogni tanto: telefono ed email servono per contattarti e per entrare.", h:"schede",
     v:"Vale la pena darci un'occhiata ogni tanto, soprattutto telefono ed email: sono quelli che usiamo per contattarti, e l'email serve anche per entrare."},
    {t:"Attestati e documenti archiviati", d:"Corsi obbligatori: 4 ore, 12 ore, Caposquadra e DAE, ognuno con data, scadenza e attestato. Abilitazioni: carrelli, escavatori e simili. Attestati: tutti gli altri. Documenti archiviati: adesione, privacy e simili. Tocca una riga per aprire il PDF. Rosso vuol dire scaduto, giallo che scade entro due mesi.", h:"archivio",
     v:"Più in basso trovi gli attestati e i documenti che la Sezione ha archiviato per te. In Corsi obbligatori ci sono il corso 4 ore, il 12 ore, il caposquadra e il DAE, ognuno con la data, la scadenza e il suo attestato. In Abilitazioni trovi carrelli, escavatori e simili, in Attestati tutti gli altri corsi ed esercitazioni, e in Documenti archiviati cose come la scheda di adesione. Tocchi una riga e il PDF si apre. Un'etichetta rossa vuol dire scaduto, gialla che scade entro un paio di mesi."},
    {t:"Se c'è un errore", d:"Premi Segnala un errore e scrivi cosa non va: la segreteria lo corregge.", h:"errore",
     v:"Se trovi qualcosa di sbagliato, non serve telefonare: premi Segnala un errore, scrivi cosa non va, e la segreteria lo corregge."}
  ]
},
{
  id:"segnalazioni-volontario", percorso:["volontari"], titolo:"Segnalazioni", icona:"ti-flag",
  perche:"Le segnalazioni di errori nella tua scheda che hai mandato alla segreteria.",
  chi:"Tutti i volontari.", video:"",
  intro:"In Segnalazioni ritrovi le correzioni che hai chiesto alla segreteria.",
  schermo: () => app("altro","Segnalazioni", `
    <div class="m-azioni">${btn("Segnala errori nella tua scheda","nuova","giallo")}</div>
    ${tab([["Data","Messaggio","Stato"],["28/10/2026","Il numero di telefono è cambiato",tag("In attesa","g")],["02/09/2026","Manca l'attestato del corso base",tag("Risolta","b")]],"elenco")}`, true),
  passi:[
    {t:"Nuova segnalazione", d:"Premi Segnala errori nella tua scheda e descrivi cosa va corretto.", h:"nuova",
     v:"Da qui puoi mandare una nuova segnalazione, esattamente come dal pulsante nella tua scheda. Scrivi in modo semplice cosa va corretto."},
    {t:"Lo stato", d:"Vedi le segnalazioni inviate: In attesa finché la segreteria non corregge, poi Risolta.", h:"elenco",
     v:"Sotto vedi quelle che hai già mandato. Restano in attesa finché la segreteria non sistema la scheda, poi diventano risolte."}
  ]
},
{
  id:"galleria", percorso:["volontari","staff"], titolo:"Galleria", icona:"ti-photo",
  perche:"Gli album fotografici degli eventi della Sezione.",
  chi:"Volontari e staff.", video:"",
  intro:"La Galleria raccoglie le foto degli eventi, divise per album.",
  schermo: () => app("altro","Galleria", `
    <p class="m-sotto">Album fotografici degli eventi</p>
    <div class="m-card3" data-h="album">
      <div class="m-card"><div class="m-foto alta">🏕️</div><b>Esercitazione 2026</b><small>48 foto</small></div>
      <div class="m-card"><div class="m-foto alta">🎉</div><b>25° anniversario</b><small>120 foto</small></div>
      <div class="m-card"><div class="m-foto alta">🌊</div><b>Emergenza alluvione</b><small>35 foto</small></div>
    </div>`, true),
  passi:[
    {t:"Gli album", d:"Ogni riquadro è un album: aprilo per vedere le foto, e con ← Tutti gli album torni indietro.", h:"album",
     v:"Ogni riquadro è un album. Lo apri e scorri le foto. Per tornare all'elenco premi Tutti gli album, in alto."}
  ]
},
{
  id:"aggiorna", percorso:["volontari"], titolo:"Aggiornare i tuoi dati dal link", icona:"ti-refresh",
  perche:"Quando la segreteria ti manda un link personale per aggiornare dati, foto, documenti e taglie.",
  chi:"I volontari che ricevono il link.", video:"",
  intro:"Ogni tanto la segreteria ti manda un link personale, di solito su WhatsApp, per aggiornare i tuoi dati. Non serve entrare nell'Area Riservata: fai tutto da quel link, anche dal telefono.",
  schermo: () => `<div class="m-app solo"><main class="m-main"><div class="m-titolo">Aggiorna i tuoi dati</div><div class="m-body">
    <div class="m-box" data-h="verifica"><div class="m-box-t">Per sicurezza, scrivi la tua data di nascita</div><div class="m-campi"><span>Data di nascita <b>gg/mm/aaaa</b></span></div><small>Dopo 5 tentativi sbagliati il link si blocca.</small></div>
    <div class="m-passi-agg" data-h="passi"><span class="on">I tuoi dati</span><span>Foto</span><span>Documenti</span><span>Taglie e DPI</span><span>Firma</span><span>Riepilogo</span></div>
    <div class="m-griglia2"><div class="m-box" data-h="foto"><div class="m-box-t">Foto per il tesserino</div><div class="m-foto alta">🙂</div><small>viso e spalle, recente, a colori</small></div>
    <div class="m-box" data-h="firma"><div class="m-box-t">Firma</div><div class="m-firma">firma qui</div></div></div>
    <div class="m-azioni"><span class="m-sp"></span>${btn("Continua","invia")}</div></div></main></div>`,
  passi:[
    {t:"Apri il link", d:"Per sicurezza ti chiede la tua data di nascita. Dopo 5 tentativi sbagliati il link si blocca.", h:"verifica",
     v:"Quando apri il link, per prima cosa ti chiede la tua data di nascita. Serve a essere sicuri che sia proprio tu. Attenzione: dopo cinque tentativi sbagliati il link si blocca, e devi chiederne uno nuovo."},
    {t:"Un passo alla volta", d:"I tuoi dati, la foto, i documenti, le taglie: controlli e correggi una pagina alla volta e premi Continua.", h:"passi",
     v:"Poi ti guida una pagina alla volta. Controlli i tuoi dati e correggi quello che è cambiato, e premi Continua per andare avanti."},
    {t:"Foto e documenti", d:"Se abbiamo già la tua foto, premi È ok, confermo oppure Rifai la foto. Documenti: foto o PDF, fronte e, se serve, retro; prima dell'invio scegli Usa migliorata o Usa originale.", h:"foto",
     v:"Se la Sezione ha già la tua foto, te la mostra: se va ancora bene premi È ok, confermo, altrimenti Rifai la foto. Per i documenti fotografi il fronte e, se c'è, il retro. Prima di caricarli vedi una versione migliorata, raddrizzata e più leggera: scegli quella o l'originale, e se serve la giri con le frecce."},
    {t:"Taglie e DPI", d:"Per ogni capo indica la taglia: servono per la divisa e i dispositivi di protezione.", h:"passi",
     v:"Nella pagina delle taglie indichi la tua misura per ogni capo. Ci serve per ordinare divise e dispositivi di protezione della taglia giusta."},
    {t:"Firma e invio", d:"Firmi con il dito per autorizzare il trattamento dei dati, controlli il riepilogo e invii.", h:"firma",
     v:"Alla fine firmi con il dito, per autorizzare il trattamento dei tuoi dati, controlli il riepilogo e invii. Un incaricato della Sezione controlla tutto e aggiorna la tua scheda."},
    {t:"Correggere dopo", d:"Se ti accorgi di un errore, riapri lo stesso link e correggi, finché non scade.", h:"invia",
     v:"E se dopo ti accorgi di aver sbagliato qualcosa, nessun problema: riapri lo stesso link e correggi, finché il link è valido."}
  ]
},
{
  id:"bot", percorso:["volontari"], titolo:"Il bot Telegram", icona:"ti-send",
  perche:"Il bot della Sezione: mandi foto e posizione durante gli eventi e ricevi gli avvisi di allerta.",
  chi:"Tutti i volontari con Telegram.", video:"",
  intro:"Il bot Telegram della Sezione è il modo più veloce per mandare foto e posizione quando sei in servizio, e per ricevere gli avvisi di allerta.",
  schermo: () => `<div class="m-tg"><div class="m-tg-head" data-h="cerca"><b>PC ANA Casale</b><small>bot · @PCANACasale_bot</small></div>
    <div class="m-tg-chat">
      <div class="m-tg-msg">Ciao! Per usare il bot devo riconoscerti dal tuo numero di telefono. Premi il pulsante qui sotto.</div>
      <div class="m-tg-msg tu">📱 Invia il mio numero</div>
      <div class="m-tg-msg">Collegamento riuscito, Mario!</div>
      <div class="m-tg-msg tu">📷 Foto</div>
      <div class="m-tg-msg" data-h="evento">Segnalazione registrata per: Esercitazione 2026</div>
    </div>
    <div class="m-tg-tasti" data-h="tasti"><span>📷 Invia foto</span><span>📍 Invia posizione</span><span>🌦 Bollettino ARPA</span></div>
    <div class="m-tg-tasti uno" data-h="numero"><span>📱 Invia il mio numero</span></div></div>`,
  passi:[
    {t:"Trova il bot", d:"Su Telegram cerca @PCANACasale_bot e premi Avvia.", h:"cerca",
     v:"Apri Telegram, cerca PC ANA Casale bot, con la chiocciola davanti, e premi Avvia."},
    {t:"Collegati", d:"Premi 📱 Invia il mio numero: il bot ti riconosce dal numero che c'è nella tua scheda. In alternativa la segreteria ti manda un link personale.", h:"numero",
     v:"Il bot ti chiede di riconoscerti. Premi il pulsante Invia il mio numero: confronta il tuo numero con quello della tua scheda, e ti collega. Se ti dice che il numero non risulta, vuol dire che nella scheda c'è un numero diverso: avvisa la segreteria. In alternativa, la segreteria può mandarti un link personale che ti collega con un tocco."},
    {t:"Mandare una foto", d:"Premi 📷 Invia foto e manda la foto, con una didascalia se vuoi. Serve anche la posizione: premi 📍 Invia posizione, prima o dopo, entro 10 minuti.", h:"tasti",
     v:"Quando sei in servizio e devi segnalare qualcosa, premi Invia foto e mandala, anche con una breve descrizione. Al bot serve sapere dove l'hai scattata, quindi premi anche Invia posizione. Puoi farlo prima o dopo la foto, basta che sia entro dieci minuti."},
    {t:"Dove finisce", d:"Se c'è un'esercitazione o un'emergenza in corso, la foto va lì; altrimenti è una segnalazione generica. Lo staff riceve subito l'avviso.", h:"evento",
     v:"Se in quel momento c'è un'esercitazione o un'emergenza in corso, la foto viene collegata a quell'evento. Se non c'è niente in corso, la registra come segnalazione generica. In tutti e due i casi lo staff riceve subito l'avviso."},
    {t:"Allerta e bollettino", d:"Con 🌦 Bollettino ARPA vedi l'allerta del giorno. Quando scatta un'allerta, il bot ti avvisa da solo.", h:"tasti",
     v:"Con il pulsante Bollettino ARPA vedi in ogni momento l'allerta del giorno. E non devi controllare tu: quando scatta un'allerta per la nostra zona, il bot ti scrive da solo, e ti avvisa anche quando si torna al verde."}
  ]
},

/* ========================= PERCORSO STAFF ========================= */
{
  id:"benvenuto-staff", percorso:["staff"], titolo:"Benvenuto", icona:"ti-hand-finger",
  perche:"Come è organizzato il menu dell'Area Riservata e come funzionano i permessi.",
  chi:"Lo staff.", video:"",
  intro:"Benvenuto nella parte di gestione dell'Area Riservata. Prima di entrare nelle singole pagine, ti spiego come è organizzato il menu e chi vede cosa.",
  schermo: () => app("altro","Home", `<div class="m-pop" data-h="altroMenu">
      <div class="m-pop-g"><b>Logistica</b><span>Mezzi</span><span>Dotazioni</span><span>Piani di carico</span><span>TLC</span></div>
      <div class="m-pop-g"><b>Strumenti</b><span>Postazioni</span><span>Galleria</span><span>Editor PDF</span><span>Generatore convocazioni</span><span>Eventi</span></div>
      <div class="m-pop-g"><b>Amministrazione</b><span>Visite mediche</span><span>Formazione</span><span>Aggiornamento dati</span><span>Statistiche</span><span>Segnalazioni</span><span>Richieste</span><span>DB</span><span>Registro accessi</span><span>Gestione accessi</span><span>Impostazioni</span></div></div>`),
  passi:[
    {t:"La barra in alto", d:"Home, Volontari e Interventi, le pagine più usate, sono sempre in vista. Dal telefono sono nella barra in basso.", h:"menu",
     v:"In alto hai sempre a portata di mano le tre pagine che si usano di più: Home, Volontari e Interventi. Dal telefono le trovi nella barra in basso."},
    {t:"Altro", d:"Tutto il resto è in Altro, diviso in Logistica, Strumenti e Amministrazione.", h:"altroMenu",
     v:"Tutto il resto è sotto Altro, diviso in tre gruppi. Logistica, con mezzi, dotazioni, piani di carico e radio. Strumenti, con postazioni, galleria, editor PDF, convocazioni ed eventi. E Amministrazione, con visite, formazione, statistiche e le pagine di gestione."},
    {t:"Chi vede cosa", d:"Ognuno vede solo le pagine per cui ha il permesso. Il master vede tutto e assegna i permessi in Gestione accessi.", h:"altroMenu",
     v:"Non tutti vedono tutte le voci: ognuno ha i suoi permessi, pagina per pagina. Il master vede tutto, ed è lui che assegna i permessi agli altri, dalla pagina Gestione accessi."}
  ]
},
{
  id:"home-staff", percorso:["staff"], titolo:"Home", icona:"ti-home",
  perche:"Il colpo d'occhio: allerta, ultimi interventi, revisioni in scadenza, richieste e compleanni.",
  chi:"Lo staff (i riquadri dipendono dai permessi).", video:"",
  intro:"La Home dello staff ti dà in un colpo d'occhio le cose da tenere sotto controllo.",
  schermo: () => app("home","Home", `<div class="m-griglia2">${allerta("allerta")}
    ${box("Ultimi interventi",["12/10 · Esercitazione · 14 volontari","05/10 · Servizio d'ordine · 8 volontari"],"interventi")}
    ${box("Revisioni in scadenza",[tag("Scade il 30/11","g")+" Fiat Ducato","" + tag("Scaduta il 02/10","r")+" Rimorchio"],"revisioni")}
    ${box("Richieste",[tag("Nuova","g")+" Giulia Verdi · vuole aderire "+btn("Segna letta","","mini")],"richieste")}</div>`),
  passi:[
    {t:"Stato allerta", d:"Il bollettino ARPA per la zona Piem-I, aggiornato in automatico.", h:"allerta",
     v:"Lo stato di allerta arriva in automatico dal bollettino di ARPA Piemonte per la nostra zona, e si aggiorna da solo."},
    {t:"Ultimi interventi", d:"Gli ultimi interventi svolti, con il numero di volontari. Vedi tutti → apre la pagina Interventi.", h:"interventi",
     v:"Qui vedi gli ultimi interventi svolti, con quanti volontari c'erano. Da Vedi tutti passi alla pagina completa."},
    {t:"Revisioni in scadenza", d:"I mezzi con la revisione scaduta o in arrivo.", h:"revisioni",
     v:"Questo riquadro ti avvisa dei mezzi con la revisione scaduta o in arrivo, così non ci si accorge all'ultimo."},
    {t:"Richieste", d:"Le richieste di adesione arrivate dal sito. Premi Segna letta quando le hai prese in carico.", h:"richieste",
     v:"E qui arrivano le richieste di chi vuole entrare in Sezione, dal modulo del sito pubblico. Quando l'hai presa in carico premi Segna letta."}
  ]
},
{
  id:"volontari", percorso:["staff"], titolo:"Volontari", icona:"ti-users",
  perche:"L'anagrafica di tutti i volontari, con la scheda completa di ognuno.",
  chi:"Chi ha il permesso Volontari. Per modificare serve il permesso di modifica.", video:"",
  intro:"Volontari è il cuore dell'Area Riservata: l'anagrafica completa, con la scheda di ogni persona.",
  schermo: () => app("volontari","Volontari", `
    <div class="m-barra">${cerca("Cerca per nome, squadra o CF","cerca")}${btn("Filtri","filtri","grigio")}<span class="m-sp"></span>${btn("Esporta visite PDF","","grigio")}${btn("Nuovo volontario","nuovo")}</div>
    <div class="m-card3" data-h="card">
      <div class="m-card"><b>Rossi Mario</b><small>CASALE · LOGISTICA</small>${tag("Attivo","v")}</div>
      <div class="m-card"><b>Bianchi Laura</b><small>COLLINA · GENERICO</small>${tag("Da sistemare","g")}</div>
      <div class="m-card"><b>Verdi Paolo</b><small>ALFA · CAPO SQUADRA</small>${tag("Attivo","v")}</div></div>
    <div class="m-modale">${tabs(["Dati","Documenti","Visita medica","Formazione","Abilitazioni","Attestati","Interventi"],"schede")}
      <div class="m-azioni">${btn("Link bot","link","grigio")}</div></div>`),
  passi:[
    {t:"Cercare", d:"Cerca per nome, squadra o codice fiscale.", h:"cerca",
     v:"Per trovare una persona scrivi nome, squadra o codice fiscale."},
    {t:"Filtri", d:"Filtra per squadra, tipo, mansione, attivi o non attivi, e stato della visita medica.", h:"filtri",
     v:"Con Filtri restringi l'elenco: per squadra, per tipo, per mansione, solo gli attivi o i non attivi, oppure per stato della visita medica."},
    {t:"Le schede", d:"Ogni riquadro è un volontario. Da sistemare indica dati o documenti mancanti.", h:"card",
     v:"Ogni riquadro è un volontario. Se compare Da sistemare, vuol dire che manca qualcosa nei suoi dati o nei documenti: aprendo la scheda vedi cosa."},
    {t:"Dentro la scheda", d:"Dati, Documenti, Visita medica, Formazione, Abilitazioni, Attestati, Interventi. Le taglie DPI sono in Dati.", h:"schede",
     v:"La scheda è divisa in parti: dati, documenti, visita medica, formazione, abilitazioni, attestati e interventi. Le taglie dei DPI le trovi dentro Dati. Se hai il permesso, puoi modificare quello che serve."},
    {t:"Formazione", d:"In alto i corsi obbligatori (4 ore, 12 ore, Caposquadra, DAE), ognuno una volta sola con data, scadenza e attestato. Sotto gli altri corsi registrati.", h:"schede",
     v:"In Formazione trovi in alto i corsi obbligatori: 4 ore, 12 ore, caposquadra e DAE. Ognuno compare una volta sola, con la data, la scadenza e il suo attestato. Un'etichetta rossa vuol dire scaduto, gialla che scade entro due mesi. Sotto ci sono gli altri corsi registrati."},
    {t:"Archivio su Drive", d:"I file archiviati su Google Drive compaiono da soli: gli attestati di 4 ore, 12 ore, Caposquadra e DAE in Formazione sotto il loro corso, le abilitazioni (carrelli, escavatori…) nella scheda Abilitazioni, gli altri nella scheda Attestati, adesione e simili in fondo a Documenti. Si possono solo aprire. Li vede chi ha il permesso Volontari oppure Vedere archivio documenti volontari; ogni apertura viene registrata.", h:"schede",
     v:"I file archiviati su Google Drive compaiono da soli nella scheda. Gli attestati dei corsi 4 ore, 12 ore, caposquadra e DAE li trovi in Formazione, sotto il loro corso. Le abilitazioni, come carrelli elevatori o escavatori, sono nella scheda Abilitazioni. Tutti gli altri attestati sono nella scheda Attestati, e la scheda di adesione e simili in fondo a Documenti. Si possono solo aprire, e ogni file aperto resta registrato."},
    {t:"Link per il bot", d:"Dalla scheda, Link bot crea un link personale che collega il volontario al bot Telegram con un tocco.", h:"link",
     v:"Dalla scheda puoi creare il link personale per il bot Telegram: lo mandi al volontario, e con un tocco si collega, senza passare dal numero di telefono."},
    {t:"Nuovo volontario", d:"Nuovo volontario apre una scheda vuota. Il codice fiscale viene controllato.", h:"nuovo",
     v:"Per inserire una persona nuova premi Nuovo volontario. Il codice fiscale viene controllato, così si evitano errori di battitura."}
  ]
},
{
  id:"interventi", percorso:["staff"], titolo:"Interventi", icona:"ti-clock",
  perche:"Il registro dei servizi svolti, con volontari e ore. Si può compilare anche incollando il report di WhatsApp.",
  chi:"Chi ha il permesso Interventi.", video:"",
  intro:"Interventi è il registro di tutti i servizi, con chi c'era e quante ore ha fatto. Le ore di ogni volontario si sommano da qui.",
  schermo: () => app("interventi","Interventi", `
    <div class="m-barra">${cerca("Cerca evento, luogo o tipo","cerca")}<span class="m-sp"></span>${btn("Registra da messaggio","messaggio","scuro")}${btn("Nuovo intervento","nuovo")}</div>
    ${tab([["Data","Evento","Tipo","Volontari","Ore","Stato"],["12/10/2026","Esercitazione Mirabello","Esercitazione","14","112",tag("Svolto","v")],["20/11/2026","Mercatino Natale","Servizio","6","—",tag("Programmato","g")]],"elenco")}
    <div class="m-modale" data-h="bozza"><div class="m-box-t">Registra da messaggio</div><div class="m-firma">Incolla qui il messaggio del report…</div><div class="m-azioni">${btn("Analizza messaggio")}</div></div>`),
  passi:[
    {t:"L'elenco", d:"Tutti gli interventi con data, tipo, volontari, ore e stato.", h:"elenco",
     v:"In elenco vedi tutti gli interventi, con data, tipo, numero di volontari, ore e stato."},
    {t:"Gli stati", d:"Programmato, svolto o annullato. Solo gli interventi svolti contano nel monte ore.", h:"elenco",
     v:"Ogni intervento ha uno stato. Programmato se deve ancora esserci, svolto quando è fatto, oppure annullato. Attenzione: nelle ore dei volontari contano solo quelli svolti."},
    {t:"Nuovo intervento", d:"Inserisci evento, data, luogo, tipo, e aggiungi i volontari con le loro ore.", h:"nuovo",
     v:"Con Nuovo intervento lo inserisci a mano: evento, data, luogo, tipo, e poi i volontari che hanno partecipato, ognuno con le sue ore."},
    {t:"Registra da messaggio", d:"Incolla il report mandato su WhatsApp e premi Analizza messaggio: l'app riconosce volontari e ore e ti mostra una bozza.", h:"messaggio",
     v:"C'è un modo molto più veloce. Premi Registra da messaggio, incolla il report che il caposquadra ha mandato su WhatsApp, e premi Analizza messaggio. L'app riconosce da sola evento, volontari e ore."},
    {t:"Controlla e conferma", d:"Niente viene salvato finché non confermi la bozza. Le ore sono arrotondate all'intero.", h:"bozza",
     v:"Ti mostra una bozza, e niente viene salvato finché non la controlli e confermi tu. Le ore vengono sempre arrotondate all'ora intera."}
  ]
},
{
  id:"eventi", percorso:["staff"], titolo:"Eventi", icona:"ti-alert-triangle",
  perche:"Esercitazioni ed emergenze: squadra, disponibilità, mezzi, cucina e segnalazioni dal bot.",
  chi:"Chi ha il permesso Eventi.", video:"",
  intro:"Eventi serve a gestire esercitazioni ed emergenze mentre succedono: chi c'è, quando, con quali mezzi, e le segnalazioni che arrivano dal bot.",
  schermo: () => app("altro","Eventi", `
    <div class="m-barra">${cerca("Cerca evento")}<span class="m-sp"></span>${btn("Invia messaggio","messaggio","scuro")}${btn("Nuovo evento","nuovo")}</div>
    <div class="m-modale"><div class="m-box-t">Esercitazione Mirabello ${tag("In corso","g")}</div>
      ${tabs(["Riepilogo","Volontari","Mezzi e materiali","Ospiti","Cucina","Segnalazioni"],"schede")}
      <div class="m-card3" data-h="segnalazioni"><div class="m-card"><div class="m-foto">📷</div><small>Albero caduto · via Roma</small></div><div class="m-card"><div class="m-foto">📷</div><small>Allagamento sottopasso</small></div><div class="m-card"><div class="m-foto">📷</div><small>Generica ${btn("Assegna a evento…","","mini")}</small></div></div></div>`),
  passi:[
    {t:"Nuovo evento", d:"Scegli Emergenza o Esercitazione, titolo, date e luogo. Stati: Pianificato, In corso, Concluso.", h:"nuovo",
     v:"Con Nuovo evento scegli se è un'emergenza o un'esercitazione, e inserisci titolo, date e luogo. Poi l'evento passa da pianificato, a in corso, a concluso."},
    {t:"In corso conta", d:"Mentre un evento è In corso, le foto mandate al bot finiscono lì.", h:"segnalazioni",
     v:"Lo stato in corso è importante: finché l'evento è in corso, le foto che i volontari mandano al bot vengono collegate direttamente qui."},
    {t:"Il cruscotto", d:"Riepilogo, Volontari con le disponibilità giorno per giorno, Mezzi e materiali, Ospiti e Cucina con i pasti.", h:"schede",
     v:"Dentro l'evento hai il cruscotto. Il riepilogo con i totali. Volontari, con la disponibilità di ognuno giorno per giorno. Mezzi e materiali. Ospiti. E Cucina, con i pasti da preparare."},
    {t:"Segnalazioni", d:"Le foto dal bot, con posizione. Quelle generiche si assegnano a un evento con Assegna a evento….", h:"segnalazioni",
     v:"In Segnalazioni vedi le foto arrivate dal bot, con la posizione. Quelle arrivate quando non c'era niente in corso restano generiche: le puoi assegnare all'evento giusto con Assegna a evento."},
    {t:"Messaggi", d:"Invia messaggio scrive a tutti i volontari collegati al bot Telegram.", h:"messaggio",
     v:"Con Invia messaggio scrivi in un colpo solo a tutti i volontari collegati al bot Telegram. Utile per una convocazione veloce."},
    {t:"A fine evento", d:"Quando lo concludi, l'app crea l'intervento contando solo i presenti, così le ore finiscono nelle schede.", h:"schede",
     v:"E quando l'evento finisce, non devi ricopiare niente: concludendolo, l'app crea da sola l'intervento, contando solo chi era presente, e le ore finiscono nelle schede dei volontari."}
  ]
},
{
  id:"mezzi", percorso:["staff"], titolo:"Mezzi", icona:"ti-truck",
  perche:"I mezzi della Sezione con i loro documenti e scadenze.",
  chi:"Chi ha il permesso Mezzi.", video:"",
  intro:"In Mezzi c'è l'elenco dei veicoli della Sezione, con documenti e scadenze.",
  schermo: () => app("altro","Mezzi", `
    <div class="m-barra"><span class="m-sp"></span>${btn("Nuovo mezzo","nuovo")}</div>
    <div class="m-card3" data-h="card">
      <div class="m-card"><div class="m-foto">🚐</div><b>Fiat Ducato</b><small>AB123CD</small></div>
      <div class="m-card"><div class="m-foto">🚙</div><b>Land Rover Defender</b><small>CD456EF</small></div>
      <div class="m-card"><div class="m-foto">🛻</div><b>Rimorchio</b><small>XA12345</small></div></div>
    <div class="m-modale" data-h="documenti"><div class="m-box-t">Carica documento</div><div class="m-campi"><span>Tipo <b>Foto mezzo · Libretto · Assicurazione · Verbale revisione · Collaudo</b></span></div></div>`),
  passi:[
    {t:"I mezzi", d:"Ogni riquadro è un mezzo: aprilo per vedere dati e scadenze, e premi Modifica per cambiarli.", h:"card",
     v:"Ogni riquadro è un mezzo. Lo apri per vedere dati e scadenze, e con Modifica li aggiorni."},
    {t:"I documenti", d:"Carica foto, libretto, assicurazione, verbale di revisione e collaudo.", h:"documenti",
     v:"Per ogni mezzo carichi i documenti: foto, libretto, assicurazione, verbale di revisione e collaudo. Così li trovi sempre, anche fuori sede."},
    {t:"Scadenze", d:"Le revisioni in scadenza compaiono anche in Home.", h:"card",
     v:"Le revisioni in scadenza ti compaiono anche in Home, quindi non serve venire a controllare qui ogni volta."}
  ]
},
{
  id:"dotazioni", percorso:["staff"], titolo:"Dotazioni", icona:"ti-box",
  perche:"L'inventario del materiale, diviso per categorie e magazzini.",
  chi:"Chi ha il permesso Dotazioni.", video:"",
  intro:"Dotazioni è l'inventario del materiale della Sezione, diviso per categorie e per magazzino.",
  schermo: () => app("altro","Dotazioni", `
    <div class="m-barra">${cerca("Cerca articolo, categoria o magazzino","cerca")}<span class="m-sp"></span>${btn("Scarica modello Excel","excel","grigio")}${btn("Carica Excel","","grigio")}${btn("Esporta elenco","","grigio")}${btn("Nuovo articolo","nuovo")}</div>
    <div class="m-card3" data-h="card">
      <div class="m-card"><b>Motosega</b><small>Elettroutensili · Magazzino A</small><small>Q.tà 3</small></div>
      <div class="m-card"><b>Torre faro</b><small>Illuminazione · Magazzino B</small><small>Q.tà 2</small></div>
      <div class="m-card"><b>Gazebo 3×3</b><small>Campo · Magazzino A</small><small>Q.tà 6</small></div></div>`),
  passi:[
    {t:"Cercare", d:"Cerca per nome dell'articolo, categoria o magazzino.", h:"cerca",
     v:"Cerchi un articolo scrivendo il nome, la categoria o il magazzino."},
    {t:"Gli articoli", d:"Ogni riquadro è un articolo con categoria, magazzino e quantità. Aprilo per i dettagli e le manutenzioni.", h:"card",
     v:"Ogni riquadro è un articolo, con categoria, magazzino e quantità. Aprendolo vedi i dettagli e lo storico delle manutenzioni."},
    {t:"Da Excel", d:"Scarica il modello, compilalo e ricaricalo per inserire tanti articoli insieme. Esporta elenco per l'inventario completo.", h:"excel",
     v:"Se devi inserire tanti articoli, scarica il modello Excel, compilalo e ricaricalo. E con Esporta elenco ottieni l'inventario completo."},
    {t:"Categorie", d:"Categorie e sottocategorie si gestiscono in Impostazioni.", h:"nuovo",
     v:"Le categorie e le sottocategorie non si creano qui, ma in Impostazioni, così restano ordinate per tutti."}
  ]
},
{
  id:"pianicarico", percorso:["staff"], titolo:"Piani di carico", icona:"ti-clipboard-list",
  perche:"Cosa caricare su ogni mezzo per un'uscita, con la checklist da stampare.",
  chi:"Chi ha il permesso Piani di carico.", video:"",
  intro:"I piani di carico servono a preparare un'uscita: decidi cosa va su ogni mezzo e stampi la checklist per chi carica.",
  schermo: () => app("altro","Piani di carico", `
    <div class="m-barra"><span class="m-sp"></span>${btn("Nuovo piano","nuovo")}</div>
    <div class="m-modale"><div class="m-box-t">Piano di carico ES Mirabello 2026</div>
      <div class="m-azioni">${btn("Aggiungi mezzo","mezzo","grigio")}${btn("Scarica PDF","pdf")}</div>
      ${tab([["Mezzo","Articolo","Quantità"],["Fiat Ducato","Gazebo 3×3","2"],["Fiat Ducato","Torre faro","1"],["Defender","Motosega","2"]],"voci")}</div>`),
  passi:[
    {t:"Nuovo piano", d:"Dai un nome al piano, per esempio l'esercitazione a cui serve.", h:"nuovo",
     v:"Con Nuovo piano crei il piano e gli dai un nome, di solito quello dell'esercitazione o del servizio."},
    {t:"Mezzi e materiale", d:"Aggiungi i mezzi e, per ognuno, gli articoli e le quantità dalle Dotazioni.", h:"mezzo",
     v:"Poi aggiungi i mezzi che partono e, per ognuno, il materiale da caricare, preso dalle dotazioni, con le quantità. Non puoi caricare più di quello che c'è in magazzino."},
    {t:"La checklist", d:"Scarica PDF crea una checklist per ogni mezzo, da dare a chi carica.", h:"pdf",
     v:"Alla fine Scarica PDF ti prepara una checklist per ogni mezzo, da stampare e dare a chi carica. Così non si dimentica niente."}
  ]
},
{
  id:"tlc", percorso:["staff"], titolo:"TLC", icona:"ti-radio",
  perche:"Gli apparati radio della Sezione con documenti tecnici e licenze.",
  chi:"Chi ha il permesso TLC.", video:"",
  intro:"In TLC c'è l'elenco degli apparati radio, con documenti tecnici e licenze.",
  schermo: () => app("altro","TLC", `
    <div class="m-barra">${cerca("Cerca marca, modello, seriale","cerca")}<span class="m-sp"></span>${btn("Nuovo apparato","nuovo")}</div>
    ${tabs(["Tutti","Portatili","Veicolari","Stazioni fisse","Ponti radio"],"filtri")}
    <div class="m-card3" data-h="card"><div class="m-card"><b>Motorola DP4400</b><small>Portatile · SN 123AB</small></div><div class="m-card"><b>Hytera MD785</b><small>Veicolare · SN 88X1</small></div><div class="m-card"><b>Ponte VHF</b><small>Ponte radio</small></div></div>
    <div class="m-azioni">${btn("Carica documento generale TLC","generale","grigio")}</div>`),
  passi:[
    {t:"Cercare e filtrare", d:"Cerca per marca, modello o seriale, e filtra per portatili, veicolari, stazioni fisse o ponti radio.", h:"filtri",
     v:"Cerchi un apparato per marca, modello o numero di serie, e con le schede in alto lo filtri per tipo: portatili, veicolari, stazioni fisse o ponti radio."},
    {t:"Documenti dell'apparato", d:"In ogni apparato carichi scheda tecnica, foto e licenza.", h:"card",
     v:"Dentro ogni apparato carichi i suoi documenti: scheda tecnica, foto e licenza."},
    {t:"Documenti generali", d:"Manuali, piano frequenze e selettive, concessioni: valgono per tutto il settore TLC.", h:"generale",
     v:"Poi ci sono i documenti che valgono per tutto il settore, come i manuali, il piano delle frequenze con le selettive, e le concessioni. Li carichi qui."}
  ]
},
{
  id:"postazioni", percorso:["staff"], titolo:"Postazioni", icona:"ti-map-pin",
  perche:"Le postazioni di un servizio su mappa, con i volontari assegnati.",
  chi:"Chi ha il permesso Postazioni.", video:"",
  intro:"Postazioni serve per i servizi con tanti punti da presidiare, come una manifestazione: metti le postazioni su una mappa e assegni i volontari.",
  schermo: () => app("altro","Postazioni", `
    <div class="m-barra">${sel("Intervento: Mercatino Natale","intervento")}${tabs(["Elenco","Mappa"])}<span class="m-sp"></span>${btn("Modello Excel","","grigio")}${btn("Carica Excel","excel","grigio")}${btn("Nuova postazione","nuova")}</div>
    <div class="m-mappa" data-h="mappa"><span class="m-pin-mappa" style="left:22%;top:30%">1</span><span class="m-pin-mappa" style="left:55%;top:52%">2</span><span class="m-pin-mappa" style="left:74%;top:24%">3</span><span class="m-percorso"></span></div>
    <div class="m-azioni">${btn("Scarica PDF","pdf","grigio")}${btn("Scarica immagine mappa","","grigio")}</div>`),
  passi:[
    {t:"Scegli l'intervento", d:"Le postazioni appartengono a un intervento: sceglilo per primo.", h:"intervento",
     v:"Le postazioni appartengono sempre a un intervento, quindi per prima cosa lo scegli dal menu in alto."},
    {t:"Inserire le postazioni", d:"Una alla volta con Nuova postazione, oppure tutte insieme da Excel.", h:"nuova",
     v:"Poi inserisci le postazioni, una alla volta con Nuova postazione, oppure tutte insieme compilando il modello Excel."},
    {t:"La mappa", d:"Carica un'immagine della zona (foto, screenshot di Google Maps o PDF) e trascina le postazioni al loro posto. Puoi disegnare anche il percorso.", h:"mappa",
     v:"Nella scheda Mappa carichi un'immagine della zona, anche uno screenshot di Google Maps, e trascini ogni postazione al suo posto. Se serve, disegni anche il percorso, con partenza e arrivo."},
    {t:"Stampare", d:"Scarica PDF prepara l'elenco con i volontari; puoi scaricare anche l'immagine della mappa.", h:"pdf",
     v:"Alla fine scarichi il PDF con l'elenco delle postazioni e dei volontari assegnati, e l'immagine della mappa da girare a tutti."}
  ]
},
{
  id:"editorpdf", percorso:["staff"], titolo:"Editor PDF", icona:"ti-file-pencil",
  perche:"Compilare e firmare PDF, e farli firmare a distanza con un link.",
  chi:"Chi ha il permesso Editor PDF.", video:"",
  intro:"L'Editor PDF serve a compilare e firmare un PDF direttamente nel browser, e a farlo firmare a distanza a chi non è in sede.",
  schermo: () => app("altro","Editor PDF", `
    ${tabs(["Documento","Modelli","Firme"])}
    <div class="m-barra" data-h="strumenti">${btn("Testo","","grigio")}${btn("Data","","grigio")}${btn("Spunta","","grigio")}${btn("Firma","","grigio")}${btn("Firma a distanza","","scuro")}</div>
    <div class="m-pdf" data-h="foglio"><div class="m-pdf-righe"></div><div class="m-firma sopra">firma</div></div>
    <div class="m-azioni">${btn("Salva modello","modello","grigio")}${btn("Scarica PDF","","grigio")}${btn("Invia in firma","invia")}</div>`),
  passi:[
    {t:"Gli strumenti", d:"Scegli Testo, Data, Spunta o Firma e tocca il punto del foglio dove metterlo.", h:"strumenti",
     v:"Apri il PDF, scegli uno strumento, testo, data, spunta o firma, e tocchi il punto del foglio dove metterlo."},
    {t:"La firma", d:"Firma con il dito o con il mouse, oppure carica un'immagine. Le firme salvate le ritrovi in Firme.", h:"foglio",
     v:"Per firmare usi il dito o il mouse, oppure carichi l'immagine della firma. Quelle che salvi le ritrovi nella scheda Firme."},
    {t:"Modelli", d:"Un modulo che usi spesso salvalo come modello: la prossima volta è già pronto.", h:"modello",
     v:"Se è un modulo che usi spesso, salvalo come modello: la prossima volta lo ritrovi pronto, con i campi già al loro posto."},
    {t:"Firma a distanza", d:"Metti un campo Firma a distanza e premi Invia in firma: crei un link valido 24 ore, 48, 72 o 7 giorni, da mandare via WhatsApp o email.", h:"invia",
     v:"Se deve firmare qualcuno che non è lì, metti un campo Firma a distanza e premi Invia in firma. Scegli quanto deve durare il link, da ventiquattro ore a sette giorni, e lo mandi via WhatsApp o email. Quella persona firma dal telefono, senza account."}
  ]
},
{
  id:"convocazioni", percorso:["staff"], titolo:"Generatore convocazioni", icona:"ti-mail",
  perche:"Convocazioni in PDF con ordine del giorno, destinatari e invito in calendario.",
  chi:"Chi ha il permesso Convocazioni.", video:"",
  intro:"Il Generatore convocazioni prepara le convocazioni delle riunioni in PDF, già impaginate.",
  schermo: () => app("altro","Generatore convocazioni", `
    <div class="m-griglia2"><div class="m-box" data-h="odg"><div class="m-box-t">Ordine del giorno</div><div class="m-riga">1. Approvazione verbale</div><div class="m-riga">2. Programma esercitazioni 2027</div>${btn("+ Aggiungi punto","","mini")}</div>
    <div class="m-box" data-h="liste"><div class="m-box-t">Liste destinatari</div><div class="m-riga">☑ Consiglio di Sezione</div><div class="m-riga">☐ Capisquadra</div>${btn("Nuova lista","","mini")}</div></div>
    <div class="m-azioni">${btn("Aggiungi a Google Calendar","calendario","grigio")}${btn("Scarica .ics","","grigio")}${btn("Scarica PDF","pdf")}</div>`),
  passi:[
    {t:"I dati", d:"Nuova convocazione: data, ora, luogo e oggetto della riunione.", h:"odg",
     v:"Con Nuova convocazione inserisci data, ora, luogo e oggetto della riunione."},
    {t:"Ordine del giorno", d:"Aggiungi i punti uno per uno.", h:"odg",
     v:"Poi scrivi l'ordine del giorno, un punto alla volta."},
    {t:"Destinatari", d:"Scegli una o più liste di destinatari. Le liste si creano una volta e si riusano.", h:"liste",
     v:"Scegli a chi va, usando le liste di destinatari. Le crei una volta e le riusi ogni volta."},
    {t:"PDF e calendario", d:"Scarica il PDF pronto da mandare, e aggiungi la riunione a Google Calendar o scarica il file .ics.", h:"pdf",
     v:"Alla fine scarichi il PDF, già impaginato, e con un clic aggiungi la riunione a Google Calendar, o scarichi il file per gli altri calendari. Le ultime convocazioni restano nello storico."}
  ]
},
{
  id:"visite", percorso:["staff"], titolo:"Visite mediche", icona:"ti-heart",
  perche:"Lo stato delle visite mediche di tutti i volontari, con esportazione in PDF.",
  chi:"Chi ha il permesso Visite mediche.", video:"",
  intro:"In Visite mediche vedi a colpo d'occhio a che punto è ogni volontario con la visita.",
  schermo: () => app("altro","Visite mediche", `
    <div class="m-barra">${cerca("Cerca per nome, CF o note")}<span class="m-sp"></span>${btn("Esporta PDF","pdf")}</div>
    ${tab([["Volontario","Stato","Esito","Scadenza","Note"],["Rossi Mario",tag("Completata","v"),"<span data-h='esito'>Idoneo</span>","03/2027","<span data-h='note'>Portare esami del sangue</span>"],["Bianchi Laura",tag("Da Fare","r"),"—","—",""],["Verdi Paolo",tag("Verifica","g"),"Idoneo con Prescrizioni",tag("In scadenza","g"),""]],"elenco")}`),
  passi:[
    {t:"Gli stati", d:"Completata, Da Fare, Verifica, Solo Esami, Esonero o Non impostato.", h:"elenco",
     v:"Ogni volontario ha uno stato: completata, da fare, verifica, solo esami, esonero, oppure non impostato se nessuno l'ha ancora indicato."},
    {t:"Esito e scadenza", d:"Esito visita: Idoneo, Idoneo con Limitazioni, Idoneo con Prescrizioni o Inidoneo. La Scadenza si compila solo se serve: quando è vicina o passata compare In scadenza o Scaduto.", h:"esito",
     v:"Accanto allo stato scegli l'esito della visita: idoneo, idoneo con limitazioni, idoneo con prescrizioni, oppure inidoneo. Se la visita ha una scadenza la inserisci nella colonna Scadenza: quando si avvicina, o è già passata, la pagina te lo segnala."},
    {t:"Le note", d:"Nella colonna Note scrivi un appunto per ogni volontario: si salva quando esci dal campo. La ricerca trova anche le note.", h:"note",
     v:"Accanto a ogni volontario c'è il campo Note, dove puoi scrivere un appunto, per esempio cosa deve portare alla visita. Si salva da solo quando passi ad altro. E se cerchi una parola, la pagina guarda anche dentro le note."},
    {t:"Esportare", d:"Esporta PDF: scegli quali stati e colonne includere, ed eventualmente un intervallo di date.", h:"pdf",
     v:"Con Esporta PDF prepari l'elenco da mandare al medico o all'ufficio: scegli quali stati includere, quali colonne, e se vuoi un intervallo di date."}
  ]
},
{
  id:"formazione", percorso:["staff"], titolo:"Formazione", icona:"ti-school",
  perche:"Il registro dei corsi fatti dai volontari.",
  chi:"Chi ha il permesso Formazione.", video:"",
  intro:"Formazione è il registro di tutti i corsi fatti dai volontari.",
  schermo: () => app("altro","Formazione", `
    <div class="m-barra">${cerca("Cerca volontario o corso","cerca")}<span class="m-sp"></span>${btn("Catalogo","catalogo","grigio")}${btn("Importa da Drive","drive","grigio")}${btn("Registra corso","nuovo")}</div>
    <div class="m-modale" data-h="dash"><div class="m-box-t">Corso 12 ore · 37 in regola su 68</div><div class="m-campi"><span>Mai fatto <b>${tag("15","r")}</b></span><span>Scaduto <b>${tag("15","r")}</b></span><span>Senza attestato <b>${tag("1","g")}</b></span></div></div>
    ${tab([["Corso o abilitazione","Volontari","Validità"],["Corso 12 ore","55","5 anni"],["PLE – Piattaforme di lavoro elevabili","6","5 anni"],["Gru per autocarro","4","5 anni"]],"elenco")}`),
  passi:[
    {t:"Cercare", d:"Cerca per volontario o corso.", h:"cerca",
     v:"Cerchi per nome del volontario oppure per nome del corso."},
    {t:"Corsi obbligatori", d:"In alto, un riquadro per Corso 4 ore, 12 ore e Caposquadra (solo per i capisquadra): quanti sono in regola e i contatori Mai fatto, Scaduto, In scadenza, Senza attestato. Tocca un contatore per l'elenco dei nomi; Copia nomi li mette negli appunti.", h:"dash",
     v:"In cima alla pagina trovi la situazione dei corsi obbligatori: il 4 ore e il 12 ore per tutti, il caposquadra solo per chi è caposquadra. Per ognuno vedi quanti sono in regola e quanti non l'hanno mai fatto, l'hanno scaduto o sono senza attestato. Tocchi il numero e ti compare l'elenco dei nomi; da lì apri la scheda del volontario, oppure con Copia nomi li incolli dove ti servono, per esempio per un'iscrizione."},
    {t:"Un blocco per corso", d:"Ogni corso o abilitazione del catalogo è un blocco. Dentro, una riga per volontario: data dell'ultimo corso, date precedenti, pulsante Attestato per aprire il PDF (un trattino se manca, da cercare) e stato: Valido, In scadenza (entro 60 giorni) o Scaduto. Con Modifica cambi il nome del corso.", h:"elenco",
     v:"Ogni corso o abilitazione è un blocco unico, anche se sugli attestati il nome è scritto in modi diversi. Aprendolo trovi una riga per volontario: la data dell'ultimo corso, le date di quelli precedenti, e il pulsante Attestato che apre il PDF. Se al posto del pulsante c'è un trattino, l'attestato non è in archivio e va cercato. In fondo vedi lo stato: valido, in scadenza o scaduto. Con Modifica puoi cambiare il nome del corso."},
    {t:"Registra corso", d:"Scegli il corso dal catalogo e i volontari: compare anche nella loro scheda. Se la scadenza resta vuota la calcola dalla validità.", h:"nuovo",
     v:"Con Registra corso scegli il corso dal catalogo e i volontari che l'hanno fatto, e compare in automatico anche nella loro scheda. Se lasci vuota la scadenza, viene calcolata dalla validità del corso. Se il corso non c'è, scegli Nuova voce di catalogo."},
    {t:"Catalogo", d:"Elenco ufficiale di corsi e abilitazioni: nome, validità e parole chiave per riconoscere i titoli. Le voci doppie si uniscono, non si cancellano. Da verificare raccoglie le abilitazioni non riconosciute.", h:"catalogo",
     v:"Il Catalogo è l'elenco ufficiale dei corsi e delle abilitazioni. Per ogni voce imposti il nome, quanti anni vale e le parole chiave che servono a riconoscere i titoli degli attestati. Se trovi due voci doppie, le unisci. In Da verificare finiscono le abilitazioni che non sono state riconosciute: aggiungi le parole chiave giuste e premi Riapplica."},
    {t:"Importa da Drive", d:"Legge gli attestati archiviati su Google Drive e porta nel registro data e scadenza dei corsi 4 ore, 12 ore, Caposquadra e DAE, più le abilitazioni. Rilancialo quando aggiungi file: quelli già importati vengono saltati.", h:"drive",
     v:"Con Importa da Drive il registro si riempie da solo con gli attestati archiviati su Google Drive: data e scadenza dei corsi 4 ore, 12 ore, caposquadra e DAE, e tutte le abilitazioni. Quando aggiungi nuovi file su Drive, rilancialo: quelli già importati vengono saltati, quindi non si creano doppioni."}
  ]
},
{
  id:"aggiornamento-dati", percorso:["staff"], titolo:"Aggiornamento dati", icona:"ti-refresh",
  perche:"Far aggiornare ai volontari anagrafica, foto, documenti e taglie con un link personale, e controllare quello che inviano.",
  chi:"Chi ha il permesso Aggiornamento dati.", video:"",
  intro:"Aggiornamento dati serve a far sistemare i dati ai volontari stessi, con un link personale, invece di raccoglierli a mano.",
  schermo: () => app("altro","Aggiornamento dati", `
    <div class="m-griglia2">${box("Da fare",[tag("12","g")+" Foto e documenti in attesa",tag("8","r")+" Documenti mancanti",tag("15","g")+" DPI da fare"],"riepilogo")}
    ${box("Link per il volontario",["Rossi Mario · "+btn("Invia su WhatsApp","","mini")+" "+btn("Condividi","","mini")],"link")}</div>
    <div class="m-azioni">${btn("Catalogo DPI","catalogo","grigio")}${btn("Esporta CSV","","grigio")}${btn("Moduli cartacei","moduli","grigio")}</div>`),
  passi:[
    {t:"Il link", d:"Crea il link personale e mandalo su WhatsApp o condividilo. Il volontario conferma con la data di nascita.", h:"link",
     v:"Per ogni volontario crei un link personale e lo mandi su WhatsApp. Lui lo apre, conferma con la data di nascita, e aggiorna dati, foto, documenti e taglie."},
    {t:"Da controllare", d:"Quello che arriva non va direttamente in scheda: lo controlli tu da Foto e documenti in attesa e Da verificare.", h:"riepilogo",
     v:"Quello che il volontario invia non finisce subito nella sua scheda: aspetta che tu lo controlli. Qui vedi quanti sono in attesa, i documenti mancanti, e le taglie da gestire. Se il volontario ha confermato la foto che c'era già, nella proposta trovi la scritta Foto confermata dal volontario: non c'è niente da approvare."},
    {t:"Catalogo DPI", d:"I capi tra cui scegliere la taglia si gestiscono nel Catalogo DPI. Esporta CSV per gli ordini.", h:"catalogo",
     v:"I capi di cui chiedere la taglia li gestisci nel Catalogo DPI. E quando devi fare un ordine, Esporta CSV ti dà l'elenco delle taglie."},
    {t:"Modulo cartaceo", d:"Per chi non usa il link: Moduli cartacei crea uno ZIP con un PDF per ogni volontario dell'elenco (attivi e sospesi). Dalla scheda c'è anche Modulo cartaceo (PDF) per uno solo. Stampa su carta intestata, fai compilare e firmare, poi Carica modulo compilato: resta Modulo da registrare finché non riporti i dati e premi Segna registrato.", h:"moduli",
     v:"Per chi non usa il telefono c'è il modulo di carta. Moduli cartacei prepara un PDF per ogni volontario dell'elenco, tutti in un file ZIP; dalla scheda del volontario puoi farne anche uno solo. Lo stampi sulla carta intestata, il volontario lo compila a mano e firma. Poi lo scansioni e lo carichi con Carica modulo compilato: resta segnato come Modulo da registrare finché non hai riportato i dati in scheda e premuto Segna registrato."}
  ]
},
{
  id:"verifica-piattaforme", percorso:["staff"], titolo:"Verifica piattaforme", icona:"ti-table",
  perche:"Il controllo di ogni anno: confrontare i dati del portale con quelli di PIA e Volter e decidere, persona per persona, quale valore è giusto.",
  chi:"Chi ha il permesso Aggiornamento dati.", video:"",
  intro:"Verifica piattaforme mette uno accanto all'altro i dati del portale, di PIA e di Volter, e ti fa vedere solo dove non coincidono.",
  schermo: () => app("altro","Verifica piattaforme", `
    <div class="m-griglia2">${box("File da confrontare",["PIA · pia_volontari.json "+tag("caricato","b"),"Volter · report volontari "+tag("caricato","b"),btn("Copia script","script","mini")],"file")}
    ${box("Rossi Mario",["Indirizzo · Portale: Via Roma 12 · PIA: V. Roma 12 · Volter: Via Roma 14","Valore da usare: "+tag("Via Roma 12","g"),btn("Segna come verificato","","mini")+" "+btn("Da chiedere al volontario","","mini")],"scheda")}</div>
    <div class="m-azioni">${btn("Da decidere","filtri","grigio")}${btn("Applica i suggerimenti","sugg","grigio")}${btn("Applica al portale","applica")}${btn("Resoconto PDF","pdf","grigio")}</div>`),
  passi:[
    {t:"I file", d:"Carica il file di PIA (lo crea lo script: Copia script, poi incollalo nella console di PIA, Schede Volontari) e il report volontari di Volter; la rubrica di Volter è facoltativa e serve per telefoni ed email. I file restano sul tuo computer.", h:"file",
     v:"Per prima cosa carichi i file. Quello di PIA lo prepari con lo script che trovi nella pagina: premi Copia script, entri in PIA nelle Schede Volontari, premi F12 e lo incolli nella console. Poi carichi il report volontari di Volter, e se vuoi anche la rubrica per telefoni ed email. Non preoccuparti: i file non vanno su internet, restano sul tuo computer."},
    {t:"Decidere", d:"Per ogni differenza tocca il valore giusto tra Portale, PIA e Volter, oppure scrivi un altro valore. Le scelte si salvano da sole. Il valore suggerito ha il bordo tratteggiato.", h:"scheda",
     v:"A sinistra hai l'elenco delle persone, a destra la scheda con i tre valori uno accanto all'altro. Dove non coincidono tocchi quello giusto, o ne scrivi un altro. Quando due fonti su tre sono d'accordo, la pagina te lo suggerisce con un bordo tratteggiato. Non c'è niente da salvare: lo fa da sola."},
    {t:"Filtri e suggerimenti", d:"I filtri mostrano chi è da decidere, da chiedere, verificato o manca in una fonte. Applica i suggerimenti sceglie in un colpo il valore suggerito per tutti i campi ancora aperti.", h:"sugg",
     v:"Con i filtri in alto vedi solo chi è ancora da decidere, chi devi chiamare, o chi manca in una delle piattaforme. Se ti fidi dei suggerimenti, Applica i suggerimenti li sceglie tutti in un colpo, e poi controlli solo quello che resta."},
    {t:"Presenza e stato", d:"Sotto la tabella indica se la persona deve essere aggiunta o tolta da una fonte, e se è attiva, sospesa o dimessa. Segna come verificato quando hai finito, o Da chiedere al volontario.", h:"scheda",
     v:"Sotto la tabella dici se una persona va aggiunta o tolta da una piattaforma, e se è attiva, sospesa o dimessa. Quando hai finito con lei premi Segna come verificato; se invece devi sentirla, premi Da chiedere al volontario."},
    {t:"Applica e resoconto", d:"Nel Riepilogo: Applica al portale scrive le correzioni decise, dopo un'anteprima; i dimessi diventano Dimesso, nessuno viene cancellato. Resoconto PDF elenca il fatto e quello che resta da correggere a mano in PIA e Volter.", h:"applica",
     v:"Alla fine vai nel Riepilogo. Applica al portale ti fa vedere l'anteprima e poi scrive tutte le correzioni nel portale; chi è dimesso viene segnato come dimesso, non si cancella nessuno. Con Resoconto PDF hai l'elenco di quello che è fatto e di quello che resta da sistemare a mano in PIA e in Volter."},
    {t:"Gli anni", d:"Ogni anno si riparte da zero con i file nuovi. Gli anni passati si consultano dal menu Anno, in sola lettura.", h:"pdf",
     v:"Ogni anno il controllo riparte da capo, con i file nuovi. Le decisioni degli anni passati restano: le ritrovi scegliendo l'anno, e si possono solo guardare."}
  ]
},
{
  id:"statistiche", percorso:["staff"], titolo:"Statistiche", icona:"ti-chart-bar",
  perche:"Grafici su interventi e ore, da scaricare in PDF.",
  chi:"Chi ha il permesso Statistiche.", video:"",
  intro:"Statistiche riassume l'attività della Sezione in tre grafici.",
  schermo: () => app("altro","Statistiche", `<div class="m-griglia2">${box("Interventi per mese",["<div class='m-barre'><i style='height:40%'></i><i style='height:70%'></i><i style='height:55%'></i><i style='height:90%'></i><i style='height:30%'></i></div>"],"grafici")}${box("Ore per volontario",["Rossi Mario · 112","Verdi Paolo · 98"])}</div><div class="m-azioni">${btn("Scarica PDF","pdf")}</div>`),
  passi:[
    {t:"I grafici", d:"Interventi per mese, interventi per tipo e ore per volontario.", h:"grafici",
     v:"Vedi gli interventi mese per mese, divisi per tipo, e le ore fatte da ogni volontario."},
    {t:"Il PDF", d:"Scarica PDF per relazioni, assemblee e rendiconti.", h:"pdf",
     v:"Con Scarica PDF li hai pronti per una relazione, un'assemblea o un rendiconto."}
  ]
},
{
  id:"segnalazioni-staff", percorso:["staff"], titolo:"Segnalazioni", icona:"ti-flag",
  perche:"Le segnalazioni di errori che i volontari mandano dalla loro scheda.",
  chi:"Chi ha il permesso Segnalazioni.", video:"",
  intro:"Qui arrivano le segnalazioni dei volontari che hanno trovato un errore nella loro scheda.",
  schermo: () => app("altro","Segnalazioni", tab([["Data","Volontario","Messaggio","Stato"],["28/10/2026","Rossi Mario","Il numero di telefono è cambiato",tag("Da gestire","g")+" "+btn("Segna come risolta","","mini")],["02/09/2026","Bianchi Laura","Manca l'attestato del corso base",tag("Risolta","b")]],"elenco")),
  passi:[
    {t:"Gestire", d:"Leggi la segnalazione, correggi la scheda del volontario e premi Segna come risolta. Puoi aggiungere una nota, o riaprirla.", h:"elenco",
     v:"Leggi cosa ha scritto il volontario, correggi la sua scheda in Volontari, e premi Segna come risolta. Il volontario la vede risolta nella sua pagina. Se serve, puoi aggiungere una nota o riaprirla."}
  ]
},
{
  id:"richieste", percorso:["staff"], titolo:"Richieste", icona:"ti-inbox",
  perche:"Le richieste di adesione arrivate dal modulo del sito pubblico.",
  chi:"Chi ha il permesso Richieste.", video:"",
  intro:"In Richieste arrivano le domande di chi vuole entrare in Sezione, dal modulo sul sito pubblico.",
  schermo: () => app("altro","Richieste adesione", `<p class="m-sotto">Arrivano dal modulo sul sito pubblico.</p>`+tab([["Data","Nome","Contatti","Stato"],["30/10/2026","Giulia Verdi","giulia@email.it · 333…",tag("Nuova","g")]],"elenco")),
  passi:[
    {t:"Le richieste", d:"Nome, contatti e messaggio di chi vuole aderire. Contattalo e segna la richiesta come letta.", h:"elenco",
     v:"Per ogni richiesta hai nome, contatti e messaggio. Contatti la persona, e segni la richiesta come letta. Le nuove compaiono anche in Home."}
  ]
},
{
  id:"db", percorso:["staff"], titolo:"DB avanzato", icona:"ti-table",
  perche:"La tabella completa dei volontari, per modifiche di massa e controlli.",
  chi:"Solo chi ha il permesso DB.", video:"",
  intro:"Il DB avanzato mostra tutti i dati dei volontari in un'unica tabella, come un foglio Excel. È potente, quindi va usato con attenzione.",
  schermo: () => app("altro","DB avanzato", `<div class="m-barra">${cerca("Cerca nel database")}<span class="m-sp"></span>${btn("Colonne","colonne","grigio")}${btn("Verifica CF","cf","grigio")}${btn("+ Aggiungi record","")}</div>`+tab([["Cognome","Nome","CF","Squadra","Telefono"],["Rossi","Mario","RSSMRA80…","CASALE","333…"],["Bianchi","Laura","BNCLRA85…","COLLINA","347…"]],"tabella")),
  passi:[
    {t:"La tabella", d:"Tutti i volontari con tutti i campi, modificabili direttamente. Ogni modifica è definitiva: attenzione.", h:"tabella",
     v:"Qui vedi tutti i volontari con tutti i campi, e li puoi modificare direttamente nella tabella. Comodo per le correzioni di massa, ma ogni modifica è subito definitiva: meglio usare la scheda in Volontari per il lavoro di tutti i giorni."},
    {t:"Colonne", d:"Scegli quali colonne vedere.", h:"colonne",
     v:"Con Colonne scegli quali campi mostrare, così la tabella resta leggibile."},
    {t:"Verifica CF", d:"Controlla tutti i codici fiscali e segnala quelli sbagliati.", h:"cf",
     v:"E Verifica CF controlla in un colpo tutti i codici fiscali, e ti segnala quelli che non tornano."}
  ]
},
{
  id:"accessi", percorso:["staff"], titolo:"Registro accessi", icona:"ti-shield",
  perche:"Chi è entrato nell'Area Riservata e quando.",
  chi:"Chi ha il permesso Registro accessi.", video:"",
  intro:"Il Registro accessi tiene traccia di chi entra nell'Area Riservata.",
  schermo: () => app("altro","Registro accessi", `<div class="m-barra">${cerca("Cerca per nome, CF o ruolo")}</div>`+tab([["Data e ora","Nome","Ruolo"],["01/11/2026 09:12","Bianchi Laura","standard"],["31/10/2026 21:40","Rossi Mario","volontario"]],"elenco")),
  passi:[
    {t:"Il registro", d:"Ogni accesso con data, ora, nome e ruolo. Cerca per nome, CF o ruolo.", h:"elenco",
     v:"Ogni accesso è registrato, con data, ora, nome e ruolo. Puoi cercare una persona per nome, codice fiscale o ruolo."}
  ]
},
{
  id:"gestione-accessi", percorso:["staff"], titolo:"Gestione accessi", icona:"ti-key",
  perche:"Chi può entrare, con quale email, e con quali permessi.",
  chi:"Solo il master.", video:"",
  intro:"Gestione accessi è riservata al master: da qui si decide chi entra e cosa può fare.",
  schermo: () => app("altro","Gestione accessi", `<div class="m-barra"><span class="m-sp"></span>${btn("Aggiungi staff","nuovo")}</div>
    ${tab([["Persona","Email di accesso","Tipo"],["Bianchi Laura","laura@…","standard"],["Rossi Mario","mario@…","volontario"]],"elenco")}
    <div class="m-modale" data-h="permessi"><div class="m-box-t">Permessi di Bianchi Laura</div><div class="m-campi"><span>Volontari <b>☑</b></span><span>Interventi <b>☑</b></span><span>Eventi <b>☐</b></span><span>Dotazioni <b>☑</b></span></div></div>`),
  passi:[
    {t:"Le email di accesso", d:"Per entrare, l'email di una persona deve essere abilitata qui. Ci sono anche i volontari senza email, da completare.", h:"elenco",
     v:"Per entrare, l'email di una persona deve essere abilitata qui. Se a qualcuno compare Questa mail non è abilitata, è qui che devi intervenire. C'è anche l'elenco dei volontari senza email, da completare."},
    {t:"Aggiungi staff", d:"Lo staff ha accesso alle pagine di gestione, in base ai permessi.", h:"nuovo",
     v:"Con Aggiungi staff dai a una persona l'accesso alla parte di gestione."},
    {t:"I permessi", d:"Con la matrice dei permessi scegli pagina per pagina cosa vede ognuno.", h:"permessi",
     v:"E con la matrice dei permessi scegli, pagina per pagina, cosa può vedere e fare ognuno. Chi non ha il permesso di una pagina, non la vede nemmeno nel menu."}
  ]
},
{
  id:"impostazioni", percorso:["staff"], titolo:"Impostazioni", icona:"ti-settings",
  perche:"Messaggi del bot, liste degli eventi, campi della scheda volontario, categorie delle dotazioni.",
  chi:"Chi ha il permesso Impostazioni.", video:"",
  intro:"In Impostazioni ci sono le regolazioni che valgono per tutta l'Area Riservata.",
  schermo: () => app("altro","Impostazioni", `<div class="m-griglia2">
    ${box("Bot Telegram",["Messaggi ai volontari collegati al bot. "+btn("Invia messaggio","","mini")],"bot")}
    ${box("Campi volontari",["Gestisci i campi aggiuntivi della scheda volontario. "+btn("+ Nuovo campo","","mini")],"campi")}
    ${box("Liste degli eventi",["Tipologie ed esigenze alimentari"],"liste")}
    ${box("Categorie dotazioni",["Gestisci categorie e sottocategorie dell'inventario."],"categorie")}</div>`),
  passi:[
    {t:"Bot Telegram", d:"Invia un messaggio a tutti i volontari collegati al bot.", h:"bot",
     v:"Da qui puoi mandare un messaggio a tutti i volontari collegati al bot Telegram."},
    {t:"Campi volontari", d:"Aggiungi campi alla scheda volontario: testo, sì o no, data o numero, in una delle sezioni della scheda.", h:"campi",
     v:"Se alla scheda volontario serve un dato in più, per esempio la taglia della divisa, lo aggiungi qui come nuovo campo, scegliendo il tipo e la sezione della scheda dove metterlo."},
    {t:"Liste e categorie", d:"Le liste usate negli Eventi e le categorie delle Dotazioni.", h:"liste",
     v:"E qui gestisci le liste usate negli eventi, come tipologie ed esigenze alimentari, e le categorie dell'inventario delle dotazioni."}
  ]
}
];
