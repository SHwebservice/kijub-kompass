import { KATEGORIEN_ANGEBOT, type AngebotKategorie } from './kategorien';

/** Fachlogik des Katalogs (Programmpunkte) ohne Datenbank und Oberfläche. */

export type Wetter = 'indoor' | 'outdoor' | 'beides';

export const WETTER_LABEL: Record<Wetter, string> = { indoor: 'Indoor', outdoor: 'Outdoor', beides: 'Indoor & Outdoor' };
export const WETTER_ICON: Record<Wetter, string> = { indoor: '🏠', outdoor: '🌳', beides: '🌤️' };

/** Altersgruppen des Katalogs (im Datenbankfeld als Text gespeichert). */
export const ALTER_GRUPPEN = ['6-8', '9-12', '13-16'] as const;
export const alterText = (g: string) => g.replace('-', '–');

export interface Angebot {
  id: string;
  name: string;
  kategorie: AngebotKategorie;
  dauer: string;
  gruppe: string;
  personal: string;
  raum: string;
  alter_gruppen: string[];
  wetter: Wetter | '';
  material: string;
  vorbereitung: string;
  umsetzung: string;
  nachbereitung: string;
  autor: string;
}

/** Eingabe im Formular: alles Text, leer = nicht angegeben. */
export type AngebotFormular = Omit<Angebot, 'id'>;

export const leeresAngebot = (kategorie: AngebotKategorie = 'kennenlernen'): AngebotFormular => ({
  name: '', kategorie, dauer: '', gruppe: '', personal: '', raum: '', alter_gruppen: [], wetter: '',
  material: '', vorbereitung: '', umsetzung: '', nachbereitung: '', autor: '',
});

export const formularAus = ({ id: _id, ...rest }: Angebot): AngebotFormular => rest;

const MAX = { name: 120, kurz: 120, lang: 4000 };

export function validiereAngebot(f: AngebotFormular): { name?: string; kategorie?: string; lang?: string } {
  const fehler: { name?: string; kategorie?: string; lang?: string } = {};
  if (!f.name.trim()) fehler.name = 'Bitte einen Namen eingeben.';
  else if (f.name.trim().length > MAX.name) fehler.name = `Der Name darf höchstens ${MAX.name} Zeichen lang sein.`;
  if (!KATEGORIEN_ANGEBOT.some((k) => k.id === f.kategorie)) fehler.kategorie = 'Bitte eine Kategorie wählen.';
  if ([f.material, f.vorbereitung, f.umsetzung, f.nachbereitung].some((t) => t.length > MAX.lang)) fehler.lang = `Die Textfelder dürfen höchstens ${MAX.lang} Zeichen lang sein.`;
  return fehler;
}

/** Für die Datenbank: Leeres wird zu null, Text gekürzt. */
export function inDatenbankform(f: AngebotFormular) {
  const t = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    name: f.name.trim(), kategorie: f.kategorie, dauer: t(f.dauer), gruppe: t(f.gruppe), personal: t(f.personal), raum: t(f.raum),
    alter_gruppen: f.alter_gruppen, wetter: f.wetter === '' ? null : f.wetter, material: t(f.material), vorbereitung: t(f.vorbereitung),
    umsetzung: t(f.umsetzung), nachbereitung: t(f.nachbereitung), autor: t(f.autor),
  };
}

/** Aus der Datenbank (null → leerer Text). */
export function ausDatenbankform(r: Record<string, unknown>): Angebot {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const wetter = r.wetter === 'indoor' || r.wetter === 'outdoor' || r.wetter === 'beides' ? r.wetter : '';
  return {
    id: String(r.id ?? ''), name: s(r.name), kategorie: r.kategorie as AngebotKategorie, dauer: s(r.dauer), gruppe: s(r.gruppe), personal: s(r.personal),
    raum: s(r.raum), alter_gruppen: Array.isArray(r.alter_gruppen) ? r.alter_gruppen.filter((x): x is string => typeof x === 'string') : [], wetter,
    material: s(r.material), vorbereitung: s(r.vorbereitung), umsetzung: s(r.umsetzung), nachbereitung: s(r.nachbereitung), autor: s(r.autor),
  };
}

/* ───── Suchen und Filtern ───── */

export const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

const suchtext = (a: Angebot) => normal([a.name, a.umsetzung, a.material, a.vorbereitung, a.nachbereitung, a.raum, a.personal, a.dauer, a.gruppe, a.autor, a.alter_gruppen.join(' ')].join(' '));

