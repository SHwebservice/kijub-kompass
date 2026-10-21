import { describe, it, expect, vi, beforeEach } from 'vitest';
import { baueMonatsplan, berechneRaster, druckeMonatsplanPdf, monatsplanPdfName, SEITE, speichereMonatsplanPdf, zeichneMonatsplan, type MonatsplanEingabe } from './dienstplanPdf';
import type { Dienst } from './dienstplan';

// November 2026: So 1., Mo 2., Mi 4. … Mo 9., Mi 11.
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });
const eingabe = (o: Partial<MonatsplanEingabe> = {}): MonatsplanEingabe => ({
  treffName: 'Treff Nord', monat: '2026-11-01', treffId: 't1',
  oeffnungszeiten: [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }],
  mitglieder: [
    { person_id: 'ben', vorname: 'Ben', nachname: 'Baum', rolle: 'betreuerin' },
    { person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung' },
  ],
  dienste: [
    dienst({ id: 'a', datum: '2026-11-02', personen: ['ben', 'lea'] }),
    dienst({ id: 's', datum: '2026-11-07', ist_sonder: true, bezeichnung: 'Fest', von: '10:00', bis: '12:00', personen: ['ben'] }),
  ],
  abwesenheiten: [
    { id: 'u', person_id: 'ben', datum: '2026-11-04', typ: 'urlaub', notiz: null },
    { id: 'k', person_id: 'lea', datum: '2026-11-09', typ: 'krank', notiz: null },
    { id: 'v', person_id: 'lea', datum: '2026-11-11', typ: 'verhindert', notiz: null },
  ],
  feiertage: [{ id: 'f', treff_id: null, datum: '2026-11-18', bezeichnung: 'Buß- und Bettag' }],
  schliesszeiten: [{ id: 'z', treff_id: 't1', von: '2026-11-23', bis: '2026-11-25', grund: 'Fortbildung' }],
  stand: new Date('2026-10-21T10:00:00'),
  ...o,
});
const zeile = (p: ReturnType<typeof baueMonatsplan>, datum: string) => p.zeilen.find((z) => z.datum === datum)!;

describe('baueMonatsplan', () => {
  it('alle Kalendertage als Zeilen, Mitarbeitende als Spalten (Treffleitung zuerst)', () => {
    const p = baueMonatsplan(eingabe());
    expect(p.zeilen).toHaveLength(30);
    expect(p.zeilen[0]).toMatchObject({ datum: '2026-11-01', tag: 'So 01.', art: 'frei', zeit: '' });
    expect(zeile(p, '2026-11-02')).toMatchObject({ tag: 'Mo 02.', art: 'offen', zeit: '15:00–19:00', zellen: ['X', 'X'], besetzung: 2 });
    expect(p.personen.map((x) => x.vorname)).toEqual(['Lea', 'Ben']);
    expect(p.titel).toBe('Dienstplan Treff Nord – November 2026');
  });

  it('Urlaub und krank stehen drin, „kann nicht“ nicht', () => {
    const p = baueMonatsplan(eingabe());
    expect(zeile(p, '2026-11-04').zellen).toEqual(['', 'U']);
    expect(zeile(p, '2026-11-09').zellen).toEqual(['K', '']);
    expect(zeile(p, '2026-11-11').zellen).toEqual(['', '']);
  });

  it('Sonderdienst (auch an einem Tag ohne Öffnung) mit Hinweis; Feiertag und Schließzeit sind „zu“ mit Grund', () => {
    const p = baueMonatsplan(eingabe());
    expect(zeile(p, '2026-11-07')).toMatchObject({ art: 'frei', zellen: ['', 'S'], hinweis: 'Sonderdienst Fest 10:00–12:00' });
    expect(zeile(p, '2026-11-18')).toMatchObject({ art: 'zu', hinweis: 'Feiertag: Buß- und Bettag' });
    expect(zeile(p, '2026-11-23')).toMatchObject({ art: 'zu', hinweis: 'Geschlossen: Fortbildung' });
    expect(zeile(p, '2026-11-24')).toMatchObject({ art: 'zu' });                // Dienstag in der Schließzeit: auch grau
    expect(zeile(p, '2026-11-24').hinweis).toBe('Geschlossen: Fortbildung');
  });

  it('Summen je Person: Dienste und Stunden', () => {
    const p = baueMonatsplan(eingabe());
    expect(p.summen).toEqual([{ dienste: 1, stunden: '4 h' }, { dienste: 2, stunden: '6 h' }]);
  });

  it('vorläufig steht im Titel', () => {
    expect(baueMonatsplan(eingabe({ vorlaeufig: true })).titel).toMatch(/\(vorläufig\)$/);
  });
});

describe('berechneRaster: alles passt auf eine Seite A4 quer', () => {
  for (const [personen, tage] of [[1, 28], [6, 31], [12, 31], [20, 31]] as const) {
    it(`${personen} Personen, ${tage} Tage`, () => {
      const r = berechneRaster(personen, tage);
      expect(r.tagB + r.zeitB + personen * r.personB + r.hinweisB).toBeCloseTo(SEITE.breite - 2 * SEITE.rand, 5);
      expect(r.oben + r.kopfH + tage * r.zeileH + r.summeH).toBeCloseTo(SEITE.hoehe - SEITE.rand, 5);
      expect(r.schrift).toBeGreaterThanOrEqual(5);
      expect(r.schrift).toBeLessThanOrEqual(9);
    });
  }
});

describe('Dateiname', () => {
  it('Treff und Monat, ohne Sonderzeichen', () => {
    expect(monatsplanPdfName('Kindertreff St. Ludwig', '2026-11-01')).toBe('Dienstplan_Kindertreff_St_Ludwig_2026-11.pdf');
  });
});

const gebaut: unknown[] = [];
const speichern = vi.fn();
const autoPrint = vi.fn();
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opt: unknown) { gebaut.push(opt); }
    setFont() {} setFontSize() {} setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {}
    rect() {} line() {} text() {}
    getTextWidth(t: string) { return t.length * 1.5; }
    save = speichern;
    autoPrint = autoPrint;
    output() { return 'blob:pdf'; }
  },
}));

describe('PDF erzeugen', () => {
  beforeEach(() => { gebaut.length = 0; speichern.mockReset(); autoPrint.mockReset(); });

  it('Querformat A4 in Millimetern; Speichern mit Dateinamen', async () => {
    await speichereMonatsplanPdf(baueMonatsplan(eingabe()), 'x.pdf');
    expect(gebaut).toEqual([{ orientation: 'landscape', unit: 'mm', format: 'a4' }]);
    expect(speichern).toHaveBeenCalledWith('x.pdf');
  });

  it('Drucken öffnet das PDF mit Druckdialog in einem neuen Fenster; blockiert: verständlicher Fehler', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await druckeMonatsplanPdf(baueMonatsplan(eingabe()));
    expect(autoPrint).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('blob:pdf', '_blank');
    open.mockReturnValue(null);
    await expect(druckeMonatsplanPdf(baueMonatsplan(eingabe()))).rejects.toThrow(/Pop-ups/);
    open.mockRestore();
  });

  it('zeichnet ohne Fehler auch für viele Personen', async () => {
    const viele = Array.from({ length: 18 }, (_, i) => ({ person_id: `p${i}`, vorname: `Vorname${i}`, nachname: `Nachname${i}`, rolle: 'betreuerin' as const }));
    await expect(zeichneMonatsplan(baueMonatsplan(eingabe({ mitglieder: viele })))).resolves.toBeDefined();
  });
});
