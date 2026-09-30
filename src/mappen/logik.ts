import { ICON_WAHL, KODEX_ICONS, MAX_KACHELN, STANDARD, type Faq, type Kachel, type Kodex, type MappeDaten, type MappenSchluessel } from './standard';

/** Fachlogik der Mappen (Suche, Zurückstufen, Bearbeiten) ohne Datenbank und Oberfläche. */

const text = (v: unknown, standard = ''): string => (typeof v === 'string' ? v : standard);
const liste = <T,>(v: unknown, f: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : []);
const ICON_IDS = ICON_WAHL.map((i) => i.id);

/**
 * Macht aus gespeicherten Daten eine vollständige Mappe: fehlt etwas (oder gibt es noch nichts Gespeichertes),
 * gilt der Standardtext. Unbrauchbare Teile werden ignoriert, nie abgestürzt.
 */
export function normalisiere(roh: unknown, schluessel: MappenSchluessel): MappeDaten {
  const std = STANDARD[schluessel];
  if (typeof roh !== 'object' || roh === null) return structuredClone(std);
  const r = roh as Record<string, unknown>;
  const sections = Array.isArray(r.sections)
    ? liste<Kachel>(r.sections, (s, i = 0) => {
      if (typeof s !== 'object' || s === null) return null;
      const o = s as Record<string, unknown>;
      return {
        title: text(o.title), desc: text(o.desc), tags: liste<string>(o.tags, (t) => (typeof t === 'string' ? t : null)),
        icon: typeof o.icon === 'string' && ICON_IDS.includes(o.icon) ? o.icon : ICON_IDS[Number(i) % ICON_IDS.length]!,
        items: liste<string>(o.items, (t) => (typeof t === 'string' ? t : null)),
      };
    })
    : structuredClone(std.sections);
  const standards = Array.isArray(r.standards)
    ? liste<Kodex>(r.standards, (s) => (typeof s === 'object' && s !== null
      ? { icon: text((s as Kodex).icon, 'herz') in KODEX_ICONS ? text((s as Kodex).icon) : 'herz', title: text((s as Kodex).title), text: text((s as Kodex).text) } : null))
    : structuredClone(std.standards);
  const faqs = Array.isArray(r.faqs)
    ? liste<Faq>(r.faqs, (s) => (typeof s === 'object' && s !== null ? { q: text((s as Faq).q), a: text((s as Faq).a) } : null))
    : structuredClone(std.faqs);
  return { sections: sections.slice(0, MAX_KACHELN), standards, faqs, emergencyText: text(r.emergencyText, std.emergencyText) };
}

export const iconVon = (id: string) => ICON_WAHL.find((i) => i.id === id) ?? ICON_WAHL[0]!;

/* ───── Suche ───── */

const enthaelt = (t: string, q: string) => t.toLowerCase().includes(q.toLowerCase());

export const kachelTrifft = (k: Kachel, q: string) => !q.trim() || [k.title, k.desc, ...k.items].some((t) => enthaelt(t, q.trim()));
export const faqTrifft = (f: Faq, q: string) => !q.trim() || enthaelt(f.q, q.trim()) || enthaelt(f.a, q.trim());
export const kodexTrifft = (k: Kodex, q: string) => !q.trim() || enthaelt(k.title, q.trim()) || enthaelt(k.text, q.trim());

export interface Stueck { text: string; treffer: boolean }

/** Zerlegt einen Text in Stücke, damit Treffer ohne HTML-Einfügen hervorgehoben werden können. */
export function hervorheben(t: string, q: string): Stueck[] {
  const s = q.trim();
  if (!s) return [{ text: t, treffer: false }];
  const out: Stueck[] = [];
  const klein = t.toLowerCase();
  const suche = s.toLowerCase();
  let pos = 0;
  for (let i = klein.indexOf(suche); i !== -1; i = klein.indexOf(suche, pos)) {
    if (i > pos) out.push({ text: t.slice(pos, i), treffer: false });
    out.push({ text: t.slice(i, i + s.length), treffer: true });
    pos = i + s.length;
  }
  if (pos < t.length) out.push({ text: t.slice(pos), treffer: false });
  return out.length ? out : [{ text: t, treffer: false }];
}

/* ───── Zurückstufen nach Schlagworten der eigenen Freizeiten ───── */

/**
 * Eine Kachel mit Schlagworten, von denen keines zu den eigenen Freizeiten passt, wird zurückgestuft (nicht ausgeblendet).
 * Ohne Signal (keine Freizeit oder keine Schlagworte der eigenen Freizeiten) wird nichts zurückgestuft.
 */
export function istZurueckgestuft(k: Pick<Kachel, 'tags'>, meineTags: string[]): boolean {
  if (meineTags.length === 0 || k.tags.length === 0) return false;
  return !k.tags.some((t) => meineTags.includes(t));
}

/** Zurückgestufte Kacheln rücken ans Ende, sonst bleibt die Reihenfolge. */
export function ordneKacheln(sections: Kachel[], meineTags: string[]): { kachel: Kachel; index: number; zurueckgestuft: boolean }[] {
  return sections
    .map((kachel, index) => ({ kachel, index, zurueckgestuft: istZurueckgestuft(kachel, meineTags) }))
    .sort((a, b) => Number(a.zurueckgestuft) - Number(b.zurueckgestuft) || a.index - b.index);
}

/* ───── Bearbeiten ───── */

export function verschiebe<T>(l: T[], i: number, richtung: -1 | 1): T[] {
  const j = i + richtung;
  if (i < 0 || j < 0 || i >= l.length || j >= l.length) return l;
  const n = [...l];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

export const neueKachel = (anzahl: number): Kachel => ({ title: '', desc: '', icon: ICON_IDS[anzahl % ICON_IDS.length]!, tags: [], items: [] });

/** Entfernt leere Punkte und leere Fragen; Texte werden gekürzt. */
export function bereinige(d: MappeDaten): MappeDaten {
  return {
    sections: d.sections.map((s) => ({ ...s, title: s.title.trim(), desc: s.desc.trim(), items: s.items.map((i) => i.trim()).filter(Boolean) })),
    standards: d.standards.map((s) => ({ ...s, title: s.title.trim(), text: s.text.trim() })),
    faqs: d.faqs.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q || f.a),
    emergencyText: d.emergencyText.trim(),
  };
}

/** Prüft bereinigte Daten; liefert eine verständliche Meldung oder null. */
export function validiereMappe(d: MappeDaten): string | null {
  if (d.sections.length > MAX_KACHELN) return `Höchstens ${MAX_KACHELN} Kacheln.`;
  const ohneTitel = d.sections.findIndex((s) => !s.title);
  if (ohneTitel >= 0) return `Kachel ${ohneTitel + 1} hat keinen Titel.`;
  const halbeFaq = d.faqs.findIndex((f) => !f.q || !f.a);
  if (halbeFaq >= 0) return `Frage ${halbeFaq + 1} braucht Frage und Antwort.`;
  const ohneKodex = d.standards.findIndex((s) => !s.title);
  if (ohneKodex >= 0) return `Kodex-Eintrag ${ohneKodex + 1} hat keinen Titel.`;
  return null;
}

export const istGleich = (a: MappeDaten, b: MappeDaten) => JSON.stringify(a) === JSON.stringify(b);
