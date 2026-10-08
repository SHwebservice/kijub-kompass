import { formatMenge } from '../freizeiten/lebensmittel';
import { formatKurz } from '../freizeiten/logik';
import type { MeinDienst } from '../treffs/api';
import { dienstZeit } from '../treffs/dienstplan';
import type { Neuigkeit, NeuigkeitArt } from './api';
import { personenText, vorZeit, type NichtGesehen, type NotizGruppe, type OrtBestand, type PlanPunkt, type TreffWuensche } from './logik';

/**
 * Der Feed der Startseite: alles, was Aufmerksamkeit braucht oder gerade passiert, als Karten in einer festen Reihenfolge –
 * erst „Zu erledigen“, dann „Heute“, dann „Neu seit deinem letzten Besuch“. Reine Fachlogik; die Daten kommen aus der Startseite.
 */
export type FeedGruppe = 'erledigen' | 'heute' | 'neu';
export type FeedTon = 'warnung' | 'ruhig' | 'erfolg';

export interface FeedEintrag {
  id: string;
  gruppe: FeedGruppe;
  icon: string;
  ton: FeedTon;
  titel: string;
  text?: string;
  /** Weitere Zeilen unter dem Text (z. B. das Tagesprogramm). */
  zeilen?: string[];
  link: string;
  /** Beschriftung des Knopfes unter der Karte („Jetzt schreiben“). Die ganze Karte ist der Link. */
  aktion?: string;
  zahl?: number;
}

export const NEU_ART: Record<NeuigkeitArt, { icon: string; label: string }> = {
  hinweis: { icon: '📣', label: 'Hinweis' },
  absprache: { icon: '🤝', label: 'Absprache' },
  plan: { icon: '📅', label: 'Wochenplan' },
  protokoll: { icon: '📝', label: 'Protokoll' },
  notiz: { icon: '🗒️', label: 'Notiz' },
  kommentar: { icon: '💬', label: 'Kommentar' },
  bewerbung: { icon: '📥', label: 'Bewerbung' },
  vorschlag: { icon: '💡', label: 'Vorschlag' },
  nachweis: { icon: '🧾', label: 'Nachweis' },
};

export interface FeedEingabe {
  /** Treffs, die heute geöffnet haben und noch kein Protokoll haben. */
  ohneProtokoll: { id: string; name: string }[];
  /** Offene Hinweise und Absprachen zum Bestätigen, je Freizeit bzw. Treff. */
  offene: NotizGruppe[];
  /** Knappe oder leere Lebensmittel an den Orten der eigenen Freizeiten (nur Leitung). */
  knapp: { ort: OrtBestand; freizeitId: string | null; name: string }[];
  /** Hinweise, die im Team noch nicht alle gesehen haben (nur Leitung). */
  nichtGesehen: NichtGesehen[];
  /** Offene Dienstwünsche (nur Treffleitung). */
  wuensche: { treff: TreffWuensche; name: string }[];
  /** Checkliste der Vorbereitung je eigener Freizeit als Leitung: überfällige und bald fällige Punkte (Migration 0029). */
  vorbereitung?: { id: string; name: string; ueberfaellig: number; bald: number }[];
  diensteHeute: MeinDienst[];
  freizeitenHeute: { id: string; name: string; ort_name: string | null; punkte: PlanPunkt[] }[];
  neu: Neuigkeit[];
}

const artikelText = (a: OrtBestand['artikel'][number]) => `${a.name}${a.status === 'leer' ? ' (leer)' : ` (${formatMenge(a.rest)}${a.einheit ? ` ${a.einheit}` : ''})`}`;

