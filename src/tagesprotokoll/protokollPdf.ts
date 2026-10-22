import { formatDatum, wochentagLang } from '../freizeiten/logik';
import type { Protokoll } from './logik';

/**
 * Sammlung von Tagesprotokollen eines Zeitraums als PDF (DIN A4 hoch), für Treffleitung und Koordination.
 * Je Tag ein Abschnitt: Datum, Kinder (m/w/d), Verlauf, Vorkommnisse, zuletzt bearbeitet von. Am Ende die Summe.
 * Das PDF wird mit jsPDF als Text gezeichnet (scharf, durchsuchbar); lange Texte laufen auf die nächste Seite weiter.
 */

export interface ProtokollEintrag {
  datum: string;
  /** "Dienstag, 03.11.2026" */
  kopf: string;
  /** "Kinder: 12 (m 5 · w 6 · d 1)" */
  zahlen: string;
  verlauf: string;
  vorkommnisse: string;
  /** Name der Person, die zuletzt bearbeitet hat, sonst leer */
  bearbeitet: string;
}

export interface ProtokollSammlung {
  titel: string;
  untertitel: string;
  eintraege: ProtokollEintrag[];
  /** "8 Tage mit Protokoll · 96 Kinder (m 40 · w 50 · d 6) · Ø 12 je Tag" */
  summe: string;
}

export interface ProtokollSammlungEingabe {
  treffName: string;
  von: string;
  bis: string;
  protokolle: Protokoll[];
  /** Person-ID → Name */
  namen: Record<string, string>;
  /** Zeitpunkt des Exports */
  stand?: Date;
}

const kinder = (m: number, w: number, d: number) => `${m + w + d} (m ${m} · w ${w} · d ${d})`;

export function baueProtokollSammlung(e: ProtokollSammlungEingabe): ProtokollSammlung {
  const liste = e.protokolle.filter((p) => p.datum >= e.von && p.datum <= e.bis).sort((a, b) => a.datum.localeCompare(b.datum));
  const s = liste.reduce((a, p) => ({ m: a.m + p.anz_m, w: a.w + p.anz_w, d: a.d + p.anz_d }), { m: 0, w: 0, d: 0 });
  const summeKinder = s.m + s.w + s.d;
  const schnitt = liste.length ? Math.round((summeKinder / liste.length) * 10) / 10 : 0;
  const stand = e.stand ?? new Date();
  return {
    titel: `Tagesprotokolle ${e.treffName}`,
    untertitel: `Zeitraum ${formatDatum(e.von)} – ${formatDatum(e.bis)} · Stand ${stand.toLocaleDateString('de-DE')}`,
    eintraege: liste.map((p) => ({
      datum: p.datum,
      kopf: `${wochentagLang(p.datum)}, ${formatDatum(p.datum)}`,
      zahlen: `Kinder: ${kinder(p.anz_m, p.anz_w, p.anz_d)}`,
      verlauf: p.verlauf.trim(),
      vorkommnisse: p.vorkommnisse.trim(),
      bearbeitet: (p.bearbeitet_von && e.namen[p.bearbeitet_von]) || '',
    })),
    summe: `${liste.length} ${liste.length === 1 ? 'Tag' : 'Tage'} mit Protokoll · Kinder: ${kinder(s.m, s.w, s.d)} · Ø ${schnitt.toLocaleString('de-DE')} je Tag`,
  };
}

export const protokollPdfName = (treffName: string, von: string, bis: string) =>
  `Tagesprotokolle_${treffName.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}_${von}_bis_${bis}.pdf`;

/* ───── Seite (Maße in mm, DIN A4 hoch) ───── */

export const SEITE = { breite: 210, hoehe: 297, rand: 18 } as const;
const PT = 0.3528;                                     // 1 pt in mm

type Doc = InstanceType<typeof import('jspdf').jsPDF>;

/** Zeichnet die Sammlung in ein neues PDF-Dokument (jsPDF wird erst hier geladen). */
export async function zeichneProtokollSammlung(s: ProtokollSammlung): Promise<Doc> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const links = SEITE.rand;
  const breite = SEITE.breite - 2 * SEITE.rand;
  const unten = SEITE.hoehe - SEITE.rand;
  let y = SEITE.rand;

  const neueSeite = () => { doc.addPage(); y = SEITE.rand; };
  /** Schreibt Zeilen und bricht bei Bedarf auf die nächste Seite um. */
  const zeilen = (text: string, groesse: number, stil: 'normal' | 'bold' | 'italic' = 'normal', einzug = 0) => {
    doc.setFont('helvetica', stil); doc.setFontSize(groesse);
    const h = groesse * PT * 1.35;
    for (const z of doc.splitTextToSize(text, breite - einzug) as string[]) {
      if (y + h > unten) neueSeite();
      doc.text(z, links + einzug, y + h * 0.75);
      y += h;
    }
  };

  zeilen(s.titel, 15, 'bold');
  doc.setTextColor(80); zeilen(s.untertitel, 9); doc.setTextColor(0);
  y += 4;

  if (s.eintraege.length === 0) zeilen('Für diesen Zeitraum gibt es keine Protokolle.', 10, 'italic');

  for (const e of s.eintraege) {
    // Kopf nicht allein unten auf der Seite stehen lassen
    if (y + 22 > unten) neueSeite();
    doc.setDrawColor(150); doc.setLineWidth(0.2); doc.line(links, y, links + breite, y);
    y += 2.5;
    zeilen(e.kopf, 11.5, 'bold');
    zeilen(e.zahlen, 9.5);
    y += 1.5;
    zeilen('Verlauf', 9.5, 'bold');
    zeilen(e.verlauf || '–', 9.5, 'normal', 3);
    if (e.vorkommnisse) {
      y += 1.5;
      zeilen('Vorkommnisse', 9.5, 'bold');
      zeilen(e.vorkommnisse, 9.5, 'normal', 3);
    }
    if (e.bearbeitet) { doc.setTextColor(100); zeilen(`Zuletzt bearbeitet von ${e.bearbeitet}`, 8, 'italic'); doc.setTextColor(0); }
    y += 4;
  }

  if (s.eintraege.length > 0) {
    if (y + 12 > unten) neueSeite();
    doc.setDrawColor(60); doc.setLineWidth(0.4); doc.line(links, y, links + breite, y);
    y += 2.5;
    zeilen(s.summe, 10, 'bold');
  }

  // Seitenzahlen
  const seiten = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.text(`${s.titel} · Seite ${i} von ${seiten}`, SEITE.breite / 2, SEITE.hoehe - SEITE.rand / 2, { align: 'center' });
  }
  doc.setTextColor(0);
  return doc;
}

/** Speichert die Sammlung als PDF-Datei. */
export async function speichereProtokollPdf(s: ProtokollSammlung, dateiname: string): Promise<void> {
  const doc = await zeichneProtokollSammlung(s);
  doc.save(dateiname);
}
