/**
 * KiJuKo-Backup → Importplan (docs/IMPORT.md).
 *
 * Reine Funktionen ohne Abhängigkeiten, damit sie im Browser, in Tests und per Node laufen.
 * Der Plan enthält NUR Felder, die der Kompass speichert (Datensparsamkeit): keine Geburtsdaten,
 * Adressen, Anreden, Zugangscodes, Budget- oder Aufgabendaten. Die Felder heißen wie die Spalten der
 * Datenbank; die Zusammenführung mit dem Bestand geschieht in der Datenbank (fn_kijuko_import).
 */

export const KATEGORIEN_IMPORT = [
  'TeamerIn', 'Senior-TeamerIn', 'FSJ', 'TZK', 'Praktikum bezahlt', 'Praktikum unbezahlt', 'Hauptamtliche*r',
] as const;
type Kat = (typeof KATEGORIEN_IMPORT)[number];

export interface PlanOrt { kijuko_id: string; name: string; adresse?: string; lieferstelle_nr?: string }

export interface PlanPerson {
  kijuko_id: string;
  kijuko_quelle: 'staff' | 'hauptamtliche';
  vorname: string;
  nachname: string;
  mail: string;
  kategorie: Kat;
  telefon?: string;
  ernaehrung?: 'Mischkost' | 'Vegetarisch' | 'Vegan';
  notizen?: string;
  /** Nur gesetzt, wenn KiJuKo die Person ausdrücklich als inaktiv führt. */
  aktiv?: false;
}

export interface PlanFreizeit {
  kijuko_id: string;
  name: string;
  start_datum: string;
  ende_datum: string;
  status: 'geplant' | 'abgesagt';
  ort_kijuko_id?: string;
  kijuko_code?: string;
  kijuko_serie_id?: string;
  ferienzeitraum?: 'ostern' | 'sommer' | 'herbst';
  ferienwoche?: number;
  arbeitsbeginn?: string;
  arbeitsende?: string;
  alter_von?: number;
  alter_bis?: number;
  max_teilnehmende?: number;
  /** KiJuKo-IDs der Personen, die diese Freizeit leiten. */
  leitung_kijuko_ids: string[];
  /** Freizeit-Typ 1–4 (nur aus KiJuKo 3; Typ 5 „Kooperation“ gibt es im Kompass nicht) */
  typ?: 1 | 2 | 3 | 4;
}

export interface PlanZuteilung { freizeit_kijuko_id: string; person_kijuko_id: string }
export interface PlanVerpflegung {
  freizeit_kijuko_id: string;
  /** null = Gesamtwerte der Freizeit */
  datum: string | null;
  mischkost: number; vegetarisch: number; allergiker: number;
  /** Gerichte laut Speiseplan (nur aus KiJuKo 3) */
  menue_mischkost?: string; menue_vegetarisch?: string; dessert?: string;
}
/** Sonderkost ohne Namen, z. B. „Nüsse“ × 2 (nur aus KiJuKo 3) */
export interface PlanSonderkost { freizeit_kijuko_id: string; text: string; anzahl: number }
/** Was die Koordination zur Freizeit bringt (nur aus KiJuKo 3); Lebensmittel kommen zusätzlich in den Bestand am Ort. */
export interface PlanLieferung {
  kijuko_id: string; freizeit_kijuko_id: string; art: 'lebensmittel' | 'material' | 'ausstattung';
  bezeichnung: string; menge: number; einheit?: string; datum?: string; notiz?: string;
}
export interface PlanMaterial {
  kijuko_id: string; freizeit_kijuko_id: string; name: string; einheit?: string; menge?: number; notiz?: string;
}
export interface Uebersprungen { art: string; name: string; grund: string }

export interface ImportPlan {
  version: 1;
  orte: PlanOrt[];
  personen: PlanPerson[];
  freizeiten: PlanFreizeit[];
  zuteilungen: PlanZuteilung[];
  verpflegung: PlanVerpflegung[];
  material: PlanMaterial[];
  /** Personen im Küchenteam einer Freizeit (nur aus KiJuKo 3) */
  kueche: PlanZuteilung[];
  sonderkost: PlanSonderkost[];
  lieferungen: PlanLieferung[];
  uebersprungen: Uebersprungen[];
  hinweise: string[];
}

