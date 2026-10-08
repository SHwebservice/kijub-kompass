import type { FreizeitDetailDaten, FreizeitZeile, TeamMitglied } from './freizeiten/api';
import { heuteIso } from './freizeiten/logik';
import type { TreffDetailDaten, TreffTeamMitglied } from './treffs/api';

/** Datum in n Tagen (ISO, lokal) – damit Tests nicht vom Kalendertag abhängen. */
export function inTagen(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return heuteIso(d);
}

export const freizeit = (o: Partial<FreizeitZeile> & { id: string }): FreizeitZeile => ({
  name: `Freizeit ${o.id}`, status: 'geplant', ferienzeitraum: null, ferienwoche: null,
  start_datum: inTagen(30), ende_datum: inTagen(34), ort_id: null, ort_name: null,
  max_teilnehmende: null, alter_von: null, alter_bis: null, tags: [], farbe: null, bewerbung_offen: true, typ: null, ...o,
});

export const freizeitDetail = (o: Partial<FreizeitDetailDaten> & { id: string }): FreizeitDetailDaten => ({
  ...freizeit(o), arbeitsbeginn: null, arbeitsende: null, adresse_abw: null, ort_adresse: null, kijuko_entfallen_am: null, ...o,
});

export const mitglied = (o: Partial<TeamMitglied> & { person_id: string }): TeamMitglied => ({
  rolle: 'teamer', vorname: 'Vor', nachname: 'Nach', kategorie: 'TeamerIn', mail: null, telefon: null, ernaehrung: null,
  notizen: null, tzk_regeltage: null, tzk_max_stunden: null, ...o,
});

export const treff = (o: Partial<TreffDetailDaten> & { id: string }): TreffDetailDaten => ({
  name: `Treff ${o.id}`, ort_id: null, ort_name: null, oeffnungszeiten: [], adresse_abw: null, ort_adresse: null, ...o,
});

export const treffMitglied = (o: Partial<TreffTeamMitglied> & { person_id: string }): TreffTeamMitglied => ({
  rolle: 'betreuerin', vorname: 'Vor', nachname: 'Nach', kategorie: 'TZK', mail: null, telefon: null, tzk_regeltage: null, tzk_max_stunden: null, ...o,
});
