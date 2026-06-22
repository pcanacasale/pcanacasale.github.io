// ============================================================
// config.js — UNICO FILE DA MODIFICARE PER OGNI INSTALLAZIONE
//
// 1. Crea un progetto su https://supabase.com (gratuito)
// 2. Copia URL e anon key da Project Settings → API
// 3. Imposta i dati della tua unità qui sotto
// 4. Carica i 3 file su GitHub Pages
// 5. Esegui setup.sql nel SQL Editor di Supabase
// ============================================================

const APP_CONFIG = {
  supabase: {
    url: 'https://INSERISCI-URL.supabase.co',
    key: 'INSERISCI-ANON-KEY',
  },
  unita: {
    nome:   'La Mia Unità',          // nome completo
    sigla:  'LA MIA UNITÀ',          // maiuscolo, usato nella sidebar
    logo:   'images/logo.png',       // percorso relativo al logo
    colore: '#1a7a4a',               // colore primario (hex)
  }
};
