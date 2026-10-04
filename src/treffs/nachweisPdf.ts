import { dateiname, sortiereZeilen, type NachweisZeile } from './nachweis';

/**
 * PDF des Stundennachweises – im Aussehen wie in der bisherigen App: eine feste DIN-A4-Seite (210 × 297 mm) mit Überschrift,
 * den Feldern „Im Jugendtreff / Kindertreff“, „Monat / Jahr“ und „Name“, der Tabelle Datum · Zeiten · Stunden mit Gesamtsumme,
 * der Unterschrift ganz unten und dem Hinweis unter der gestrichelten Linie.
 * Die Seite wird als HTML mit eigenem Stil aufgebaut, in ein Bild gerendert (html2canvas) und als PDF abgelegt (jsPDF).
 * Beide Bibliotheken werden erst beim Klick geladen.
 */

export interface NachweisPdfDaten {
  treff: string;
  monat: string;          // "JJJJ-MM-01"
  vorname: string;
  nachname: string;
  zeilen: Pick<NachweisZeile, 'id' | 'datum' | 'zeiten' | 'stunden' | 'quelle'>[];
  unterschrift: string | null;
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "2026-08-01" → "August 2026" */
export const pdfMonat = (monat: string) => `${MONATE[Number(monat.slice(5, 7)) - 1] ?? ''} ${monat.slice(0, 4)}`;
/** "2026-08-05" → "05.08." */
export const pdfDatum = (datum: string) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;
/** 3.5 → "3,5"; ohne Wert leer */
export const pdfStunden = (h: number | null) => (h === null ? '' : h.toLocaleString('de-DE', { maximumFractionDigits: 2 }));
/** Summe wie im Formular: keine Stunden → "0" */
export const pdfSumme = (zeilen: Pick<NachweisZeile, 'stunden'>[]) => {
  const s = zeilen.reduce((n, z) => n + (z.stunden ?? 0), 0);
  return s ? s.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '0';
};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const NACHWEIS_PDF_CSS = `
  .tz-print-page {
    width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden;
    padding: 18mm 16mm; background: #fff; color: #111;
    font-family: Arial, Calibri, 'Helvetica Neue', Helvetica, sans-serif;
    display: flex; flex-direction: column;
  }
  .tz-print-page h2 { font-size: 21px; font-weight: 700; margin: 0 0 16px; }
  .tz-print-line { display: flex; align-items: baseline; gap: 8px; font-size: 13px; margin-bottom: 10px; }
  .tz-print-line b { flex-shrink: 0; font-weight: 700; }
  .tz-print-line .tz-fill { flex: 1; border-bottom: 1px solid #000; padding: 0 4px 3px; min-height: 16px; }
  .tz-print-line .tz-fill.tz-fill-narrow { flex: 0 0 200px; }
  .tz-print-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; table-layout: fixed; }
  .tz-print-table th, .tz-print-table td { border: 1px solid #000; padding: 5px 7px; text-align: left; word-wrap: break-word; overflow-wrap: break-word; }
  .tz-print-table th { font-weight: 700; background: #f2f2f2; }
  .tz-print-table td.tz-num, .tz-print-table th.tz-num { text-align: right; white-space: nowrap; }
  .tz-print-table tfoot td { font-weight: 700; }
  .tz-print-spacer { flex: 1 1 auto; min-height: 10px; }
  .tz-print-sign-box { width: 260px; }
  .tz-print-sign-value { font-size: 13px; min-height: 20px; margin-bottom: 2px; padding: 0 2px; }
  .tz-print-sign-line { border-top: 1px solid #000; padding-top: 4px; font-style: italic; font-weight: 700; font-size: 12.5px; }
  .tz-print-hr { border-top: 1px dashed #000; margin: 16px 0 8px; }
  .tz-print-hint { font-size: 10.5px; color: #222; line-height: 1.45; margin: 0; }
`;

/** Die Seite als HTML (Texte sind maskiert). */
export function baueNachweisHtml(d: NachweisPdfDaten): string {
  const zeilen = sortiereZeilen(d.zeilen);
  return `
    <div class="tz-print-page">
      <h2>Nachweis der Teilzeitkräfte</h2>
      <div class="tz-print-line"><b>Im Jugendtreff / Kindertreff *</b><span class="tz-fill">${esc(d.treff)}</span></div>
      <div class="tz-print-line"><b>Monat / Jahr</b><span class="tz-fill tz-fill-narrow">${esc(pdfMonat(d.monat))}</span></div>
      <div class="tz-print-line"><b>Name:</b><span class="tz-fill">${esc(`${d.vorname} ${d.nachname}`.trim())}</span></div>
      <table class="tz-print-table">
        <colgroup><col style="width:22%;"><col style="width:46%;"><col style="width:32%;"></colgroup>
        <thead><tr><th>Datum</th><th>Zeiten</th><th>Stunden gesamt:</th></tr></thead>
        <tbody>
          ${zeilen.map((z) => `<tr><td>${esc(pdfDatum(z.datum))}</td><td>${esc(z.zeiten ?? '')}</td><td class="tz-num">${esc(pdfStunden(z.stunden))}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="2" style="text-align:right;">Gesamtsumme</td><td class="tz-num">${esc(pdfSumme(zeilen))}</td></tr></tfoot>
      </table>
      <div class="tz-print-spacer"></div>
      <div class="tz-print-sign-box">
        <div class="tz-print-sign-value">${esc(d.unterschrift ?? '')}</div>
        <div class="tz-print-sign-line">Unterschrift Treff – LeiterIn</div>
      </div>
      <div class="tz-print-hr"></div>
      <p class="tz-print-hint">* Bitte das nicht zutreffende streichen und den Treff angeben, bei der die
      Teilzeitkraft tätig ist. (z.B. St. Ludwig, Mörsch, Jugendcafé usw.)</p>
    </div>
  `;
}

/** Dateiname „JJ_MM_Nachname_Vorname.pdf“ */
export const nachweisPdfName = (d: Pick<NachweisPdfDaten, 'monat' | 'vorname' | 'nachname'>) => `${dateiname(d.monat, d.vorname, d.nachname)}.pdf`;

/** Rendert die Seite außerhalb des sichtbaren Bereichs und lädt sie als PDF herunter. */
export async function ladeNachweisPdf(d: NachweisPdfDaten): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed; left:-10000px; top:0; z-index:-1;';
  host.innerHTML = `<style>${NACHWEIS_PDF_CSS}</style>${baueNachweisHtml(d)}`;
  document.body.appendChild(host);
  try {
    const seite = host.querySelector<HTMLElement>('.tz-print-page')!;
    const canvas = await html2canvas(seite, { scale: 3, backgroundColor: '#ffffff' });
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
    doc.save(nachweisPdfName(d));
  } finally {
    host.remove();
  }
}
