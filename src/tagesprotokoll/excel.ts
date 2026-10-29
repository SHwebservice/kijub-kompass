import { isoWochentag, monatErster } from '../treffs/dienstplan';
import { anteil, auswertungNachMonat, summeAuswertung, type MonatsZeile, type Zahlen } from './logik';

/**
 * Export der Tagesprotokolle eines Jahres als Excel-Datei (.xlsx) für Treffleitung und Koordination – zum Ansehen und Drucken.
 * Blatt „Übersicht“: Kinder je Monat (Tage, m/w/d, Kinder gesamt, Ø je Tag, höchste Zahl), Jahressumme, Anteile und ein Diagramm.
 * Blatt „Tage“: alle Protokolle nach Monaten gegliedert (aufklappbar), je Monat eine Summenzeile.
 * „Kinder gesamt“ zählt Besuche (die Summe aller Tage) – es werden keine Namen erfasst. ExcelJS wird erst beim Export geladen.
 */

export type ExportProtokoll = Zahlen & { verlauf?: string; vorkommnisse?: string };

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const gesamtVon = (p: Zahlen) => p.anz_m + p.anz_w + p.anz_d;

export interface JahresMonat extends MonatsZeile {
  /** Name des Monats („März“) */
  name: string;
  /** Höchste Zahl an Kindern an einem Tag */
  hoechst: number;
}

/** Alle zwölf Monate des Jahres (auch ohne Protokolle), dazu Summe und höchste Zahl. */
export function jahresUebersicht(l: Zahlen[], jahr: number): { monate: JahresMonat[]; summe: MonatsZeile & { hoechst: number } } {
  const daten = l.filter((p) => p.datum.startsWith(`${jahr}-`));
  const je = new Map(auswertungNachMonat(daten).map((z) => [z.monat, z]));
  const monate = MONATE.map((name, i): JahresMonat => {
    const monat = `${jahr}-${String(i + 1).padStart(2, '0')}-01`;
    const z = je.get(monat) ?? { monat, tage: 0, m: 0, w: 0, d: 0, gesamt: 0, schnitt: 0 };
    return { ...z, name, hoechst: daten.filter((p) => monatErster(p.datum) === monat).reduce((n, p) => Math.max(n, gesamtVon(p)), 0) };
  });
  return { monate, summe: { ...summeAuswertung(daten), hoechst: daten.reduce((n, p) => Math.max(n, gesamtVon(p)), 0) } };
}

export const excelDateiName = (treffName: string, jahr: number, sicher: (t: string) => string) => `Tagesprotokolle-${sicher(treffName)}-${jahr}.xlsx`;

/* ───── Diagramm (als Bild, damit es in jedem Programm gleich aussieht) ───── */

/** Runder Abstand der Hilfslinien: höchstens sechs Linien (1, 2, 5, 10, 20, 50 …). */
export function skalenSchritt(max: number): number {
  for (let basis = 1; ; basis *= 10) for (const f of [1, 2, 5]) if (max / (f * basis) <= 6) return f * basis;
}

const FARBE = { m: '#1b4b8a', w: '#c0587e', d: '#e0a020', text: '#1f2937', linie: '#d1d5db', schwach: '#6b7280' };

