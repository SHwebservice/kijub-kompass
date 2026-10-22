import { describe, it, expect, vi, beforeEach } from 'vitest';
import { baueProtokollSammlung, protokollPdfName, speichereProtokollPdf, type ProtokollSammlungEingabe } from './protokollPdf';
import type { Protokoll } from './logik';

const protokoll = (o: Partial<Protokoll> & { datum: string }): Protokoll => ({
  id: `p-${o.datum}`, treff_id: 't1', anz_m: 4, anz_w: 5, anz_d: 1, verlauf: 'Basteln', vorkommnisse: '', erstellt_von: 'ben', bearbeitet_von: 'ben',
  updated_at: `${o.datum}T17:30:00Z`, ...o,
});
const eingabe = (o: Partial<ProtokollSammlungEingabe> = {}): ProtokollSammlungEingabe => ({
  treffName: 'Treff Nord', von: '2026-11-01', bis: '2026-11-30',
  protokolle: [
    protokoll({ datum: '2026-11-04', anz_m: 2, anz_w: 3, anz_d: 0, vorkommnisse: '  Knie aufgeschlagen  ', bearbeitet_von: 'lea' }),
    protokoll({ datum: '2026-11-02', verlauf: '  Kicker  ' }),
    protokoll({ datum: '2026-12-01' }),
  ],
  namen: { ben: 'Ben Baum' },
  stand: new Date('2026-12-02T10:00:00'),
  ...o,
});

describe('baueProtokollSammlung', () => {
  it('nur der Zeitraum, nach Datum sortiert, mit Wochentag und Zahlen', () => {
    const s = baueProtokollSammlung(eingabe());
    expect(s.titel).toBe('Tagesprotokolle Treff Nord');
    expect(s.untertitel).toBe('Zeitraum 01.11.2026 – 30.11.2026 · Stand 2.12.2026');
    expect(s.eintraege.map((e) => e.datum)).toEqual(['2026-11-02', '2026-11-04']);
    expect(s.eintraege[0]).toMatchObject({ kopf: 'Montag, 02.11.2026', zahlen: 'Kinder: 10 (m 4 · w 5 · d 1)', verlauf: 'Kicker', bearbeitet: 'Ben Baum' });
    expect(s.eintraege[1]).toMatchObject({ vorkommnisse: 'Knie aufgeschlagen', bearbeitet: '' });
  });

  it('Summe über den Zeitraum', () => {
    expect(baueProtokollSammlung(eingabe()).summe).toBe('2 Tage mit Protokoll · Kinder: 15 (m 6 · w 8 · d 1) · Ø 7,5 je Tag');
    expect(baueProtokollSammlung(eingabe({ protokolle: [protokoll({ datum: '2026-11-02' })] })).summe).toMatch(/^1 Tag mit Protokoll/);
  });
});

describe('Dateiname', () => {
  it('Treff und Zeitraum, ohne Sonderzeichen', () => {
    expect(protokollPdfName('Kindertreff St. Ludwig', '2026-11-01', '2026-11-30')).toBe('Tagesprotokolle_Kindertreff_St_Ludwig_2026-11-01_bis_2026-11-30.pdf');
  });
});

const gebaut: unknown[] = [];
const texte: string[] = [];
const speichern = vi.fn();
let seiten = 1;
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opt: unknown) { gebaut.push(opt); seiten = 1; }
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {} line() {} setPage() {}
    text(t: string) { texte.push(t); }
    splitTextToSize(t: string) { return t.split('\n'); }
    addPage() { seiten += 1; }
    getNumberOfPages() { return seiten; }
    save = speichern;
  },
}));

describe('PDF erzeugen', () => {
  beforeEach(() => { gebaut.length = 0; texte.length = 0; speichern.mockReset(); });

  it('Hochformat A4 in Millimetern; Speichern mit Dateinamen', async () => {
    await speichereProtokollPdf(baueProtokollSammlung(eingabe()), 'x.pdf');
    expect(gebaut).toEqual([{ orientation: 'portrait', unit: 'mm', format: 'a4' }]);
    expect(speichern).toHaveBeenCalledWith('x.pdf');
    expect(texte).toEqual(expect.arrayContaining(['Montag, 02.11.2026', 'Kicker', 'Vorkommnisse', 'Knie aufgeschlagen', 'Zuletzt bearbeitet von Ben Baum']));
    expect(texte.at(-1)).toBe('Tagesprotokolle Treff Nord · Seite 1 von 1');
  });

  it('viele lange Protokolle laufen über mehrere Seiten', async () => {
    const lang = Array.from({ length: 40 }, (_, i) => `Zeile ${i}`).join('\n');
    const protokolle = Array.from({ length: 10 }, (_, i) => protokoll({ datum: `2026-11-${String(i + 1).padStart(2, '0')}`, verlauf: lang }));
    await speichereProtokollPdf(baueProtokollSammlung(eingabe({ protokolle })), 'x.pdf');
    expect(seiten).toBeGreaterThan(3);
    expect(texte.at(-1)).toBe(`Tagesprotokolle Treff Nord · Seite ${seiten} von ${seiten}`);
  });
});