export interface Filter { suche: string; kategorie: AngebotKategorie | null; wetter: Wetter | null; alter: string | null; nurFavoriten: boolean }

export const keinFilter: Filter = { suche: '', kategorie: null, wetter: null, alter: null, nurFavoriten: false };

export const filterAktiv = (f: Filter) => !!(f.suche.trim() || f.kategorie || f.wetter || f.alter || f.nurFavoriten);

/** Alle Suchbegriffe müssen vorkommen (Groß-/Kleinschreibung und Umlaute egal). Ergebnis nach Name sortiert. */
export function filtere(angebote: Angebot[], f: Filter, favoriten: ReadonlySet<string>): Angebot[] {
  const begriffe = normal(f.suche).split(/\s+/).filter(Boolean);
  return angebote
    .filter((a) => (!f.kategorie || a.kategorie === f.kategorie)
      && (!f.wetter || a.wetter === f.wetter)
      && (!f.alter || a.alter_gruppen.includes(f.alter))
      && (!f.nurFavoriten || favoriten.has(a.id))
      && begriffe.every((b) => suchtext(a).includes(b)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** In der Reihenfolge der Kategorien; leere Kategorien fehlen. */
export function gruppiere(angebote: Angebot[]): { kategorie: AngebotKategorie; label: string; icon: string; eintraege: Angebot[] }[] {
  return KATEGORIEN_ANGEBOT
    .map((k) => ({ kategorie: k.id, label: k.label, icon: k.icon, eintraege: angebote.filter((a) => a.kategorie === k.id) }))
    .filter((g) => g.eintraege.length > 0);
}

/* ───── Ähnliche Programmpunkte (Textvergleich) ───── */

const WORT = /[\p{L}\p{N}]{3,}/gu;
const STOPP = new Set(['und', 'der', 'die', 'das', 'mit', 'für', 'fuer', 'ein', 'eine', 'einen', 'den', 'dem', 'des', 'von', 'auf', 'zum', 'zur', 'ist', 'sind', 'wird', 'werden', 'dann', 'auch', 'oder', 'nach', 'bei', 'als', 'sich', 'nicht', 'alle', 'jede', 'jeder']);

function woerter(t: string): string[] {
  return (normal(t).match(WORT) ?? []).filter((w) => !STOPP.has(w));
}

function haeufigkeit(a: Angebot): Map<string, number> {
  const m = new Map<string, number>();
  const zaehle = (t: string, gewicht: number) => { for (const w of woerter(t)) m.set(w, (m.get(w) ?? 0) + gewicht); };
  zaehle(a.name, 3); zaehle(a.umsetzung, 1); zaehle(a.material, 1); zaehle(a.vorbereitung, 1); zaehle(a.nachbereitung, 1);
  return m;
}

/** Die n ähnlichsten Programmpunkte (TF-IDF und Kosinus-Ähnlichkeit); ohne gemeinsame Wörter gibt es keine Treffer. */
export function aehnliche(a: Angebot, alle: Angebot[], n = 3): Angebot[] {
  const vektoren = new Map(alle.map((x) => [x.id, haeufigkeit(x)]));
  if (!vektoren.has(a.id)) vektoren.set(a.id, haeufigkeit(a));
  const dokumente = vektoren.size;
  const df = new Map<string, number>();
  for (const v of vektoren.values()) for (const w of v.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + dokumente / (df.get(w) ?? 1));
  const gewichtet = (v: Map<string, number>) => new Map([...v].map(([w, c]) => [w, c * idf(w)]));
  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const va = gewichtet(vektoren.get(a.id)!);
  const na = norm(va);
  if (na === 0) return [];
  return alle
    .filter((x) => x.id !== a.id)
    .map((x) => {
      const vx = gewichtet(vektoren.get(x.id)!);
      const nx = norm(vx);
      let skalar = 0;
      for (const [w, g] of va) skalar += g * (vx.get(w) ?? 0);
      return { x, aehnlichkeit: nx === 0 ? 0 : skalar / (na * nx) };
    })
    .filter((e) => e.aehnlichkeit > 0)
    .sort((p, q) => q.aehnlichkeit - p.aehnlichkeit || p.x.name.localeCompare(q.x.name, 'de'))
    .slice(0, n)
    .map((e) => e.x);
}

/* ───── Bewertung ───── */

export const bewertungText = (durchschnitt: number, anzahl: number) =>
  anzahl === 0 ? 'Noch nicht bewertet' : `${durchschnitt.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${anzahl})`;

export const sterne = (n: number) => '★'.repeat(Math.max(0, Math.min(5, Math.round(n)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(n))));
