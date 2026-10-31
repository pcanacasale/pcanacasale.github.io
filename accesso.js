// Accesso con Google o codice via email (Supabase Auth), prefisso au*.
// Affianca il vecchio accesso con password: chi entra da qui ha una sessione che resta dopo
// il ricaricamento, e le chiamate REST usano il suo token (H e HJ vengono aggiornati sul posto).
// Il profilo arriva dalla funzione SQL mio_profilo.

const AU_CHIAVE = 'pcana-auth';
const auClient = window.supabase
  ? window.supabase.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: AU_CHIAVE } })
  : null;

let auUtente = null;    // id Supabase Auth di chi è già dentro
let auInCorso = null;   // id di cui si sta leggendo il profilo
let auEmail = '';

function auEl(id) { return document.getElementById(id); }

function auVista(nome) {
  ['Nuovo', 'Vecchio', 'Attesa', 'Avviso'].forEach(v => { auEl('au' + v).hidden = v.toLowerCase() !== nome; });
  auEl('loginError').style.display = 'none';
}

function auErrore(testo) {
  const err = auEl('loginError');
  err.textContent = testo;
  err.style.display = 'block';
}

function auTraduci(e) {
  const c = e.code || '';
  if (e.status === 429 || c.indexOf('rate_limit') !== -1) return 'Troppi tentativi. Attendi qualche minuto e riprova.';
  if (c === 'otp_expired' || c === 'invalid_credentials') return 'Codice errato o scaduto.';
  if (c === 'email_address_invalid' || c === 'validation_failed') return 'Indirizzo email non valido.';
  if (e.name === 'AuthRetryableFetchError' || !e.status) return 'Errore di connessione. Riprova.';
  return 'Accesso non riuscito. Riprova.';
}

// -- ACCESSO --
async function auGoogle() {
  const { error } = await auClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) auErrore(auTraduci(error));
}

async function auInviaCodice() {
  const email = auEl('auEmail').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { auErrore('Indirizzo email non valido.'); return; }
  const btn = auEl('auBtnInvia');
  auEl('loginError').style.display = 'none';
  btn.disabled = true;
  const { error } = await auClient.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  btn.disabled = false;
  if (error) { auErrore(auTraduci(error)); return; }
  auEmail = email;
  auEl('auCodice').value = '';
  auEl('auCodiceInfo').textContent = 'Abbiamo inviato il codice a ' + email + '.';
  auEl('auPassoEmail').hidden = true;
  auEl('auPassoCodice').hidden = false;
  auEl('auCodice').focus();
}

async function auVerificaCodice() {
  const token = auEl('auCodice').value.trim();
  if (!/^\d{6}$/.test(token)) { auErrore('Inserisci le 6 cifre del codice.'); return; }
  const btn = auEl('auBtnVerifica');
  auEl('loginError').style.display = 'none';
  btn.disabled = true;
  const { error } = await auClient.auth.verifyOtp({ email: auEmail, token, type: 'email' });
  btn.disabled = false;
  if (error) auErrore(auTraduci(error));
  // Se va bene, prosegue onAuthStateChange
}

function auCambiaEmail() {
  auEl('auPassoCodice').hidden = true;
  auEl('auPassoEmail').hidden = false;
  auEl('loginError').style.display = 'none';
  auEl('auEmail').focus();
}

// -- SESSIONE --
function auImpostaToken(session) {
  const bearer = 'Bearer ' + (session ? session.access_token : SUPA_KEY);
  H.Authorization = bearer;
  HJ.Authorization = bearer;
}

// Token aggiornato per le funzioni protette; null con il vecchio accesso
async function auToken() {
  if (!auClient) return null;
  const { data } = await auClient.auth.getSession();
  return data.session ? data.session.access_token : null;
}

function auAvviso(testo, riprova) {
  auEl('auAvvisoTesto').textContent = testo;
  auEl('auBtnRiprova').hidden = !riprova;
  auVista('avviso');
}

function auUtenteDaProfilo(p, session) {
  const vol = p.tipo === 'volontario';
  const volontarioId = p.volontarioId != null ? p.volontarioId : p.volontario_id;
  return {
    id: vol ? 'vol_' + volontarioId : (p.id || session.user.id),
    volontario_id: volontarioId,   // nome usato dal resto dell'app
    volontarioId,
    nome: [p.cognome, p.nome].filter(Boolean).join(' ') || session.user.email,
    ruolo: p.ruolo || (vol ? 'Volontario' : p.tipo === 'master' ? 'Master' : 'Standard'),
    tipo_accesso: p.tipo,
    permessi: vol ? { galleria: true, scheda_personale: true, segnalazioni: true } : (p.permessi || {}),
  };
}

async function auApplica(session) {
  auImpostaToken(session);
  if (!session) { if (auUtente) logout(); return; }
  const id = session.user.id;
  if (id === auUtente || id === auInCorso) return;   // SIGNED_IN torna anche quando si rientra nella scheda
  auInCorso = id;
  auVista('attesa');
  const { data, error } = await auClient.rpc('mio_profilo');
  if (auInCorso !== id) return;   // nel frattempo è uscito
  auInCorso = null;
  if (error) { auAvviso('Non riesco a verificare il tuo accesso. Riprova tra poco.', true); return; }
  const p = Array.isArray(data) ? data[0] : data;
  if (!p || !p.tipo) { auAvviso('Questa mail non è abilitata. Contatta la segreteria.', false); return; }
  auUtente = id;
  currentUser = auUtenteDaProfilo(p, session);
  const primaVolta = !sessionStorage.getItem('au_entrato');
  if (primaVolta) {
    await logAttivita('ha effettuato il login');
    logAccesso(p.tipo === 'volontario' ? 'volontario' : 'admin', p.tipo === 'volontario' ? currentUser.volontario_id : null, currentUser.nome);
  }
  avviaDashboard();
  sessionStorage.setItem('au_entrato', '1');
}

async function auRiprova() {
  const { data } = await auClient.auth.getSession();
  await auApplica(data.session);
  if (!data.session) auVista('nuovo');
}

// Chiamata da logout() e dal pulsante Esci
async function auEsci() {
  auUtente = null;
  auInCorso = null;
  sessionStorage.removeItem('au_entrato');
  auImpostaToken(null);
  auCambiaEmail();
  auVista('nuovo');
  if (!auClient) { auVista('vecchio'); return; }
  const { error } = await auClient.auth.signOut();
  if (error) { try { localStorage.removeItem(AU_CHIAVE); } catch(e) {} }  // senza rete la sessione non resta sul dispositivo
}

// -- AVVIO --
document.addEventListener('DOMContentLoaded', async function() {
  if (!auClient) { auVista('vecchio'); auErrore('Accesso con Google e via email non disponibile: usa la password.'); return; }

  // Google rimanda qui gli errori (es. accesso annullato) nell'indirizzo
  if (/error_description=/.test(location.hash + location.search)) {
    auErrore('Accesso con Google non riuscito. Riprova.');
    history.replaceState(null, '', location.pathname);
  }

  // Il rinvio con setTimeout evita di chiamare Supabase dentro il suo stesso callback
  auClient.auth.onAuthStateChange((evento, session) => {
    if (evento !== 'INITIAL_SESSION') setTimeout(() => auApplica(session), 0);
  });
  const { data } = await auClient.auth.getSession();
  if (data.session) await auApplica(data.session);
});