/** Gestapelte Säulen m/w/d je Monat mit der Gesamtzahl darüber; PNG als Base64. Ohne Canvas (z. B. in Tests): null. */
export function zeichneDiagramm(monate: JahresMonat[], jahr: number): string | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  const B = 1100; const H = 460; const skal = 2;
  c.width = B * skal; c.height = H * skal;
  const g = c.getContext?.('2d');
  if (!g) return null;
  g.scale(skal, skal);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, B, H);
  const links = 60; const rechts = 20; const oben = 70; const unten = 50;
  const flaecheB = B - links - rechts; const flaecheH = H - oben - unten;
  const max = Math.max(1, ...monate.map((m) => m.gesamt));
  const schritt = skalenSchritt(max);
  const oberGrenze = Math.ceil(max / schritt) * schritt;
  const y = (wert: number) => oben + flaecheH - (wert / oberGrenze) * flaecheH;

  g.fillStyle = FARBE.text; g.font = 'bold 22px Arial, sans-serif'; g.textBaseline = 'alphabetic';
  g.fillText(`Kinder je Monat ${jahr}`, links, 32);
  // Legende
  g.font = '15px Arial, sans-serif';
  let lx = links;
  for (const [farbe, text] of [[FARBE.m, 'männlich'], [FARBE.w, 'weiblich'], [FARBE.d, 'divers']] as const) {
    g.fillStyle = farbe; g.fillRect(lx, 44, 14, 14);
    g.fillStyle = FARBE.text; g.fillText(text, lx + 20, 56);
    lx += 20 + g.measureText(text).width + 24;
  }
  // Raster und Achse
  g.font = '13px Arial, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let w = 0; w <= oberGrenze; w += schritt) {
    g.strokeStyle = FARBE.linie; g.lineWidth = 1;
    g.beginPath(); g.moveTo(links, y(w)); g.lineTo(B - rechts, y(w)); g.stroke();
    g.fillStyle = FARBE.schwach; g.fillText(String(w), links - 8, y(w));
  }
  // Säulen
  const spalte = flaecheB / monate.length; const breite = spalte * 0.62;
  g.textAlign = 'center';
  monate.forEach((m, i) => {
    const x = links + i * spalte + (spalte - breite) / 2;
    let basis = 0;
    for (const [wert, farbe] of [[m.m, FARBE.m], [m.w, FARBE.w], [m.d, FARBE.d]] as const) {
      if (wert > 0) { g.fillStyle = farbe; g.fillRect(x, y(basis + wert), breite, y(basis) - y(basis + wert)); }
      basis += wert;
    }
    g.fillStyle = FARBE.text; g.font = 'bold 14px Arial, sans-serif'; g.textBaseline = 'bottom';
    if (m.gesamt > 0) g.fillText(String(m.gesamt), x + breite / 2, y(m.gesamt) - 4);
    g.font = '13px Arial, sans-serif'; g.textBaseline = 'top'; g.fillStyle = FARBE.schwach;
    g.fillText(m.name.slice(0, 3), x + breite / 2, oben + flaecheH + 8);
    if (m.tage > 0) g.fillText(`Ø ${m.schnitt.toLocaleString('de-DE')}`, x + breite / 2, oben + flaecheH + 26);
  });
  return c.toDataURL('image/png').split(',')[1] ?? null;
}

/* ───── Arbeitsmappe ───── */

const FARBEN = {
  kopf: 'FF1B4B8A', kopfText: 'FFFFFFFF', monat: 'FFE8EEF8', summe: 'FFDCE5F3', wochenende: 'FFF3F4F6', vorkommnis: 'FFFFF1DC', schwach: 'FF6B7280', rahmen: 'FFB8C4D6',
};

export interface ExcelEingabe {
  treffName: string;
  jahr: number;
  protokolle: ExportProtokoll[];
  erstellt?: Date;
  /** Diagramm als PNG (Base64); ohne Angabe wird es gezeichnet, wenn möglich. */
  diagramm?: string | null;
}

