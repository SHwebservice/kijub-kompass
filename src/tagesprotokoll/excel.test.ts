import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { erstelleExcel, excelDateiName, jahresUebersicht, skalenSchritt, type ExportProtokoll } from './excel';

const protokolle: ExportProtokoll[] = [
  { datum: '2027-03-03', anz_m: 1, anz_w: 2, anz_d: 0, verlauf: 'Kicker', vorkommnisse: '' },
  { datum: '2027-03-01', anz_m: 4, anz_w: 5, anz_d: 1, verlauf: 'Basteln; Malen', vorkommnisse: 'Streit beim Kicker' },
  { datum: '2027-04-10', anz_m: 2, anz_w: 2, anz_d: 0 },                                   // Samstag
  { datum: '2026-12-30', anz_m: 9, anz_w: 9, anz_d: 9 },                                   // anderes Jahr: bleibt draußen
];
// 1×1-Pixel-PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function lies(diagramm: string | null = null) {
  const daten = await erstelleExcel({ treffName: 'Kindertreff', jahr: 2027, protokolle, erstellt: new Date(2027, 4, 2), diagramm });
  const mappe = new ExcelJS.Workbook();
  await mappe.xlsx.load(daten);
  return mappe;
}

describe('jahresUebersicht', () => {
  it('alle zwölf Monate, Kinder gesamt, Ø je Tag, höchste Zahl; Summe nur des Jahres', () => {
    const { monate, summe } = jahresUebersicht(protokolle, 2027);
    expect(monate).toHaveLength(12);
    expect(monate[2]).toMatchObject({ name: 'März', tage: 2, m: 5, w: 7, d: 1, gesamt: 13, schnitt: 6.5, hoechst: 10 });
    expect(monate[0]).toMatchObject({ name: 'Januar', tage: 0, gesamt: 0, hoechst: 0 });
    expect(summe).toMatchObject({ tage: 3, gesamt: 17, schnitt: 5.7, hoechst: 10 });
  });
});

describe('skalenSchritt', () => {
  it('runde Abstände mit höchstens sechs Linien', () => {
    expect([skalenSchritt(1), skalenSchritt(6), skalenSchritt(13), skalenSchritt(48), skalenSchritt(240), skalenSchritt(900)]).toEqual([1, 1, 5, 10, 50, 200]);
  });
});

describe('Excel-Datei', () => {
  it('zwei Blätter: Übersicht und Tage; Dateiname mit Treff und Jahr', async () => {
    const m = await lies();
    expect(m.worksheets.map((w) => w.name)).toEqual(['Übersicht', 'Tage']);
    expect(excelDateiName('Treff Nord', 2027, (t) => t.replace(/ /g, '-'))).toBe('Tagesprotokolle-Treff-Nord-2027.xlsx');
  });

  it('Übersicht: Titel, Kopfzeile, zwölf Monate, Summe und Anteile als Zahlen mit Formaten', async () => {
    const ue = (await lies()).getWorksheet('Übersicht')!;
    expect(ue.getCell('A1').value).toBe('Tagesprotokolle Kindertreff – 2027');
    expect(String(ue.getCell('A2').value)).toMatch(/^Erstellt am 02\.05\.2027 · 3 Tage mit Protokoll/);
    expect(ue.getRow(5).values).toEqual([undefined, 'Monat', 'Tage mit Protokoll', 'männlich', 'weiblich', 'divers', 'Kinder gesamt', 'Ø Kinder je Tag', 'Höchste Zahl an einem Tag']);
    expect(ue.getRow(5).getCell(1).font?.bold).toBe(true);
    expect(ue.getRow(8).values).toEqual([undefined, 'März', 2, 5, 7, 1, 13, 6.5, 10]);              // März ist der dritte Monat (Zeile 6 + 2)
    expect(ue.getRow(6).values).toEqual([undefined, 'Januar', 0]);                                    // leerer Monat: nur „0 Tage“
    expect(ue.getRow(18).values).toEqual([undefined, 'Summe 2027', 3, 7, 9, 1, 17, 5.7, 10]);
    expect(ue.getCell('G8').numFmt).toBe('0.0');
    expect(ue.getCell('C19').value).toBeCloseTo(0.41);
    expect(ue.getCell('C19').numFmt).toBe('0%');
    expect(ue.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
    expect(ue.pageSetup).toMatchObject({ orientation: 'landscape', fitToWidth: 1 });
  });

  it('Übersicht mit Diagramm als Bild unter der Tabelle', async () => {
    const m = await lies(PNG);
    const bilder = m.getWorksheet('Übersicht')!.getImages();
    expect(bilder).toHaveLength(1);
    expect(bilder[0]!.range.tl.nativeRow).toBe(20);
    expect((await lies(null)).getWorksheet('Übersicht')!.getImages()).toHaveLength(0);
  });

  it('Tage: nach Monaten gegliedert (aufklappbar), echtes Datum, Summenzeile je Monat, Vorkommnisse und Wochenenden hinterlegt', async () => {
    const ta = (await lies()).getWorksheet('Tage')!;
    expect(ta.getRow(3).values).toEqual([undefined, 'Datum', 'Tag', 'männlich', 'weiblich', 'divers', 'Gesamt', 'Verlauf', 'Vorkommnisse']);
    expect(ta.getCell('A4').value).toBe('März 2027');
    const tag1 = ta.getRow(5);
    expect(tag1.getCell(1).value).toEqual(new Date(Date.UTC(2027, 2, 1)));
    expect(tag1.getCell(1).numFmt).toBe('dd.mm.yyyy');
    expect([tag1.getCell(2).value, tag1.getCell(6).value, tag1.getCell(7).value, tag1.getCell(8).value]).toEqual(['Mo', 10, 'Basteln; Malen', 'Streit beim Kicker']);
    expect(tag1.outlineLevel).toBe(1);
    expect((tag1.getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFFF1DC');           // Vorkommnis
    const summe = ta.getRow(7);
    expect(summe.values).toEqual([undefined, 'Summe März', undefined, 5, 7, 1, 13, '2 Tage · Ø 6,5 Kinder je Tag · höchstens 10 an einem Tag']);
    expect(summe.outlineLevel ?? 0).toBe(0);
    expect(ta.getCell('A9').value).toBe('April 2027');
    expect(ta.getCell('B10').value).toBe('Sa');
    expect((ta.getCell('A10').fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFF3F4F6');           // Wochenende
  });

  it('ohne Protokolle: Hinweis auf dem Blatt „Tage“, Übersicht mit Nullen', async () => {
    const daten = await erstelleExcel({ treffName: 'Kindertreff', jahr: 2030, protokolle: [], diagramm: null });
    const m = new ExcelJS.Workbook(); await m.xlsx.load(daten);
    expect(m.getWorksheet('Tage')!.getCell('A4').value).toBe('Für 2030 gibt es noch keine Protokolle.');
    expect(m.getWorksheet('Übersicht')!.getRow(18).values).toEqual([undefined, 'Summe 2030', 0, 0, 0, 0, 0, 0, 0]);
  });
});
