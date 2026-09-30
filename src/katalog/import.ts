import { KATEGORIEN_ANGEBOT, type AngebotKategorie } from './kategorien';
import { ALTER_GRUPPEN, leeresAngebot, normal, type AngebotFormular, type Wetter } from './logik';

/** Einlesen von Programmpunkten aus einer JSON-Datei (neues oder altes Format) und aus Word-Dokumenten. */

export interface Importergebnis { eintraege: AngebotFormular[]; meldungen: string[] }

export const MAX_IMPORT = 1000;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function kategorieVon(v: unknown): AngebotKategorie | null {
  const t = normal(text(v));
  const k = KATEGORIEN_ANGEBOT.find((x) => x.id === t || normal(x.label) === t);
  return k ? k.id : null;
}

function wetterVon(v: unknown): Wetter | '' {
  const t = normal(text(v));
  return t === 'indoor' || t === 'outdoor' || t === 'beides' ? t : '';
}

function alterVon(v: unknown): string[] {
  const roh = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/[,;]/) : [];
  const gruppen = roh.map((x) => text(x).replace(/\s+/g, '').replace(/[–—]/g, '-')).filter(Boolean);
  return [...new Set(gruppen)].filter((g) => (ALTER_GRUPPEN as readonly string[]).includes(g));
}

/**
 * Liest eine JSON-Datei: eine Liste von Programmpunkten oder ein Objekt mit der Liste unter „angebote“ bzw. „katalog“.
 * Erkannt werden die Feldnamen des neuen und des alten Katalogs (category/kategorie, alter/alter_gruppen).
 * Einträge ohne Namen oder mit unbekannter Kategorie werden nicht übernommen und als Meldung aufgeführt.
 */
export function lesJson(inhalt: string): Importergebnis {
  let roh: unknown;
  try { roh = JSON.parse(inhalt); } catch { return { eintraege: [], meldungen: ['Die Datei ist kein gültiges JSON.'] }; }
  const liste = Array.isArray(roh) ? roh
    : typeof roh === 'object' && roh !== null && Array.isArray((roh as Record<string, unknown>).angebote) ? (roh as Record<string, unknown[]>).angebote
      : typeof roh === 'object' && roh !== null && Array.isArray((roh as Record<string, unknown>).katalog) ? (roh as Record<string, unknown[]>).katalog
        : null;
  if (!liste) return { eintraege: [], meldungen: ['In der Datei wurde keine Liste von Programmpunkten gefunden.'] };
  if (liste.length > MAX_IMPORT) return { eintraege: [], meldungen: [`Die Datei enthält ${liste.length} Einträge – höchstens ${MAX_IMPORT} auf einmal.`] };

  const eintraege: AngebotFormular[] = [];
  const meldungen: string[] = [];
  liste.forEach((e, i) => {
    const nr = `Eintrag ${i + 1}`;
    if (typeof e !== 'object' || e === null) { meldungen.push(`${nr}: kein Programmpunkt.`); return; }
    const o = e as Record<string, unknown>;
    const name = text(o.name);
    if (!name) { meldungen.push(`${nr}: ohne Namen übersprungen.`); return; }
    const kategorie = kategorieVon(o.kategorie ?? o.category);
    if (!kategorie) { meldungen.push(`${nr} („${name}“): Kategorie „${text(o.kategorie ?? o.category)}“ ist unbekannt – übersprungen.`); return; }
    eintraege.push({
      ...leeresAngebot(kategorie), name, dauer: text(o.dauer), gruppe: text(o.gruppe), personal: text(o.personal), raum: text(o.raum),
      alter_gruppen: alterVon(o.alter_gruppen ?? o.alter), wetter: wetterVon(o.wetter), material: text(o.material), vorbereitung: text(o.vorbereitung),
      umsetzung: text(o.umsetzung), nachbereitung: text(o.nachbereitung), autor: text(o.autor),
    });
  });
  return { eintraege, meldungen };
}

const schluessel = (e: Pick<AngebotFormular, 'name' | 'kategorie'>) => `${e.kategorie}|${normal(e.name)}`;

/** Trennt Einträge, die es im Katalog (gleicher Name und gleiche Kategorie) oder früher in der Datei schon gibt, von den neuen. */
export function trenneDoppelte(neu: AngebotFormular[], vorhanden: Pick<AngebotFormular, 'name' | 'kategorie'>[]): { neu: AngebotFormular[]; doppelte: AngebotFormular[] } {
  const bekannt = new Set(vorhanden.map(schluessel));
  const r = { neu: [] as AngebotFormular[], doppelte: [] as AngebotFormular[] };
  for (const e of neu) {
    if (bekannt.has(schluessel(e))) r.doppelte.push(e);
    else { r.neu.push(e); bekannt.add(schluessel(e)); }
  }
  return r;
}

/* ───── Word ───── */

/**
 * Liest die Tabelle eines Workshop-Plans (als HTML) und befüllt die Felder vor:
 * Titel in Anführungszeichen, Phasen Vorbereitung/Umsetzung/Nachbereitung, Material, Personal und die Summe der Minuten.
 */
export function ausWordHtml(html: string, dateiname: string): Partial<AngebotFormular> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let name = '';
  for (const el of Array.from(doc.querySelectorAll('h1, h2, h3, p'))) {
    const t = (el.textContent ?? '').trim();
    const m = /[„"“](.+?)["“”]/.exec(t);
    if (m) { name = m[1]!.trim(); break; }
    if (!name && /workshop|programmpunkt|plan/i.test(t) && t.length < 100) name = t;
  }
  if (!name) name = dateiname.replace(/\.docx$/i, '');

  const tabelle = doc.querySelector('table');
  if (!tabelle) return { name };

  const phasen = { vorbereitung: [] as string[], umsetzung: [] as string[], nachbereitung: [] as string[] };
  const material: string[] = [];
  let personal = '';
  let minuten = 0;
  let zeitGefunden = false;

  for (const zeile of Array.from(tabelle.querySelectorAll('tr')).slice(1)) {          // erste Zeile = Kopf
    const zellen = Array.from(zeile.querySelectorAll('td, th')).map((c) => (c.textContent ?? '').trim());
    if (zellen.length < 2) continue;
    const [phase = '', mat = '', todo = '', pers = '', zeit = ''] = zellen;
    const p = phase.toLowerCase();
    if (mat) material.push(mat.replace(/\s*\n\s*/g, ', '));
    const ziel = p.includes('vorbereitung') ? 'vorbereitung' : p.includes('umsetzung') || p.includes('durchführung') ? 'umsetzung' : p.includes('nachbereitung') ? 'nachbereitung' : null;
    if (ziel) { if (todo) phasen[ziel].push(todo); else if (mat) phasen[ziel].push(mat); }
    if (pers && !personal) personal = pers.trim();
    const m = /(\d+)\s*min/i.exec(zeit);
    if (m) { minuten += parseInt(m[1]!, 10); zeitGefunden = true; }
  }

  return {
    name, material: material.join('\n'), vorbereitung: phasen.vorbereitung.join('\n'), umsetzung: phasen.umsetzung.join('\n'),
    nachbereitung: phasen.nachbereitung.join('\n'), ...(personal ? { personal } : {}), ...(zeitGefunden ? { dauer: `${minuten} Min.` } : {}),
  };
}
