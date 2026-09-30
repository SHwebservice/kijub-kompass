import { describe, it, expect } from 'vitest';
import {
  aktuelleFreizeiten, darfBestaetigen, gruppiereOffene, knappeJeOrt, laeuftHeute, nichtGeseheneImTeam, offeneFuerMich, ohneLeitung, personenText,
  planNachFreizeit, wuenscheJeTreff, type BestandZeile, type OffeneNotiz, type RollenAuszug, type TeamZeile,
  vorZeit,
} from './logik';

const HEUTE = '2027-07-07';
const rollen = (o: Partial<RollenAuszug> = {}): RollenAuszug => ({ freizeitkoordination: false, treffkoordination: false, leitungFreizeiten: [], teamerFreizeiten: [], treffleitungen: [], betreuerTreffs: [], ...o });
const notiz = (o: Partial<OffeneNotiz> & { id: string }): OffeneNotiz => ({
  art: 'hinweis', geltung: 'gesamt', datum: null, text: 'Text', created_at: '2027-07-01T10:00:00Z', freizeit_id: 'f1', treff_id: null, quelle: 'Sommer-Sause', bestaetigt_von: [], ...o,
});

describe('darfBestaetigen (gespiegelt aus den Datenbankregeln)', () => {
  it('Hinweis: nur TeamerInnen der Freizeit', () => {
    const h = notiz({ id: 'h' });
    expect(darfBestaetigen(h, rollen({ teamerFreizeiten: ['f1'] }))).toBe(true);
    expect(darfBestaetigen(h, rollen({ leitungFreizeiten: ['f1'] }))).toBe(false);
    expect(darfBestaetigen(h, rollen({ freizeitkoordination: true }))).toBe(false);
    expect(darfBestaetigen(h, rollen({ teamerFreizeiten: ['f2'] }))).toBe(false);
  });
  it('Absprache: Leitung der Freizeit und Freizeitenkoordination', () => {
    const a = notiz({ id: 'a', art: 'absprache' });
    expect(darfBestaetigen(a, rollen({ leitungFreizeiten: ['f1'] }))).toBe(true);
    expect(darfBestaetigen(a, rollen({ freizeitkoordination: true }))).toBe(true);
    expect(darfBestaetigen(a, rollen({ treffkoordination: true }))).toBe(false);
    expect(darfBestaetigen(a, rollen({ teamerFreizeiten: ['f1'] }))).toBe(false);
  });
  it('Treff-Absprache: alle im Treff und die Treffkoordination', () => {
    const a = notiz({ id: 'a', art: 'absprache', freizeit_id: null, treff_id: 't1' });
    expect(darfBestaetigen(a, rollen({ betreuerTreffs: ['t1'] }))).toBe(true);
    expect(darfBestaetigen(a, rollen({ treffleitungen: ['t1'] }))).toBe(true);
    expect(darfBestaetigen(a, rollen({ treffkoordination: true }))).toBe(true);
    expect(darfBestaetigen(a, rollen({ freizeitkoordination: true }))).toBe(false);
    expect(darfBestaetigen(a, rollen({ betreuerTreffs: ['t2'] }))).toBe(false);
  });
  it('ohne Freizeit und Treff gibt es nichts zu bestätigen', () => {
    expect(darfBestaetigen(notiz({ id: 'x', freizeit_id: null }), rollen({ freizeitkoordination: true, treffkoordination: true }))).toBe(false);
  });
});

