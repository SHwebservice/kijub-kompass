import { describe, it, expect } from 'vitest';
import {
  darfBestaetigen, darfKommentieren, darfNotizSchreiben, darfKommentarLoeschen, gruppiereNotizen, bestaetigungsStand,
  validiereNotiz, namenListe, istBestaetigtVon, type Notiz,
} from './notizen';

const n = (o: Partial<Notiz> & { id: string }): Notiz => ({
  art: 'hinweis', geltung: 'gesamt', datum: null, text: 't', erstellt_von: null, created_at: '2027-06-01T10:00:00Z',
  bestaetigungen: [], kommentare: [], ...o,
});

describe('Berechtigungen', () => {
  it('Hinweise bestätigen nur TeamerInnen – nicht Leitung, nicht Koordination', () => {
    expect((['teamer', 'leitung', 'koordination', 'gast'] as const).map((r) => darfBestaetigen('hinweis', r))).toEqual([true, false, false, false]);
  });
  it('Absprachen bestätigen Leitung und Koordination, nicht TeamerInnen', () => {
    expect((['teamer', 'leitung', 'koordination', 'gast'] as const).map((r) => darfBestaetigen('absprache', r))).toEqual([false, true, true, false]);
  });
  it('Kommentieren: nur Absprachen, nur Leitung/Koordination', () => {
    expect(darfKommentieren('absprache', 'leitung')).toBe(true);
    expect(darfKommentieren('absprache', 'koordination')).toBe(true);
    expect(darfKommentieren('absprache', 'teamer')).toBe(false);
    expect(darfKommentieren('hinweis', 'leitung')).toBe(false);
  });
  it('Schreiben: Leitung und Koordination', () => {
    expect((['teamer', 'leitung', 'koordination', 'gast'] as const).map(darfNotizSchreiben)).toEqual([false, true, true, false]);
  });
  it('Kommentare löscht der Verfasser oder die Koordination', () => {
    expect(darfKommentarLoeschen({ person_id: 'ich' }, 'leitung', 'ich')).toBe(true);
    expect(darfKommentarLoeschen({ person_id: 'andere' }, 'leitung', 'ich')).toBe(false);
    expect(darfKommentarLoeschen({ person_id: 'andere' }, 'koordination', 'ich')).toBe(true);
  });
});

describe('Gruppierung', () => {
  it('„Gesamt" zuerst (neueste oben), dann Tage aufsteigend mit neuesten Notizen oben', () => {
    const g = gruppiereNotizen([
      n({ id: 'a', created_at: '2027-06-01T00:00:00Z' }),
      n({ id: 'b', created_at: '2027-06-03T00:00:00Z' }),
      n({ id: 'c', geltung: 'tag', datum: '2027-07-07', created_at: '2027-06-02T00:00:00Z' }),
      n({ id: 'd', geltung: 'tag', datum: '2027-07-05', created_at: '2027-06-02T00:00:00Z' }),
      n({ id: 'e', geltung: 'tag', datum: '2027-07-07', created_at: '2027-06-04T00:00:00Z' }),
    ]);
    expect(g.gesamt.map((x) => x.id)).toEqual(['b', 'a']);
    expect(g.tage.map((t) => t.datum)).toEqual(['2027-07-05', '2027-07-07']);
    expect(g.tage[1]!.notizen.map((x) => x.id)).toEqual(['e', 'c']);
  });
  it('Tagesnotiz ohne Datum zählt als „Gesamt" (defensiv)', () => {
    expect(gruppiereNotizen([n({ id: 'x', geltung: 'tag', datum: null })]).gesamt).toHaveLength(1);
  });
  it('leer', () => {
    expect(gruppiereNotizen([])).toEqual({ gesamt: [], tage: [] });
  });
});

describe('Bestätigungen', () => {
  const team = [
    { person_id: 'l', rolle: 'leitung' as const }, { person_id: 't1', rolle: 'teamer' as const },
    { person_id: 't2', rolle: 'teamer' as const }, { person_id: 't3', rolle: 'teamer' as const },
  ];
  it('zählt nur TeamerInnen (die Leitung bestätigt Hinweise nicht)', () => {
    const s = bestaetigungsStand(n({ id: 'a', bestaetigungen: [{ person_id: 't1', at: '' }, { person_id: 'l', at: '' }] }), team);
    expect(s).toEqual({ bestaetigt: 1, gesamt: 3, offen: ['t2', 't3'] });
  });
  it('niemand im Team', () => {
    expect(bestaetigungsStand(n({ id: 'a' }), [])).toEqual({ bestaetigt: 0, gesamt: 0, offen: [] });
  });
  it('istBestaetigtVon', () => {
    const x = n({ id: 'a', bestaetigungen: [{ person_id: 't1', at: '' }] });
    expect(istBestaetigtVon(x, 't1')).toBe(true);
    expect(istBestaetigtVon(x, 't2')).toBe(false);
  });
  it('namenListe: sortiert, unbekannte als „Jemand"', () => {
    expect(namenListe(['b', 'a', 'x'], { a: 'Anna', b: 'Ben' })).toBe('Anna, Ben, Jemand');
    expect(namenListe([], {})).toBe('');
  });
});

describe('validiereNotiz', () => {
  const tage = ['2027-07-05', '2027-07-06'];
  it('Text ist Pflicht und begrenzt', () => {
    expect(validiereNotiz({ text: '  ', geltung: 'gesamt', datum: '' }, tage).text).toBeDefined();
    expect(validiereNotiz({ text: 'x'.repeat(2001), geltung: 'gesamt', datum: '' }, tage).text).toMatch(/2000/);
    expect(validiereNotiz({ text: 'Sonnencreme', geltung: 'gesamt', datum: '' }, tage)).toEqual({});
  });
  it('Tagesnotiz braucht einen Tag innerhalb der Freizeit', () => {
    expect(validiereNotiz({ text: 'x', geltung: 'tag', datum: '' }, tage).datum).toMatch(/Tag wählen/);
    expect(validiereNotiz({ text: 'x', geltung: 'tag', datum: '2027-08-01' }, tage).datum).toMatch(/außerhalb/);
    expect(validiereNotiz({ text: 'x', geltung: 'tag', datum: '2027-07-06' }, tage)).toEqual({});
  });
});
