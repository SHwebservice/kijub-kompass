import { wochentagKurz } from '../freizeiten/logik';
import { dienstStunden, dienstZeit, feiertagAm, geschlossenAm, isoWochentag, monatTage, monatText, schliesszeitText, stundenText, type Abwesenheit, type Dienst, type Feiertag, type Schliesszeit } from './dienstplan';
import { sortiereTreffTeam, type Oeffnungszeit, type TreffMitglied } from './logik';

/**
 * Monatsplan zum Drucken und als PDF: eine Seite DIN A4 quer. Links die Tage des Monats (alle Kalendertage), oben die Mitarbeitenden.
 * X = Dienst, S = Sonderdienst, U = Urlaub, K = krank. Tage ohne Öffnung sind grau, Schließzeiten und Feiertage dunkler grau mit Grund.
 * Das PDF wird mit jsPDF als Text gezeichnet (scharf, durchsuchbar); Schrift und Zeilenhöhe passen sich an, damit alles auf eine Seite passt.
 * „Kann nicht“ steht bewusst nicht im Ausdruck – das ist ein Planungshinweis, kein Teil des Plans.
 */

export type TagArt = 'offen' | 'zu' | 'frei';

export interface PlanZeile {
  datum: string;
  /** "Mo 03." */
  tag: string;
  /** Öffnungszeit des Tages, sonst leer */
  zeit: string;
  art: TagArt;
  /** Je Person (Reihenfolge wie `personen`): "X", "S", "X S", "U", "K", "X U" … */
  zellen: string[];
  /** Feiertag, Schließzeit, Sonderdienste */
  hinweis: string;
  /** Anzahl eingeteilter Personen */
  besetzung: number;
}

export interface Monatsplan {
  titel: string;
  untertitel: string;
  personen: { id: string; vorname: string; nachname: string }[];
  zeilen: PlanZeile[];
  /** Je Person: Zahl der Dienste und Stunden im Monat */
  summen: { dienste: number; stunden: string }[];
}

export interface MonatsplanEingabe {
  treffName: string;
  /** Erster Tag des Monats */
  monat: string;
  oeffnungszeiten: Oeffnungszeit[];
  mitglieder: Pick<TreffMitglied, 'person_id' | 'vorname' | 'nachname' | 'rolle'>[];
  dienste: Dienst[];
  /** Nur Urlaub und krank werden gedruckt („kann nicht“ wird ignoriert). */
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  schliesszeiten: Schliesszeit[];
  treffId: string;
  /** Monat noch in Planung: „vorläufig“ im Titel */
  vorlaeufig?: boolean;
  /** Zeitpunkt des Drucks */
  stand?: Date;
}

const MARKE: Record<'urlaub' | 'krank' | 'sonstiges', string> = { urlaub: 'U', krank: 'K', sonstiges: 'A' };

export function baueMonatsplan(e: MonatsplanEingabe): Monatsplan {
  const team = sortiereTreffTeam(e.mitglieder);
  const summen = team.map(() => ({ dienste: 0, stunden: 0 }));
  const zeilen = monatTage(e.monat).map((datum): PlanZeile => {
    const oeffnung = e.oeffnungszeiten.find((o) => o.wochentag === isoWochentag(datum)) ?? null;
    const feiertag = feiertagAm(datum, e.feiertage, e.treffId);
    const schliesszeit = geschlossenAm(datum, e.schliesszeiten);
    const regulaer = e.dienste.find((d) => d.datum === datum && !d.ist_sonder) ?? null;
    const sonder = e.dienste.filter((d) => d.datum === datum && d.ist_sonder);
    const hinweise = [
      ...(feiertag ? [`Feiertag: ${feiertag.bezeichnung}`] : []),
      ...(schliesszeit ? [schliesszeitText(schliesszeit)] : []),
      ...sonder.map((s) => `Sonderdienst ${s.bezeichnung ?? ''}${dienstZeit(s) ? ` ${dienstZeit(s)}` : ''}`.trim()),
    ];
    const besetzt = new Set<string>();
    const zellen = team.map((m, i) => {
      const teile: string[] = [];
      if (regulaer?.personen.includes(m.person_id)) { teile.push('X'); summen[i]!.dienste += 1; summen[i]!.stunden += dienstStunden(regulaer); besetzt.add(m.person_id); }
      for (const s of sonder.filter((x) => x.personen.includes(m.person_id))) { teile.push('S'); summen[i]!.dienste += 1; summen[i]!.stunden += dienstStunden(s); besetzt.add(m.person_id); }
      const weg = e.abwesenheiten.find((a) => a.datum === datum && a.person_id === m.person_id && a.typ !== 'verhindert');
      if (weg && weg.typ !== 'verhindert') teile.push(MARKE[weg.typ]);
      // „Sonstiges“: was genau (z. B. Fortbildung), steht im Hinweis
      if (weg?.typ === 'sonstiges' && weg.notiz?.trim()) hinweise.push(`${m.vorname}: ${weg.notiz.trim()}`);
      return [...new Set(teile)].join(' ');
    });
    return {
      datum, tag: `${wochentagKurz(datum)} ${datum.slice(8, 10)}.`, zeit: oeffnung ? dienstZeit(oeffnung) : '',
      art: feiertag || schliesszeit ? 'zu' : oeffnung ? 'offen' : 'frei', zellen, hinweis: [...new Set(hinweise)].join(' · '), besetzung: besetzt.size,
    };
  });
  const stand = e.stand ?? new Date();
  return {
    titel: `Dienstplan ${e.treffName} – ${monatText(e.monat)}${e.vorlaeufig ? ' (vorläufig)' : ''}`,
    untertitel: `Stand ${stand.toLocaleDateString('de-DE')} · X = Dienst · S = Sonderdienst · U = Urlaub · K = krank · A = abwesend (Sonstiges) · grau = geschlossen bzw. kein Öffnungstag`,
    personen: team.map((m) => ({ id: m.person_id, vorname: m.vorname, nachname: m.nachname })),
    zeilen,
    summen: summen.map((s) => ({ dienste: s.dienste, stunden: stundenText(Math.round(s.stunden * 100) / 100) })),
  };
}