describe('offeneFuerMich', () => {
  const r = rollen({ teamerFreizeiten: ['f1'], betreuerTreffs: ['t1'] });
  it('nur Unbestätigtes, das ich bestätigen darf, neueste zuerst', () => {
    const l = [
      notiz({ id: 'alt', created_at: '2027-07-01T10:00:00Z' }),
      notiz({ id: 'neu', created_at: '2027-07-05T10:00:00Z' }),
      notiz({ id: 'erledigt', bestaetigt_von: ['ich'] }),
      notiz({ id: 'andere-bestaetigt', bestaetigt_von: ['x'] }),
      notiz({ id: 'absprache', art: 'absprache' }),              // darf ich als TeamerIn nicht bestätigen
      notiz({ id: 'treff', art: 'absprache', freizeit_id: null, treff_id: 't1', created_at: '2027-07-03T10:00:00Z' }),
    ];
    expect(offeneFuerMich(l, 'ich', r, HEUTE).map((n) => n.id)).toEqual(['neu', 'treff', 'alt', 'andere-bestaetigt']);
  });
  it('Notizen für einen vergangenen Tag erledigen sich von selbst; für heute und später nicht', () => {
    const l = [
      notiz({ id: 'gestern', geltung: 'tag', datum: '2027-07-06' }),
      notiz({ id: 'heute', geltung: 'tag', datum: HEUTE }),
      notiz({ id: 'morgen', geltung: 'tag', datum: '2027-07-08' }),
    ];
    expect(offeneFuerMich(l, 'ich', r, HEUTE).map((n) => n.id).sort()).toEqual(['heute', 'morgen']);
  });
  it('gleichzeitig erstellte Notizen bekommen eine feste Reihenfolge', () => {
    const l = [notiz({ id: 'b' }), notiz({ id: 'a' })];
    expect(offeneFuerMich(l, 'ich', r, HEUTE).map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('gruppiereOffene', () => {
  it('zählt je Freizeit bzw. Treff, getrennt nach Hinweisen und Absprachen; Reihenfolge nach der neuesten Notiz', () => {
    const l = [
      notiz({ id: '1', freizeit_id: 'f2', quelle: 'Herbst' }),
      notiz({ id: '2', freizeit_id: 'f1', art: 'absprache' }),
      notiz({ id: '3', freizeit_id: 'f2', quelle: 'Herbst' }),
      notiz({ id: '4', freizeit_id: null, treff_id: 't1', art: 'absprache', quelle: 'Treff Nord' }),
    ];
    const g = gruppiereOffene(l);
    expect(g.map((x) => x.schluessel)).toEqual(['freizeit-f2', 'freizeit-f1', 'treff-t1']);
    expect(g[0]).toMatchObject({ typ: 'freizeit', name: 'Herbst', anzahl: 2, hinweise: 2, absprachen: 0 });
    expect(g[1]).toMatchObject({ anzahl: 1, hinweise: 0, absprachen: 1 });
    expect(g[2]).toMatchObject({ typ: 'treff', id: 't1', name: 'Treff Nord' });
  });
  it('leer bleibt leer', () => expect(gruppiereOffene([])).toEqual([]));
});

describe('nichtGeseheneImTeam (für Leitungen)', () => {
  const team: TeamZeile[] = [
    { freizeit_id: 'f1', person_id: 'lea', rolle: 'leitung' }, { freizeit_id: 'f1', person_id: 't1', rolle: 'teamer' }, { freizeit_id: 'f1', person_id: 't2', rolle: 'teamer' },
    { freizeit_id: 'f2', person_id: 'l2', rolle: 'leitung' },
  ];
  it('zählt Hinweise, die noch nicht alle TeamerInnen gesehen haben – die Leitung zählt nicht mit', () => {
    const l = [
      notiz({ id: '1', bestaetigt_von: ['t1'] }),                      // t2 fehlt
      notiz({ id: '2', bestaetigt_von: ['t1', 't2'] }),                // alle
      notiz({ id: '3', bestaetigt_von: [] }),                          // niemand
      notiz({ id: '4', art: 'absprache' }),                            // Absprachen gehören nicht dazu
    ];
    expect(nichtGeseheneImTeam(l, team, ['f1'], HEUTE)).toEqual([{ freizeit_id: 'f1', quelle: 'Sommer-Sause', anzahl: 2 }]);
  });
  it('Freizeiten ohne TeamerInnen und vergangene Tagesnotizen bleiben außen vor', () => {
    const l = [notiz({ id: '1', freizeit_id: 'f2', quelle: 'Herbst' }), notiz({ id: '2', geltung: 'tag', datum: '2027-07-01' })];
    expect(nichtGeseheneImTeam(l, team, ['f1', 'f2'], HEUTE)).toEqual([]);
  });
  it('sortiert nach der Zahl offener Hinweise', () => {
    const t = [...team, { freizeit_id: 'f3', person_id: 'x', rolle: 'teamer' as const }];
    const l = [notiz({ id: '1', freizeit_id: 'f3', quelle: 'A-Freizeit' }), notiz({ id: '2' }), notiz({ id: '3' })];
    expect(nichtGeseheneImTeam(l, t, ['f3', 'f1'], HEUTE).map((x) => x.freizeit_id)).toEqual(['f1', 'f3']);
  });
});

describe('planNachFreizeit', () => {
  it('gruppiert je Freizeit und ordnet nach Zeitabschnitt, dann Titel', () => {
    const m = planNachFreizeit([
      { id: '1', freizeit_id: 'f1', titel: 'Schwimmen', slot: 'Nachmittag', position: 2 },
      { id: '2', freizeit_id: 'f1', titel: 'Zebra-Spiel', slot: 'Vormittag', position: 1 },
      { id: '3', freizeit_id: 'f2', titel: 'Kochen', slot: 'Vormittag', position: 1 },
      { id: '4', freizeit_id: 'f1', titel: 'Ausflug', slot: 'Vormittag', position: 1 },
    ]);
    expect(m.get('f1')!.map((p) => p.titel)).toEqual(['Ausflug', 'Zebra-Spiel', 'Schwimmen']);
    expect(m.get('f2')!).toHaveLength(1);
    expect(m.get('f3')).toBeUndefined();
  });
});

describe('knappeJeOrt', () => {
  const z = (ort_id: string, name: string, status: 'knapp' | 'leer'): BestandZeile => ({ ort_id, name, einheit: null, rest: 0, status });
  it('nur relevante Orte; leere Artikel zuerst; die Orte mit den meisten leeren Artikeln zuerst', () => {
    const r = knappeJeOrt([z('o1', 'Milch', 'knapp'), z('o1', 'Reis', 'leer'), z('o2', 'Kakao', 'leer'), z('o2', 'Brot', 'leer'), z('o3', 'Salz', 'leer')], new Set(['o1', 'o2']));
    expect(r.map((o) => o.ort_id)).toEqual(['o2', 'o1']);
    expect(r[0]).toMatchObject({ leer: 2, knapp: 0 });
    expect(r[1]).toMatchObject({ leer: 1, knapp: 1 });
    expect(r[1]!.artikel.map((a) => a.name)).toEqual(['Reis', 'Milch']);
  });
  it('ohne relevante Orte bleibt nichts', () => expect(knappeJeOrt([z('o1', 'Milch', 'leer')], new Set())).toEqual([]));
});

describe('wuenscheJeTreff', () => {
  it('zählt je Treff und nennt den frühesten Tag; frühester Wunsch zuerst', () => {
    const r = wuenscheJeTreff([
      { person_id: 'a', datum: '2027-07-14', treff_id: 't2' }, { person_id: 'b', datum: '2027-07-09', treff_id: 't1' },
      { person_id: 'c', datum: '2027-07-08', treff_id: 't1' }, { person_id: 'd', datum: '2027-07-20', treff_id: 't2' },
    ]);
    expect(r).toEqual([{ treff_id: 't1', anzahl: 2, erster: '2027-07-08' }, { treff_id: 't2', anzahl: 2, erster: '2027-07-14' }]);
  });
});

describe('aktuelleFreizeiten und Helfer', () => {
  const f = (id: string, start: string, ende: string, status: 'geplant' | 'abgesagt' = 'geplant') => ({ id, status, start_datum: start, ende_datum: ende, ort_id: null });
  it('laufende und in 14 Tagen beginnende, ohne abgesagte und ohne weit entfernte', () => {
    const l = [
      f('laeuft', '2027-07-05', '2027-07-09'), f('bald', '2027-07-21', '2027-07-25'), f('spaeter', '2027-07-22', '2027-07-26'),
      f('vorbei', '2027-06-01', '2027-06-05'), f('abgesagt', '2027-07-06', '2027-07-08', 'abgesagt'),
    ];
    expect(aktuelleFreizeiten(l, HEUTE).map((x) => x.id)).toEqual(['laeuft', 'bald']);
    expect(aktuelleFreizeiten(l, HEUTE, 30).map((x) => x.id)).toEqual(['laeuft', 'bald', 'spaeter']);
  });
  it('laeuftHeute: nur geplante Freizeiten im Zeitraum (Start und Ende einschließlich)', () => {
    expect(laeuftHeute(f('a', HEUTE, '2027-07-10'), HEUTE)).toBe(true);
    expect(laeuftHeute(f('a', '2027-07-01', HEUTE), HEUTE)).toBe(true);
    expect(laeuftHeute(f('a', '2027-07-08', '2027-07-10'), HEUTE)).toBe(false);
    expect(laeuftHeute(f('a', '2027-07-01', '2027-07-06'), HEUTE)).toBe(false);
    expect(laeuftHeute(f('a', '2027-07-05', '2027-07-09', 'abgesagt'), HEUTE)).toBe(false);
  });
  it('ohneLeitung', () => {
    const team: TeamZeile[] = [{ freizeit_id: 'a', person_id: 'p', rolle: 'leitung' }, { freizeit_id: 'b', person_id: 'q', rolle: 'teamer' }];
    expect(ohneLeitung([{ id: 'a' }, { id: 'b' }, { id: 'c' }], team).map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('personenText', () => {
    expect(personenText(1, 'Person', 'Personen')).toBe('1 Person');
    expect(personenText(0, 'Person', 'Personen')).toBe('0 Personen');
  });
});

describe('vorZeit', () => {
  const jetzt = new Date('2027-07-07T12:00:00Z');
  const vor = (min: number) => new Date(jetzt.getTime() - min * 60000).toISOString();
  it('gerade eben, Minuten, Stunden, gestern, Tage', () => {
    expect(vorZeit(vor(0), jetzt)).toBe('gerade eben');
    expect(vorZeit(vor(1), jetzt)).toBe('vor 1 Min.');
    expect(vorZeit(vor(59), jetzt)).toBe('vor 59 Min.');
    expect(vorZeit(vor(60), jetzt)).toBe('vor 1 Std.');
    expect(vorZeit(vor(23 * 60), jetzt)).toBe('vor 23 Std.');
    expect(vorZeit(vor(24 * 60), jetzt)).toBe('gestern');
    expect(vorZeit(vor(4 * 24 * 60), jetzt)).toBe('vor 4 Tagen');
  });
  it('Zeiten in der Zukunft (Uhr weicht ab) gelten als „gerade eben“', () => {
    expect(vorZeit(vor(-5), jetzt)).toBe('gerade eben');
  });
});