export class ImportFormatFehler extends Error {}

/* ───── kleine Helfer ───── */

type Roh = Record<string, unknown>;
const istObjekt = (v: unknown): v is Roh => typeof v === 'object' && v !== null && !Array.isArray(v);
const liste = (v: unknown): Roh[] => (Array.isArray(v) ? v.filter(istObjekt) : []);

export function text(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return undefined;
  const t = v.trim().replace(/\s+/g, ' ');
  return t === '' ? undefined : t;
}

const zahl = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export function istDatum(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "07:30" / "7:30" → "07:30" */
export function uhrzeit(v: unknown): string | undefined {
  const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return undefined;
  const h = Number(m[1]); const min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : undefined;
}

/** "6-11" → {6, 11}; "0", "-" oder Unsinn → keine Angabe. */
export function parseAlter(v: unknown): { alter_von?: number; alter_bis?: number } {
  const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/) : null;
  if (!m) return {};
  const von = Number(m[1]); const bis = Number(m[2]);
  if (von <= 0 || bis <= 0 || bis < von) return {};
  return { alter_von: von, alter_bis: bis };
}

const MAX_WOCHEN = { ostern: 2, sommer: 6, herbst: 2 } as const;

/** "Sommer - Woche 3" → 3 (nur, wenn zur Ferienzeit passend). */
export function parseWoche(v: unknown, zeitraum: keyof typeof MAX_WOCHEN | undefined): number | undefined {
  const m = typeof v === 'string' ? v.match(/(\d+)\s*$/) : null;
  if (!m || !zeitraum) return undefined;
  const n = Number(m[1]);
  return n >= 1 && n <= MAX_WOCHEN[zeitraum] ? n : undefined;
}

/** "29.06.2026" → "2026-06-29" */
export function deDatumZuIso(v: string): string | undefined {
  const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return undefined;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return istDatum(iso) ? iso : undefined;
}

const mailSchluessel = (m: string) => m.trim().toLowerCase();
const mailGueltig = (m: string | undefined): m is string => !!m && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m);

/** Vorname/Nachname aus den KiJuKo-Feldern der Hauptamtlichen (dort steht im Feld "name" meist nur der Nachname). */
export function hauptamtlicheName(vorname: string | undefined, name: string | undefined):
  { vorname: string; nachname: string } | null {
  if (!name && !vorname) return null;
  if (vorname && name) {
    const rest = name.toLowerCase().startsWith(`${vorname.toLowerCase()} `) ? name.slice(vorname.length + 1).trim() : name;
    return rest ? { vorname, nachname: rest } : null;
  }
  const teile = (name ?? '').split(' ').filter(Boolean);
  return teile.length >= 2 ? { vorname: teile[0]!, nachname: teile.slice(1).join(' ') } : null;
}

/* ───── Hauptfunktion ───── */