/* ───── Seite (Maße in mm, DIN A4 quer) ───── */

export const SEITE = { breite: 297, hoehe: 210, rand: 10 } as const;

export interface Raster {
  /** Breiten: Tag, Zeit, je Person, Hinweis */
  tagB: number; zeitB: number; personB: number; hinweisB: number;
  /** Höhen: Kopf (Namen), je Tageszeile, Summenzeile */
  kopfH: number; zeileH: number; summeH: number;
  /** Schriftgröße in pt */
  schrift: number;
  /** Oberkante der Tabelle */
  oben: number;
}

/** Verteilt die Fläche so, dass alle Tage und alle Personen auf eine Seite passen. */
export function berechneRaster(personen: number, tage: number): Raster {
  const breite = SEITE.breite - 2 * SEITE.rand;
  const oben = SEITE.rand + 12;                                  // Platz für Titel und Zeichenerklärung
  const hoehe = SEITE.hoehe - SEITE.rand - oben;
  const tagB = 15; const zeitB = 23;
  const hinweisB = Math.max(38, Math.min(70, breite - tagB - zeitB - Math.max(personen, 1) * 22));
  const personB = (breite - tagB - zeitB - hinweisB) / Math.max(personen, 1);
  const kopfH = 10; const summeH = 9;
  const zeileH = (hoehe - kopfH - summeH) / tage;
  // Schrift: so groß wie Zeilenhöhe und Spaltenbreite erlauben, höchstens 9 pt
  const schrift = Math.max(5, Math.min(9, zeileH * 1.9, personB * 0.9));
  return { tagB, zeitB, personB, hinweisB, kopfH, zeileH, summeH, schrift, oben };
}

export const monatsplanPdfName = (treffName: string, monat: string) =>
  `Dienstplan_${treffName.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}_${monat.slice(0, 7)}.pdf`;

type Doc = InstanceType<typeof import('jspdf').jsPDF>;

/** Kürzt einen Text, bis er in die Breite passt. */
function passend(doc: Doc, text: string, breite: number): string {
  if (doc.getTextWidth(text) <= breite) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > breite) t = t.slice(0, -1);
  return `${t}…`;
}

