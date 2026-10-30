// Lettura del bollettino di allerta ARPA Piemonte in formato CAP-XML (OASIS CAP 1.2).
// Un <info> per zona; livelli nei <parameter> RISCHIO_1224 e RISCHIO_2436, cioè il
// giorno di emissione e il successivo.
//
// Mai dedurre un verde: un valore non riconosciuto resta SCONOSCIUTO e un file che
// non contiene la zona è un errore, così in cache resta l'ultimo dato buono.

export type Livello = 'VERDE' | 'GIALLO' | 'ARANCIONE' | 'ROSSO' | 'BIANCO' | 'SCONOSCIUTO';

export function normalizzaLivello(v: string | null | undefined): Livello {
  const s = (v || '').trim().toUpperCase();
  if (s === 'VERDE') return 'VERDE';
  if (s === 'GIALLO' || s === 'GIALLA') return 'GIALLO';
  if (s === 'ARANCIONE') return 'ARANCIONE';
  if (s === 'ROSSO' || s === 'ROSSA') return 'ROSSO';
  if (s === 'BIANCO') return 'BIANCO'; // non valutato
  return 'SCONOSCIUTO';
}

function testo(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp('<' + nome + '>([\\s\\S]*?)</' + nome + '>'));
  return m ? testo(m[1]) : null;
}

export function leggiBollettino(xml: string, zona: string) {
  if (!xml.includes('urn:oasis:names:tc:emergency:cap:')) throw new Error('il file non è un CAP-XML');
  const blocchi = xml.match(/<info>[\s\S]*?<\/info>/g) || [];
  const info = blocchi.find(b => tag(b, 'areaDesc') === zona);
  if (!info) throw new Error('zona ' + zona + ' non trovata nel bollettino');

  const parametri: Record<string, string> = {};
  for (const m of info.matchAll(/<valueName>([\s\S]*?)<\/valueName>\s*<value>([\s\S]*?)<\/value>/g)) {
    parametri[testo(m[1])] = testo(m[2]);
  }
  const rischio = (nome: string) => ({
    g0: normalizzaLivello(parametri[nome + '_1224']),
    g1: normalizzaLivello(parametri[nome + '_2436']),
  });

  const emesso = tag(xml, 'sent');
  const dal = tag(info, 'onset');
  const al = tag(info, 'expires');
  if (!emesso || !dal || !al) throw new Error('date del bollettino mancanti');

  const effetti = parametri['EFFETTI SUL TERRITORIO'] || '';
  return {
    zona,
    numero_bollettino: tag(xml, 'identifier'),
    emesso_il: emesso,
    valido_dal: dal,
    valido_al: al,
    evento: tag(info, 'event'),
    effetti: effetti === '-' ? null : effetti || null,
    rischi: {
      idrogeologico: rischio('IDROGEOLOGICO'),
      idraulico: rischio('IDRAULICO'),
      temporali: rischio('TEMPORALI'),
      neve: rischio('NEVE'),
    },
  };
}