export function baueImportPlan(roh: unknown): ImportPlan {
  if (istObjekt(roh) && roh.format === KOMPASS_FORMAT) return baueImportPlanAusExport(roh);
  if (!istObjekt(roh) || !Array.isArray(roh.projects) || !Array.isArray(roh.staff) || !Array.isArray(roh.locations)) {
    throw new ImportFormatFehler('Das ist keine Datei aus KiJuKo. In KiJuKo unter „Einstellungen → KiJuB-Kompass“ exportieren und diese Datei wählen.');
  }

  const plan: ImportPlan = {
    version: 1, orte: [], personen: [], freizeiten: [], zuteilungen: [],
    verpflegung: [], material: [], kueche: [], sonderkost: [], lieferungen: [], uebersprungen: [], hinweise: [],
  };
  const skip = (art: string, name: string, grund: string) => plan.uebersprungen.push({ art, name, grund });

  /* Orte – alle, nicht nur genutzte (Orte sind Stammdaten) */
  const ortIds = new Set<string>();
  for (const l of liste(roh.locations)) {
    const id = text(l.id); const name = text(l.name);
    if (!id || !name) { skip('Ort', name ?? '(ohne Namen)', 'Name oder ID fehlt'); continue; }
    if (ortIds.has(id)) continue;
    ortIds.add(id);
    plan.orte.push({ kijuko_id: id, name, adresse: text(l.address), lieferstelle_nr: text(l.lieferstelleNr) });
  }

  /* Personen: Hauptamtliche zuerst (sie gewinnen bei gleicher Mail), dann Ehrenamtliche.
     alias: KiJuKo-ID → ID der Person, die tatsächlich im Plan steht. */
  const alias = new Map<string, string>();
  const mails = new Map<string, string>(); // Mail → kijuko_id im Plan
  const hauptIds = new Set<string>();

  const aufnehmen = (p: PlanPerson, urspruenglicheId: string): boolean => {
    const k = mailSchluessel(p.mail);
    const vorhanden = mails.get(k);
    if (vorhanden) {
      alias.set(urspruenglicheId, vorhanden);
      skip('Person', `${p.vorname} ${p.nachname}`, 'Mail-Adresse steht schon bei einer anderen Person im Import');
      return false;
    }
    mails.set(k, p.kijuko_id);
    alias.set(urspruenglicheId, p.kijuko_id);
    plan.personen.push(p);
    return true;
  };

  for (const h of liste(roh.hauptamtliche)) {
    const id = text(h.id); const mail = text(h.email);
    const n = hauptamtlicheName(text(h.firstName), text(h.name));
    const anzeige = [text(h.firstName), text(h.name)].filter(Boolean).join(' ') || '(ohne Namen)';
    if (!id) { skip('Hauptamtliche', anzeige, 'ID fehlt'); continue; }
    if (!mailGueltig(mail)) { skip('Hauptamtliche', anzeige, 'Keine gültige Mail-Adresse'); continue; }
    if (!n) { skip('Hauptamtliche', anzeige, 'Vor- oder Nachname fehlt'); continue; }
    if (aufnehmen({
      kijuko_id: id, kijuko_quelle: 'hauptamtliche', ...n, mail: mail.trim(), kategorie: 'Hauptamtliche*r',
      telefon: text(h.phone), notizen: text(h.notes),
    }, id)) hauptIds.add(id);
  }

  for (const s of liste(roh.staff)) {
    const id = text(s.id); const mail = text(s.email);
    const vorname = text(s.firstName); const nachname = text(s.lastName);
    const anzeige = [vorname, nachname].filter(Boolean).join(' ') || '(ohne Namen)';
    if (!id) { skip('Person', anzeige, 'ID fehlt'); continue; }
    if (!mailGueltig(mail)) { skip('Person', anzeige, 'Keine gültige Mail-Adresse'); continue; }
    if (!vorname || !nachname) { skip('Person', anzeige, 'Vor- oder Nachname fehlt'); continue; }

    let kategorie: Kat = 'TeamerIn';
    const et = text(s.employmentType);
    if (et && (KATEGORIEN_IMPORT as readonly string[]).includes(et)) kategorie = et as Kat;
    else if (et) plan.hinweise.push(`${anzeige}: Unbekannte Kategorie „${et}" – als TeamerIn übernommen.`);

    const diet = text(s.diet);
    const ernaehrung = diet === 'Mischkost' || diet === 'Vegetarisch' || diet === 'Vegan' ? diet : undefined;
    const allergien = text(s.allergies);
    const notiz = text(s.note);
    const notizen = [allergien && `Allergien: ${allergien}`, notiz].filter(Boolean).join('\n') || undefined;

    aufnehmen({
      kijuko_id: id, kijuko_quelle: 'staff', vorname, nachname, mail: mail.trim(), kategorie,
      telefon: text(s.phone), ernaehrung, notizen,
      ...(s.active === false ? { aktiv: false as const } : {}),
    }, id);
  }

  /* Freizeiten */
  const freizeitIds = new Set<string>();
  for (const p of liste(roh.projects)) {
    const id = text(p.id); const name = text(p.name);
    if (!id || !name) { skip('Freizeit', name ?? '(ohne Namen)', 'Name oder ID fehlt'); continue; }
    if (!istDatum(p.startDate) || !istDatum(p.endDate) || p.startDate > p.endDate) {
      skip('Freizeit', name, 'Start- oder Enddatum fehlt oder ist ungültig'); continue;
    }
    const hp = text(p.holidayPeriod)?.toLowerCase();
    const ferienzeitraum = hp === 'ostern' || hp === 'sommer' || hp === 'herbst' ? hp : undefined;
    const ferienwoche = parseWoche(p.holidayWeek, ferienzeitraum);
    if (text(p.holidayWeek) && !ferienwoche) {
      plan.hinweise.push(`${name}: Ferienwoche „${text(p.holidayWeek)}" passt nicht zur Ferienzeit – ohne Woche übernommen.`);
    }
    const ortId = text(p.locationId);
    if (ortId && !ortIds.has(ortId)) plan.hinweise.push(`${name}: Ort nicht in der Sicherung gefunden – ohne Ort übernommen.`);

    const leitung: string[] = [];
    for (const lid of [text(p.leader1Id), text(p.leader2Id)]) {
      if (!lid) continue;
      const ziel = alias.get(lid);
      if (ziel && hauptIds.has(lid) && !leitung.includes(ziel)) leitung.push(ziel);
      else if (!ziel) plan.hinweise.push(`${name}: Eine Leitung ist nicht importierbar (fehlende Mail oder Daten) und wird übersprungen.`);
    }

    const max = zahl(p.maxParticipants);
    const status = text(p.status)?.toLowerCase() === 'abgesagt' ? 'abgesagt' : 'geplant';
    freizeitIds.add(id);
    plan.freizeiten.push({
      kijuko_id: id, name, start_datum: p.startDate, ende_datum: p.endDate, status,
      ort_kijuko_id: ortId && ortIds.has(ortId) ? ortId : undefined,
      kijuko_code: text(p.code), kijuko_serie_id: text(p.seriesId),
      ferienzeitraum, ferienwoche,
      arbeitsbeginn: uhrzeit(p.workStartTime), arbeitsende: uhrzeit(p.workEndTime),
      ...parseAlter(p.ageRange),
      max_teilnehmende: max && max > 0 ? Math.round(max) : undefined,
      leitung_kijuko_ids: leitung,
    });
  }

  /* Zuteilungen der Ehrenamtlichen */
  const paare = new Set<string>();
  for (const a of liste(roh.allocations)) {
    const fid = text(a.projectId); const sid = text(a.staffId);
    if (!fid || !sid || !freizeitIds.has(fid)) continue;
    const person = alias.get(sid);
    if (!person) continue; // Person wurde übersprungen (steht schon in uebersprungen)
    const key = `${fid}|${person}`;
    if (paare.has(key)) continue;
    paare.add(key);
    plan.zuteilungen.push({ freizeit_kijuko_id: fid, person_kijuko_id: person });
  }

  /* Verpflegung: Gesamtwerte + Tageswerte */
  const summe = (v: unknown) => liste(v).reduce((s, x) => s + (zahl(x.count) ?? 0), 0);
  for (const c of liste(roh.cateringEntries)) {
    const fid = text(c.projectId);
    if (!fid || !freizeitIds.has(fid)) continue;
    plan.verpflegung.push({
      freizeit_kijuko_id: fid, datum: null,
      mischkost: Math.max(0, Math.round(zahl(c.mischkost) ?? 0)),
      vegetarisch: Math.max(0, Math.round(zahl(c.vegetarisch) ?? 0)),
      allergiker: Math.max(0, Math.round(Array.isArray(c.allergiker) ? summe(c.allergiker) : zahl(c.allergiker) ?? 0)),
    });
    const tage = istObjekt(c.dailyPortions) ? c.dailyPortions : {};
    for (const [tag, w] of Object.entries(tage)) {
      const iso = deDatumZuIso(tag);
      if (!iso || !istObjekt(w)) continue;
      plan.verpflegung.push({
        freizeit_kijuko_id: fid, datum: iso,
        mischkost: Math.max(0, Math.round(zahl(w.mischkost) ?? 0)),
        vegetarisch: Math.max(0, Math.round(zahl(w.vegetarisch) ?? 0)),
        allergiker: Math.max(0, Math.round(zahl(w.allergiker) ?? 0)),
      });
    }
  }

  /* Materialbedarf */
  for (const m of liste(roh.materialNeeds)) {
    const id = text(m.id); const fid = text(m.projectId); const name = text(m.name);
    if (!id || !fid || !freizeitIds.has(fid)) continue;
    if (!name) { skip('Material', '(ohne Namen)', 'Name fehlt'); continue; }
    const notiz = text(m.note);
    if (notiz && /beispielzeile/i.test(notiz)) { skip('Material', name, 'Beispielzeile aus KiJuKo („bitte löschen")'); continue; }
    plan.material.push({ kijuko_id: id, freizeit_kijuko_id: fid, name, einheit: text(m.unit), menge: zahl(m.qtyNeeded), notiz });
  }

  return plan;
}