export function baueFeed(e: FeedEingabe): FeedEintrag[] {
  const liste: FeedEintrag[] = [];

  for (const t of e.ohneProtokoll) {
    liste.push({ id: `protokoll-${t.id}`, gruppe: 'erledigen', icon: '📝', ton: 'warnung', titel: 'Tagesprotokoll fehlt', text: `${t.name} · heute ist geöffnet – bitte das Protokoll schreiben.`, link: `/treffs/${t.id}/protokoll`, aktion: 'Jetzt schreiben' });
  }
  for (const g of e.offene) {
    const teile = [g.hinweise > 0 && personenText(g.hinweise, 'Hinweis', 'Hinweise'), g.absprachen > 0 && personenText(g.absprachen, 'Absprache', 'Absprachen')].filter(Boolean);
    liste.push({
      id: `offen-${g.schluessel}`, gruppe: 'erledigen', icon: g.typ === 'treff' ? '🤝' : '📣', ton: 'warnung', titel: `${teile.join(' und ')} zum Bestätigen`, text: g.name,
      link: g.typ === 'treff' ? `/treffs/${g.id}/absprachen` : `/freizeiten/${g.id}/hinweise`, aktion: 'Ansehen', zahl: g.anzahl,
    });
  }
  for (const k of e.knapp) {
    liste.push({
      id: `knapp-${k.ort.ort_id}`, gruppe: 'erledigen', icon: '🥕', ton: 'warnung', titel: 'Lebensmittel werden knapp',
      text: `${k.name}: ${k.ort.artikel.map(artikelText).join(', ')}`, link: k.freizeitId ? `/freizeiten/${k.freizeitId}/lebensmittel` : '/freizeiten', aktion: 'Bestand ansehen', zahl: k.ort.leer + k.ort.knapp,
    });
  }
  for (const n of e.nichtGesehen) {
    liste.push({ id: `ungesehen-${n.freizeit_id}`, gruppe: 'erledigen', icon: '👀', ton: 'warnung', titel: 'Hinweise noch nicht von allen gesehen', text: `${n.quelle}: ${personenText(n.anzahl, 'Hinweis', 'Hinweise')} mit offenen Bestätigungen im Team`, link: `/freizeiten/${n.freizeit_id}/hinweise`, zahl: n.anzahl });
  }
  for (const w of e.wuensche) {
    liste.push({
      id: `wunsch-${w.treff.treff_id}`, gruppe: 'erledigen', icon: '🙋', ton: 'warnung', titel: 'Dienstwünsche warten',
      text: `${w.name}: ${personenText(w.treff.anzahl, 'Wunsch wartet', 'Wünsche warten')} auf Antwort, der nächste für ${formatKurz(w.treff.erster)}`, link: `/treffs/${w.treff.treff_id}/dienstplan`, aktion: 'Zum Dienstplan', zahl: w.treff.anzahl,
    });
  }

  for (const v of e.vorbereitung ?? []) {
    if (v.ueberfaellig + v.bald === 0) continue;
    const bald = v.bald > 0 ? `${personenText(v.bald, 'Punkt', 'Punkte')} in den nächsten 7 Tagen` : '';
    liste.push({
      id: `vorbereitung-${v.id}`, gruppe: 'erledigen', icon: '✅', ton: v.ueberfaellig > 0 ? 'warnung' : 'ruhig',
      titel: v.ueberfaellig > 0 ? `Vorbereitung: ${personenText(v.ueberfaellig, 'Punkt ist', 'Punkte sind')} überfällig` : 'Vorbereitung: bald fällig',
      text: [v.name, bald].filter(Boolean).join(' · '),
      link: `/freizeiten/${v.id}/vorbereitung`, aktion: 'Zur Checkliste', zahl: v.ueberfaellig + v.bald,
    });
  }

  for (const d of e.diensteHeute) {
    const zeit = dienstZeit(d);
    liste.push({ id: `dienst-${d.id}`, gruppe: 'heute', icon: '🕒', ton: 'erfolg', titel: `Dienst heute${zeit ? ` · ${zeit} Uhr` : ''}`, text: `${d.treff_name}${d.ist_sonder ? ` · Sonderdienst: ${d.bezeichnung}` : ''}`, link: `/treffs/${d.treff_id}/dienstplan` });
  }
  for (const f of e.freizeitenHeute) {
    liste.push({
      id: `freizeit-${f.id}`, gruppe: 'heute', icon: '🏕️', ton: 'erfolg', titel: `${f.name} läuft`, text: f.ort_name ?? undefined,
      zeilen: f.punkte.length > 0 ? f.punkte.map((p) => `${p.slot}: ${p.titel}`) : ['Für heute steht noch nichts im Wochenplan.'],
      link: `/freizeiten/${f.id}/plan`, aktion: 'Wochenplan',
    });
  }

  e.neu.forEach((n, i) => {
    const art = NEU_ART[n.art];
    liste.push({ id: `neu-${n.url}-${n.zeit}-${i}`, gruppe: 'neu', icon: art?.icon ?? '•', ton: 'ruhig', titel: `${art?.label ?? n.art}: ${n.text}`, text: `${n.quelle} · ${vorZeit(n.zeit)}`, link: n.url });
  });

  return liste;
}

export const jeGruppe = (liste: FeedEintrag[], g: FeedGruppe) => liste.filter((x) => x.gruppe === g);