/** Zeichnet den Monatsplan in ein neues PDF-Dokument (jsPDF wird erst hier geladen). */
export async function zeichneMonatsplan(p: Monatsplan): Promise<Doc> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const r = berechneRaster(p.personen.length, p.zeilen.length);
  const links = SEITE.rand;
  const xPerson = (i: number) => links + r.tagB + r.zeitB + i * r.personB;
  const xHinweis = xPerson(p.personen.length);
  const rechts = xHinweis + r.hinweisB;
  const mitte = (y: number, h: number) => y + h / 2 + (r.schrift * 0.3528) / 2.8;      // Grundlinie für senkrecht mittigen Text

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(passend(doc, p.titel, rechts - links), links, SEITE.rand + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(60);
  doc.text(passend(doc, p.untertitel, rechts - links), links, SEITE.rand + 9);
  doc.setTextColor(0);

  // Kopf: Tag, Zeit, Namen (Vorname / Nachname), Hinweis
  let y = r.oben;
  doc.setFillColor(235, 235, 235); doc.rect(links, y, rechts - links, r.kopfH, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(r.schrift);
  doc.text('Tag', links + 1.2, mitte(y, r.kopfH));
  doc.text('Öffnung', links + r.tagB + 1.2, mitte(y, r.kopfH));
  doc.text('Hinweis', xHinweis + 1.2, mitte(y, r.kopfH));
  p.personen.forEach((m, i) => {
    const b = r.personB - 1.6;
    const x = xPerson(i) + r.personB / 2;
    doc.text(passend(doc, m.vorname, b), x, y + r.kopfH * 0.42, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(passend(doc, m.nachname, b), x, y + r.kopfH * 0.82, { align: 'center' });
    doc.setFont('helvetica', 'bold');
  });
  y += r.kopfH;

  // Tage
  doc.setFontSize(r.schrift);
  for (const z of p.zeilen) {
    if (z.art !== 'offen') {
      const grau = z.art === 'zu' ? 215 : 242;
      doc.setFillColor(grau, grau, grau); doc.rect(links, y, rechts - links, r.zeileH, 'F');
    }
    z.zellen.forEach((c, i) => {
      if (/[UKA]/.test(c)) { doc.setFillColor(255, 228, 196); doc.rect(xPerson(i), y, r.personB, r.zeileH, 'F'); }
    });
    doc.setFont('helvetica', 'bold');
    doc.text(z.tag, links + 1.2, mitte(y, r.zeileH));
    doc.setFont('helvetica', 'normal');
    if (z.zeit) doc.text(passend(doc, z.zeit, r.zeitB - 2), links + r.tagB + 1.2, mitte(y, r.zeileH));
    doc.setFont('helvetica', 'bold');
    z.zellen.forEach((c, i) => { if (c) doc.text(passend(doc, c, r.personB - 1), xPerson(i) + r.personB / 2, mitte(y, r.zeileH), { align: 'center' }); });
    doc.setFont('helvetica', 'normal');
    if (z.hinweis) doc.text(passend(doc, z.hinweis, r.hinweisB - 2), xHinweis + 1.2, mitte(y, r.zeileH));
    y += r.zeileH;
  }

  // Summen je Person
  doc.setFillColor(235, 235, 235); doc.rect(links, y, rechts - links, r.summeH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Summe', links + 1.2, mitte(y, r.summeH));
  doc.setFont('helvetica', 'normal');
  p.summen.forEach((s, i) => {
    const x = xPerson(i) + r.personB / 2;
    doc.text(passend(doc, `${s.dienste} D.`, r.personB - 1), x, y + r.summeH * 0.42, { align: 'center' });
    doc.text(passend(doc, s.stunden, r.personB - 1), x, y + r.summeH * 0.84, { align: 'center' });
  });
  y += r.summeH;

  // Gitter
  doc.setDrawColor(120); doc.setLineWidth(0.15);
  const unten = y;
  for (const x of [links, links + r.tagB, links + r.tagB + r.zeitB, ...p.personen.map((_, i) => xPerson(i + 1)), rechts]) doc.line(x, r.oben, x, unten);
  let yy = r.oben;
  doc.line(links, yy, rechts, yy);
  yy += r.kopfH; doc.setLineWidth(0.35); doc.line(links, yy, rechts, yy); doc.setLineWidth(0.15);
  for (const z of p.zeilen) {
    yy += r.zeileH;
    // Wochenende/Montag etwas kräftiger trennen: Linie unter jedem Sonntag
    const sonntag = isoWochentag(z.datum) === 7;
    if (sonntag) doc.setLineWidth(0.35);
    doc.line(links, yy, rechts, yy);
    if (sonntag) doc.setLineWidth(0.15);
  }
  doc.line(links, unten, rechts, unten);
  return doc;
}

/** Speichert den Monatsplan als PDF-Datei. */
export async function speichereMonatsplanPdf(p: Monatsplan, dateiname: string): Promise<void> {
  const doc = await zeichneMonatsplan(p);
  doc.save(dateiname);
}

/** Öffnet den Monatsplan als PDF in einem neuen Fenster und startet dort den Druck. */
export async function druckeMonatsplanPdf(p: Monatsplan): Promise<void> {
  const doc = await zeichneMonatsplan(p);
  doc.autoPrint();
  const url = doc.output('bloburl');
  const fenster = window.open(url, '_blank');
  if (!fenster) throw new Error('Das Druckfenster wurde vom Browser blockiert. Bitte Pop-ups für diese Seite erlauben oder „Als PDF speichern“ nutzen.');
}