/* ───── KiJuKo 3: „Einstellungen → KiJuB-Kompass → Exportieren“ ───── */

/** Kennung der Exportdatei aus KiJuKo 3 (dort src/shared/kompassExport.ts). */
export const KOMPASS_FORMAT = 'kijuko-kompass';

const FERIEN_KOMPASS: Record<string, 'ostern' | 'sommer' | 'herbst'> = { Ostern: 'ostern', Sommer: 'sommer', Herbst: 'herbst' };

/** Unvollständige Kennziffern (KiJuKo setzt "?" bzw. "…" für fehlende Teile) werden nicht übernommen. */
const kennzifferOk = (v: unknown) => { const t = text(v); return t && !/[?…]/.test(t) ? t : undefined; };

/**
 * Exportdatei aus KiJuKo 3 → Importplan. Die Datei enthält schon nur die Felder, die der Kompass braucht;
 * es gelten dieselben Regeln wie beim alten Backup (gültige Mail, Name, Datum; Hauptamtliche gewinnen bei gleicher Mail).
 * In KiJuKo 3 kann jede Person Leitung sein, nicht nur Hauptamtliche.
 */
export function baueImportPlanAusExport(roh: Roh): ImportPlan {
  if (roh.version !== 1) {
    throw new ImportFormatFehler('Diese KiJuKo-Datei stammt aus einer neueren KiJuKo-Version. Bitte den Kompass aktualisieren.');
  }
  const plan: ImportPlan = {
    version: 1, orte: [], personen: [], freizeiten: [], zuteilungen: [],
    verpflegung: [], material: [], kueche: [], sonderkost: [], lieferungen: [], uebersprungen: [], hinweise: [],
  };
  const skip = (art: string, name: string, grund: string) => plan.uebersprungen.push({ art, name, grund });

  /* Orte */
  const ortIds = new Set<string>();
  for (const o of liste(roh.orte)) {
    const id = text(o.id); const name = text(o.name);
    if (!id || !name) { skip('Ort', name ?? '(ohne Namen)', 'Name oder ID fehlt'); continue; }
    if (ortIds.has(id)) continue;
    ortIds.add(id);
    plan.orte.push({ kijuko_id: id, name, adresse: text(o.adresse), lieferstelle_nr: text(o.lieferstelleNr) });
  }

  /* Personen – Hauptamtliche zuerst, damit sie bei gleicher Mail gewinnen */
  const alias = new Map<string, string>();
  const mails = new Map<string, string>();
  const personen = liste(roh.personen).sort((a, b) => Number(b.hauptamt === true) - Number(a.hauptamt === true));
  for (const s of personen) {
    const id = text(s.id); const mail = text(s.email);
    const vorname = text(s.vorname); const nachname = text(s.nachname);
    const anzeige = [vorname, nachname].filter(Boolean).join(' ') || '(ohne Namen)';
    if (!id) { skip('Person', anzeige, 'ID fehlt'); continue; }
    if (!mailGueltig(mail)) { skip('Person', anzeige, 'Keine gültige Mail-Adresse'); continue; }
    const n = vorname && nachname ? { vorname, nachname } : hauptamtlicheName(undefined, nachname ?? vorname);
    if (!n) { skip('Person', anzeige, 'Vor- oder Nachname fehlt'); continue; }

    const haupt = s.hauptamt === true;
    let kategorie: Kat = haupt ? 'Hauptamtliche*r' : 'TeamerIn';
    const art = text(s.beschaeftigungsart);
    if (!haupt && art && (KATEGORIEN_IMPORT as readonly string[]).includes(art)) kategorie = art as Kat;
    else if (!haupt && art) plan.hinweise.push(`${anzeige}: Beschäftigungsart „${art}" gibt es im Kompass nicht – als TeamerIn übernommen.`);

    // Allergien und Notizen bleiben in KiJuKo (Entscheidung 2026-10-08)
    const diet = text(s.ernaehrung);
    const k = mailSchluessel(mail);
    const vorhanden = mails.get(k);
    if (vorhanden) {
      alias.set(id, vorhanden);
      skip('Person', `${n.vorname} ${n.nachname}`, 'Mail-Adresse steht schon bei einer anderen Person im Import');
      continue;
    }
    mails.set(k, id); alias.set(id, id);
    plan.personen.push({
      kijuko_id: id, kijuko_quelle: haupt ? 'hauptamtliche' : 'staff', ...n, mail: mail.trim(), kategorie,
      telefon: text(s.telefon),
      ernaehrung: diet === 'Mischkost' || diet === 'Vegetarisch' || diet === 'Vegan' ? diet : undefined,
      ...(s.aktiv === false ? { aktiv: false as const } : {}),
    });
  }

  /* Freizeiten mit Leitung und Team */
  const freizeitIds = new Set<string>();
  const paare = new Set<string>();
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(text).filter((x): x is string => !!x) : []);
  for (const f of liste(roh.freizeiten)) {
    const id = text(f.id); const name = text(f.name);
    if (!id || !name) { skip('Freizeit', name ?? '(ohne Namen)', 'Name oder ID fehlt'); continue; }
    if (!istDatum(f.von) || !istDatum(f.bis) || f.von > f.bis) { skip('Freizeit', name, 'Start- oder Enddatum fehlt oder ist ungültig'); continue; }
    const ferien = istObjekt(f.ferien) ? f.ferien : null;
    const ferienzeitraum = ferien ? FERIEN_KOMPASS[text(ferien.art) ?? ''] : undefined;
    const nummer = zahl(ferien?.nummer);
    const ferienwoche = nummer !== undefined ? parseWoche(String(nummer), ferienzeitraum) : undefined;
    if (ferienzeitraum && nummer !== undefined && !ferienwoche) {
      plan.hinweise.push(`${name}: Ferienwoche ${nummer} passt nicht zur Ferienzeit – ohne Woche übernommen.`);
    }
    const ortId = text(f.ortId);
    if (ortId && !ortIds.has(ortId)) plan.hinweise.push(`${name}: Ort nicht in der Datei gefunden – ohne Ort übernommen.`);

    const leitung: string[] = [];
    for (const pid of ids(f.leitung)) {
      const ziel = alias.get(pid);
      if (!ziel) { plan.hinweise.push(`${name}: Eine Leitung ist nicht importierbar (fehlende Mail oder Daten) und wird übersprungen.`); continue; }
      if (!leitung.includes(ziel)) leitung.push(ziel);
    }
    for (const pid of ids(f.team)) {
      const ziel = alias.get(pid);
      if (!ziel || leitung.includes(ziel) || paare.has(`${id}|${ziel}`)) continue;
      paare.add(`${id}|${ziel}`);
      plan.zuteilungen.push({ freizeit_kijuko_id: id, person_kijuko_id: ziel });
    }
    const kueche = new Set<string>();
    for (const pid of ids(f.kueche)) {
      const ziel = alias.get(pid);
      if (ziel && !kueche.has(ziel)) { kueche.add(ziel); plan.kueche.push({ freizeit_kijuko_id: id, person_kijuko_id: ziel }); }
    }
    const sorten = new Set<string>();
    for (const k of liste(f.sonderkost)) {
      const t = text(k.text); const n = zahl(k.anzahl);
      if (!t || !n || n < 1 || sorten.has(t)) continue;
      sorten.add(t);
      plan.sonderkost.push({ freizeit_kijuko_id: id, text: t, anzahl: Math.round(n) });
    }

    const max = zahl(f.maxTeilnehmende);
    const typ = ({ '1': 1, '2': 2, '3': 3, '4': 4 } as const)[text(f.freizeittyp) as '1' | '2' | '3' | '4'];
    freizeitIds.add(id);
    plan.freizeiten.push({
      kijuko_id: id, name, start_datum: f.von, ende_datum: f.bis,
      status: text(f.status)?.toLowerCase() === 'abgesagt' ? 'abgesagt' : 'geplant',
      ort_kijuko_id: ortId && ortIds.has(ortId) ? ortId : undefined,
      kijuko_code: kennzifferOk(f.kennziffer), kijuko_serie_id: text(f.serieId),
      ferienzeitraum, ferienwoche,
      arbeitsbeginn: uhrzeit(f.arbeitsbeginn), arbeitsende: uhrzeit(f.arbeitsende),
      ...parseAlter(f.altersgruppe),
      max_teilnehmende: max && max > 0 ? Math.round(max) : undefined,
      leitung_kijuko_ids: leitung,
      ...(typ ? { typ } : {}),
    });
  }

  /* Essenszahlen und Gerichte je Tag (KiJuKo 3 rechnet sie aus Teilnehmenden und Personal; eine Gesamtzeile gibt es nicht mehr) */
  const tage = new Set<string>();
  const anzahl = (x: unknown) => Math.max(0, Math.round(zahl(x) ?? 0));
  for (const v of liste(roh.verpflegung)) {
    const fid = text(v.freizeitId);
    if (!fid || !freizeitIds.has(fid) || !istDatum(v.datum) || tage.has(`${fid}|${v.datum}`)) continue;
    tage.add(`${fid}|${v.datum}`);
    const g = istObjekt(v.gerichte) ? v.gerichte : {};
    plan.verpflegung.push({
      freizeit_kijuko_id: fid, datum: v.datum, mischkost: anzahl(v.mischkost), vegetarisch: anzahl(v.vegetarisch), allergiker: anzahl(v.allergiker),
      menue_mischkost: text(g.mischkost), menue_vegetarisch: text(g.vegetarisch), dessert: text(g.dessert),
    });
  }

  /* Materialbedarf */
  for (const m of liste(roh.material)) {
    const id = text(m.id); const fid = text(m.freizeitId); const name = text(m.name);
    if (!id || !fid || !freizeitIds.has(fid)) continue;
    if (!name) { skip('Material', '(ohne Namen)', 'Name fehlt'); continue; }
    const notiz = text(m.notiz);
    if (notiz && /beispielzeile/i.test(notiz)) { skip('Material', name, 'Beispielzeile aus KiJuKo („bitte löschen")'); continue; }
    plan.material.push({ kijuko_id: id, freizeit_kijuko_id: fid, name, einheit: text(m.einheit), menge: zahl(m.menge), notiz });
  }

  /* Lieferungen */
  const ARTEN_LIEFERUNG = ['lebensmittel', 'material', 'ausstattung'] as const;
  const ohneOrt = new Set<string>();
  for (const l of liste(roh.lieferungen)) {
    const id = text(l.id); const fid = text(l.freizeitId); const bez = text(l.bezeichnung); const menge = zahl(l.menge);
    const art = ARTEN_LIEFERUNG.find((a) => a === l.art);
    if (!id || !fid || !freizeitIds.has(fid) || !art) continue;
    if (!bez || !menge || menge <= 0) { skip('Lieferung', bez ?? '(ohne Bezeichnung)', 'Bezeichnung oder Menge fehlt'); continue; }
    const fz = plan.freizeiten.find((x) => x.kijuko_id === fid)!;
    if (art === 'lebensmittel' && !fz.ort_kijuko_id) ohneOrt.add(fz.name);
    plan.lieferungen.push({
      kijuko_id: id, freizeit_kijuko_id: fid, art, bezeichnung: bez, menge,
      einheit: text(l.einheit), datum: istDatum(l.datum) ? l.datum : undefined, notiz: text(l.notiz),
    });
  }
  for (const name of ohneOrt) plan.hinweise.push(`${name}: Freizeit ohne Ort – Lebensmittel-Lieferungen erscheinen nicht im Lebensmittel-Bestand.`);

  return plan;
}

/** SHA-256 der Datei als Hex-Text (Nachweis, welche Datei importiert wurde). */
export async function sha256Hex(daten: ArrayBuffer): Promise<string> {
  // Browser stellen crypto.subtle nur auf sicheren Seiten bereit (HTTPS oder localhost) – sonst gibt es eine klare Meldung statt eines Rätsels.
  if (!globalThis.crypto?.subtle) throw new Error('crypto.subtle ist nicht verfügbar (Seite nicht über HTTPS oder localhost geöffnet)');
  const h = await crypto.subtle.digest('SHA-256', daten);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