/** Baut die Arbeitsmappe und gibt die .xlsx-Datei als Bytes zurück. */
export async function erstelleExcel(e: ExcelEingabe): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const mappe = new ExcelJS.Workbook();
  mappe.creator = 'KiJuB-Kompass';
  mappe.created = e.erstellt ?? new Date();
  const daten = [...e.protokolle].filter((p) => p.datum.startsWith(`${e.jahr}-`)).sort((a, b) => a.datum.localeCompare(b.datum));
  const { monate, summe } = jahresUebersicht(daten, e.jahr);
  const stand = (e.erstellt ?? new Date()).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rahmen = { style: 'thin' as const, color: { argb: FARBEN.rahmen } };
  const kopfzeile = (row: import('exceljs').Row) => {
    row.font = { bold: true, color: { argb: FARBEN.kopfText } };
    row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    row.height = 32;
    row.eachCell((z) => { z.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FARBEN.kopf } }; z.border = { bottom: rahmen }; });
  };

  /* Blatt 1: Übersicht */
  const ue = mappe.addWorksheet('Übersicht', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${e.treffName}&RSeite &P von &N` },
  });
  ue.columns = [
    { key: 'monat', width: 16 }, { key: 'tage', width: 12 }, { key: 'm', width: 11 }, { key: 'w', width: 11 }, { key: 'd', width: 11 },
    { key: 'gesamt', width: 14 }, { key: 'schnitt', width: 14 }, { key: 'hoechst', width: 16 },
  ];
  ue.mergeCells('A1:H1');
  ue.getCell('A1').value = `Tagesprotokolle ${e.treffName} – ${e.jahr}`;
  ue.getCell('A1').font = { bold: true, size: 16, color: { argb: FARBEN.kopf } };
  ue.getRow(1).height = 26;
  ue.mergeCells('A2:H2');
  ue.getCell('A2').value = `Erstellt am ${stand} · ${summe.tage} ${summe.tage === 1 ? 'Tag' : 'Tage'} mit Protokoll`;
  ue.getCell('A2').font = { color: { argb: FARBEN.schwach } };
  ue.mergeCells('A3:H3');
  ue.getCell('A3').value = '„Kinder gesamt“ = Summe der Kinder aller Tage (Besuche: wer an drei Tagen kommt, zählt dreimal). „Ø je Tag“ = Kinder gesamt geteilt durch die Tage mit Protokoll.';
  ue.getCell('A3').font = { italic: true, size: 9, color: { argb: FARBEN.schwach } };
  ue.getCell('A3').alignment = { wrapText: true, vertical: 'top' };
  ue.getRow(3).height = 28;

  ue.getRow(5).values = ['Monat', 'Tage mit Protokoll', 'männlich', 'weiblich', 'divers', 'Kinder gesamt', 'Ø Kinder je Tag', 'Höchste Zahl an einem Tag'];
  kopfzeile(ue.getRow(5));
  monate.forEach((m, i) => {
    const row = ue.getRow(6 + i);
    row.values = m.tage === 0 ? [m.name, 0, null, null, null, null, null, null] : [m.name, m.tage, m.m, m.w, m.d, m.gesamt, m.schnitt, m.hoechst];
    row.font = m.tage === 0 ? { color: { argb: FARBEN.schwach } } : {};
    row.getCell('gesamt').font = { bold: m.tage > 0, color: m.tage === 0 ? { argb: FARBEN.schwach } : undefined };
    row.eachCell({ includeEmpty: true }, (z) => { z.border = { bottom: { style: 'hair', color: { argb: FARBEN.rahmen } } }; });
  });
  const sz = ue.getRow(18);
  sz.values = [`Summe ${e.jahr}`, summe.tage, summe.m, summe.w, summe.d, summe.gesamt, summe.schnitt, summe.hoechst];
  sz.font = { bold: true };
  sz.eachCell((z) => { z.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FARBEN.summe } }; z.border = { top: { style: 'medium', color: { argb: FARBEN.kopf } } }; });
  const az = ue.getRow(19);
  az.values = ['Anteile', null, summe.gesamt ? anteil(summe.m, summe.gesamt) / 100 : null, summe.gesamt ? anteil(summe.w, summe.gesamt) / 100 : null, summe.gesamt ? anteil(summe.d, summe.gesamt) / 100 : null];
  az.font = { italic: true, color: { argb: FARBEN.schwach } };
  for (const k of ['C', 'D', 'E']) ue.getCell(`${k}19`).numFmt = '0%';
  for (let r = 6; r <= 18; r++) { ue.getCell(`G${r}`).numFmt = '0.0'; for (const k of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) ue.getCell(`${k}${r}`).alignment = { horizontal: 'center' }; }
  for (const k of ['C', 'D', 'E']) ue.getCell(`${k}19`).alignment = { horizontal: 'center' };

  const bild = e.diagramm === undefined ? zeichneDiagramm(monate, e.jahr) : e.diagramm;
  if (bild) {
    const id = mappe.addImage({ base64: bild, extension: 'png' });
    ue.addImage(id, { tl: { col: 0, row: 20.3 }, ext: { width: 820, height: 343 } });
  }

  /* Blatt 2: Tage im Einzelnen */
  const ta = mappe.addWorksheet('Tage', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { outlineLevelRow: 1 },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3', margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${e.treffName} · ${e.jahr}&RSeite &P von &N` },
  });
  ta.columns = [
    { key: 'datum', width: 12 }, { key: 'wt', width: 6 }, { key: 'm', width: 10 }, { key: 'w', width: 10 }, { key: 'd', width: 9 },
    { key: 'gesamt', width: 10 }, { key: 'verlauf', width: 60 }, { key: 'vorkommnisse', width: 40 },
  ];
  ta.mergeCells('A1:H1');
  ta.getCell('A1').value = `Tagesprotokolle ${e.treffName} – ${e.jahr}: Tage im Einzelnen`;
  ta.getCell('A1').font = { bold: true, size: 14, color: { argb: FARBEN.kopf } };
  ta.mergeCells('A2:H2');
  ta.getCell('A2').value = 'Monate lassen sich links mit + / − auf- und zuklappen. Tage mit Vorkommnissen sind orange hinterlegt.';
  ta.getCell('A2').font = { italic: true, size: 9, color: { argb: FARBEN.schwach } };
  ta.getRow(3).values = ['Datum', 'Tag', 'männlich', 'weiblich', 'divers', 'Gesamt', 'Verlauf', 'Vorkommnisse'];
  kopfzeile(ta.getRow(3));

  let r = 4;
  for (const m of monate.filter((x) => x.tage > 0)) {
    const kopf = ta.getRow(r++);
    kopf.values = [`${m.name} ${e.jahr}`];
    ta.mergeCells(`A${kopf.number}:H${kopf.number}`);
    kopf.font = { bold: true, color: { argb: FARBEN.kopf } };
    kopf.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FARBEN.monat } };
    for (const p of daten.filter((x) => monatErster(x.datum) === m.monat)) {
      const row = ta.getRow(r++);
      const [jj, mm, tt] = p.datum.split('-').map(Number) as [number, number, number];
      const wt = isoWochentag(p.datum);
      row.values = [new Date(Date.UTC(jj, mm - 1, tt)), WT[wt - 1]!, p.anz_m, p.anz_w, p.anz_d, gesamtVon(p), p.verlauf ?? '', p.vorkommnisse ?? ''];
      row.outlineLevel = 1;
      row.getCell(1).numFmt = 'dd.mm.yyyy';
      row.getCell('gesamt').font = { bold: true };
      row.alignment = { vertical: 'top', wrapText: true };
      for (const k of [1, 2, 3, 4, 5, 6]) row.getCell(k).alignment = { vertical: 'top', horizontal: k === 1 ? 'left' : 'center' };
      const farbe = (p.vorkommnisse ?? '').trim() ? FARBEN.vorkommnis : wt >= 6 ? FARBEN.wochenende : null;
      row.eachCell({ includeEmpty: true }, (z) => {
        z.border = { bottom: { style: 'hair', color: { argb: FARBEN.rahmen } } };
        if (farbe) z.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: farbe } };
      });
    }
    const s = ta.getRow(r++);
    s.values = [`Summe ${m.name}`, null, m.m, m.w, m.d, m.gesamt, `${m.tage} ${m.tage === 1 ? 'Tag' : 'Tage'} · Ø ${m.schnitt.toLocaleString('de-DE')} Kinder je Tag · höchstens ${m.hoechst} an einem Tag`];
    s.font = { bold: true };
    for (const k of [3, 4, 5, 6]) s.getCell(k).alignment = { horizontal: 'center' };
    s.eachCell({ includeEmpty: true }, (z) => { z.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FARBEN.summe } }; z.border = { top: { style: 'thin', color: { argb: FARBEN.kopf } } }; });
    r++;                                                                                  // Leerzeile zwischen den Monaten
  }
  if (daten.length === 0) ta.getCell('A4').value = `Für ${e.jahr} gibt es noch keine Protokolle.`;

  return mappe.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Erstellt die Excel-Datei und lässt den Browser sie speichern. */
export async function ladeExcel(e: ExcelEingabe, dateiname: string): Promise<void> {
  const daten = await erstelleExcel(e);
  const url = URL.createObjectURL(new Blob([daten], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = dateiname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
