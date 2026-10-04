import { describe, it, expect, vi, beforeEach } from 'vitest';
import { baueNachweisHtml, ladeNachweisPdf, nachweisPdfName, pdfDatum, pdfMonat, pdfStunden, pdfSumme, type NachweisPdfDaten } from './nachweisPdf';

const html2canvas = vi.fn();
const speichern = vi.fn();
const bild = vi.fn();
const gebaut: unknown[] = [];
vi.mock('html2canvas', () => ({ default: (...a: unknown[]) => html2canvas(...a) }));
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opt: unknown) { gebaut.push(opt); }
    addImage = bild;
    save = speichern;
  },
}));

const daten: NachweisPdfDaten = {
  treff: 'Kindertreff St. Ludwig', monat: '2026-08-01', vorname: 'Max', nachname: 'Mustermann', unterschrift: 'Max Mustermann',
  zeilen: [
    { id: 'b', datum: '2026-08-12', zeiten: 'Urlaub', stunden: 4, quelle: 'abwesenheit' },
    { id: 'a', datum: '2026-08-05', zeiten: '14:00 - 17:30', stunden: 3.5, quelle: 'dienst' },
    { id: 'c', datum: '2026-08-07', zeiten: 'Aufbau (Feiertag: Fest)', stunden: null, quelle: 'manuell' },
  ],
};

describe('Formate wie im bisherigen Formular', () => {
  it('Datum „05.08.“, Monat „August 2026“, Stunden mit Komma', () => {
    expect(pdfDatum('2026-08-05')).toBe('05.08.');
    expect(pdfMonat('2026-08-01')).toBe('August 2026');
    expect(pdfMonat('2027-03-01')).toBe('März 2027');
    expect(pdfStunden(3.5)).toBe('3,5');
    expect(pdfStunden(4)).toBe('4');
    expect(pdfStunden(null)).toBe('');
  });

  it('Summe: gerundet auf zwei Stellen; ohne Stunden „0“', () => {
    expect(pdfSumme([{ stunden: 3.5 }, { stunden: 4 }, { stunden: null }])).toBe('7,5');
    expect(pdfSumme([{ stunden: 1.126 }])).toBe('1,13');
    expect(pdfSumme([])).toBe('0');
    expect(pdfSumme([{ stunden: null }])).toBe('0');
  });

  it('Dateiname JJ_MM_Nachname_Vorname.pdf', () => {
    expect(nachweisPdfName(daten)).toBe('26_08_Mustermann_Max.pdf');
  });
});

describe('Seite des Nachweises', () => {
  const seite = (d: NachweisPdfDaten = daten) => { const el = document.createElement('div'); el.innerHTML = baueNachweisHtml(d); return el; };

  it('hat die Überschrift, die drei Felder, die Spaltenköpfe und die Summe wie die Vorlage', () => {
    const d = seite();
    expect(d.querySelector('h2')!.textContent).toBe('Nachweis der Teilzeitkräfte');
    const felder = [...d.querySelectorAll('.tz-print-line')].map((l) => l.textContent);
    expect(felder).toEqual(['Im Jugendtreff / Kindertreff *Kindertreff St. Ludwig', 'Monat / JahrAugust 2026', 'Name:Max Mustermann']);
    expect([...d.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['Datum', 'Zeiten', 'Stunden gesamt:']);
    expect(d.querySelector('tfoot')!.textContent).toBe('Gesamtsumme7,5');
  });

  it('die Zeilen stehen nach Datum sortiert, mit Zeiten und Stunden', () => {
    const zeilen = [...seite().querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(zeilen).toEqual([['05.08.', '14:00 - 17:30', '3,5'], ['07.08.', 'Aufbau (Feiertag: Fest)', ''], ['12.08.', 'Urlaub', '4']]);
  });

  it('Unterschrift unten mit Beschriftung, darunter der Hinweis zum Streichen', () => {
    const d = seite();
    expect(d.querySelector('.tz-print-sign-value')!.textContent).toBe('Max Mustermann');
    expect(d.querySelector('.tz-print-sign-line')!.textContent).toBe('Unterschrift Treff – LeiterIn');
    expect(d.querySelector('.tz-print-hint')!.textContent).toMatch(/Bitte das nicht zutreffende streichen/);
  });

  it('Texte werden maskiert (kein HTML aus Eingaben)', () => {
    const boese = '<img src=x onerror=alert(1)>';
    const d = seite({ ...daten, treff: boese, zeilen: [{ id: '1', datum: '2026-08-05', zeiten: '<b>x</b>', stunden: 1, quelle: 'manuell' }] });
    expect(d.querySelector('img')).toBeNull();
    expect(d.querySelector('tbody b')).toBeNull();
    expect(d.querySelector('.tz-fill')!.textContent).toBe(boese);
  });

  it('ohne Unterschrift bleibt das Feld leer', () => {
    expect(seite({ ...daten, unterschrift: null }).querySelector('.tz-print-sign-value')!.textContent).toBe('');
  });
});

describe('ladeNachweisPdf', () => {
  beforeEach(() => { html2canvas.mockReset(); speichern.mockReset(); bild.mockReset(); gebaut.length = 0; });

  it('rendert die Seite außerhalb des Bildschirms, legt sie als A4-Bild ins PDF und speichert unter dem Dateinamen', async () => {
    html2canvas.mockImplementation(async (el: HTMLElement) => {
      expect(el.classList.contains('tz-print-page')).toBe(true);
      expect(document.body.contains(el)).toBe(true);
      return { toDataURL: () => 'data:image/jpeg;base64,xx' };
    });
    await ladeNachweisPdf(daten);
    expect(html2canvas).toHaveBeenCalledWith(expect.anything(), { scale: 3, backgroundColor: '#ffffff' });
    expect(gebaut).toEqual([{ unit: 'mm', format: 'a4' }]);
    expect(bild).toHaveBeenCalledWith('data:image/jpeg;base64,xx', 'JPEG', 0, 0, 210, 297);
    expect(speichern).toHaveBeenCalledWith('26_08_Mustermann_Max.pdf');
    expect(document.querySelector('.tz-print-page')).toBeNull();
  });

  it('räumt auch bei einem Fehler auf', async () => {
    html2canvas.mockRejectedValue(new Error('kaputt'));
    await expect(ladeNachweisPdf(daten)).rejects.toThrow('kaputt');
    expect(document.querySelector('.tz-print-page')).toBeNull();
    expect(speichern).not.toHaveBeenCalled();
  });
});
