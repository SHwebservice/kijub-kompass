import { describe, it, expect } from 'vitest';
import {
  anzahlen, darfInTreff, filterePersonen, indexiere, kandidatenFuer, kollidierende, konfliktText, konflikteFuer, mitFreizeitRolle, mitTreffRolle, ohneLeitungIds,
  paarSchluessel, ueberschneidungsPaare, ueberschneiden, entfernenFrage, verfuegbareJahre, waehleFreizeiten, zusammenfassung, type FreizeitSpalte, type FreizeitTeamZeile, type PersonMini, type TreffTeamZeile,
} from './logik';

const f = (id: string, start: string, ende: string, o: Partial<FreizeitSpalte> = {}): FreizeitSpalte => ({ id, name: `Freizeit ${id}`, start_datum: start, ende_datum: ende, status: 'geplant', ...o });
const p = (id: string, o: Partial<PersonMini> = {}): PersonMini => ({ id, vorname: id, nachname: 'Test', kategorie: 'TeamerIn', aktiv: true, ...o });

const HEUTE = '2027-07-10';
const alt = f('alt', '2027-06-01', '2027-06-05');
const laeuft = f('laeuft', '2027-07-08', '2027-07-12');
const bald = f('bald', '2027-07-20', '2027-07-25');
const fern = f('fern', '2028-03-01', '2028-03-05');
const abgesagt = f('weg', '2027-08-01', '2027-08-05', { status: 'abgesagt' });

describe('Spalten', () => {
  it('„aktuell“: laufende und kommende, nicht vergangene und nicht abgesagte, nach Beginn sortiert', () => {
    expect(waehleFreizeiten([fern, alt, bald, abgesagt, laeuft], 'aktuell', HEUTE).map((x) => x.id)).toEqual(['laeuft', 'bald', 'fern']);
  });
  it('ein Jahr: alle Freizeiten, die in diesem Jahr beginnen (auch vergangene)', () => {
    expect(waehleFreizeiten([fern, alt, bald, abgesagt, laeuft], 2027, HEUTE).map((x) => x.id)).toEqual(['alt', 'laeuft', 'bald']);
  });
  it('gleicher Beginn: nach Name, dann ID', () => {
    const a = f('b', '2027-07-20', '2027-07-21', { name: 'Zelten' }); const b = f('a', '2027-07-20', '2027-07-21', { name: 'Angeln' });
    expect(waehleFreizeiten([a, b], 'aktuell', HEUTE).map((x) => x.name)).toEqual(['Angeln', 'Zelten']);
  });
  it('verfügbare Jahre: neuestes zuerst, ohne abgesagte', () => {
    expect(verfuegbareJahre([alt, fern, abgesagt])).toEqual([2028, 2027]);
    expect(verfuegbareJahre([f('x', '2026-01-01', '2026-01-02', { status: 'abgesagt' })])).toEqual([]);
  });
});

describe('Überschneidungen', () => {
  it('Zeiträume überschneiden sich, wenn sie mindestens einen Tag teilen (auch Randtage)', () => {
    expect(ueberschneiden(f('a', '2027-07-01', '2027-07-05'), f('b', '2027-07-05', '2027-07-09'))).toBe(true);
    expect(ueberschneiden(f('a', '2027-07-01', '2027-07-05'), f('b', '2027-07-06', '2027-07-09'))).toBe(false);
    expect(ueberschneiden(f('a', '2027-07-01', '2027-07-31'), f('b', '2027-07-10', '2027-07-11'))).toBe(true);
  });
  const a = f('a', '2027-07-01', '2027-07-05'); const b = f('b', '2027-07-04', '2027-07-08'); const c = f('c', '2027-07-20', '2027-07-25'); const ab = f('ab', '2027-07-03', '2027-07-06', { status: 'abgesagt' });
  const team: FreizeitTeamZeile[] = [
    { freizeit_id: 'a', person_id: 'anna', rolle: 'teamer' }, { freizeit_id: 'b', person_id: 'anna', rolle: 'leitung' }, { freizeit_id: 'c', person_id: 'anna', rolle: 'teamer' },
    { freizeit_id: 'a', person_id: 'ben', rolle: 'teamer' }, { freizeit_id: 'ab', person_id: 'ben', rolle: 'teamer' },
  ];
  const z = indexiere(team, []);
  it('kollidierende: nur Freizeiten, in denen die Person eingeteilt ist und die sich überschneiden', () => {
    expect([...kollidierende('anna', [a, b, c], z)].sort()).toEqual(['a', 'b']);
    expect([...kollidierende('ben', [a, ab], z)]).toEqual([]);                  // abgesagte zählen nicht
  });
  it('konflikteFuer: andere Freizeiten zur selben Zeit, in denen die Person eingeteilt ist', () => {
    expect(konflikteFuer('anna', b, [a, b, c], z).map((x) => x.id)).toEqual(['a']);
    expect(konflikteFuer('anna', c, [a, b, c], z)).toEqual([]);
    expect(konflikteFuer('carla', b, [a, b, c], z)).toEqual([]);
  });
  it('Text für Hinweise', () => {
    expect(konfliktText(a)).toBe('Freizeit a (01.07.2027 – 05.07.2027)');
  });

  describe('akzeptierte Überschneidungen', () => {
    it('der Schlüssel eines Paares hängt nicht von der Reihenfolge ab', () => {
      expect(paarSchluessel('anna', 'a', 'b')).toBe(paarSchluessel('anna', 'b', 'a'));
      expect(paarSchluessel('anna', 'a', 'b')).not.toBe(paarSchluessel('ben', 'a', 'b'));
    });
    it('ein akzeptiertes Paar warnt nicht mehr – nur für diese Person und dieses Paar', () => {
      const ok = new Set([paarSchluessel('anna', 'a', 'b')]);
      expect(konflikteFuer('anna', b, [a, b, c], z, ok)).toEqual([]);
      expect(konflikteFuer('anna', a, [a, b, c], z, ok)).toEqual([]);
      expect([...kollidierende('anna', [a, b, c], z, ok)]).toEqual([]);
      const andere = new Set([paarSchluessel('ben', 'a', 'b'), paarSchluessel('anna', 'a', 'c')]);
      expect(konflikteFuer('anna', b, [a, b, c], z, andere).map((x) => x.id)).toEqual(['a']);
      expect([...kollidierende('anna', [a, b, c], z, andere)].sort()).toEqual(['a', 'b']);
    });
    it('ueberschneidungsPaare: alle Paare der Person, auch akzeptierte, früher beginnende zuerst; abgesagte nicht', () => {
      const paare = ueberschneidungsPaare('anna', [c, b, a], z);
      expect(paare.map((x) => [x.a.id, x.b.id, x.rolleA, x.rolleB])).toEqual([['a', 'b', 'teamer', 'leitung']]);
      expect(ueberschneidungsPaare('ben', [a, ab], z)).toEqual([]);
      expect(ueberschneidungsPaare('carla', [a, b], z)).toEqual([]);
    });
    it('mehrere Überschneidungen ergeben mehrere Paare', () => {
      const d = f('d', '2027-07-03', '2027-07-04');
      const z2 = indexiere([...team, { freizeit_id: 'd', person_id: 'anna', rolle: 'teamer' }], []);
      expect(ueberschneidungsPaare('anna', [a, b, d], z2).map((x) => `${x.a.id}${x.b.id}`)).toEqual(['ad', 'ab', 'db']);
    });
  });
});

describe('Zuordnungen nachschlagen und ändern', () => {
  const ft: FreizeitTeamZeile[] = [{ freizeit_id: 'f1', person_id: 'p1', rolle: 'teamer' }];
  const tt: TreffTeamZeile[] = [{ treff_id: 't1', person_id: 'p1', rolle: 'betreuerin' }];
  it('findet Rollen, null wenn nicht zugeordnet', () => {
    const z = indexiere(ft, tt);
    expect(z.freizeitRolle('f1', 'p1')).toBe('teamer');
    expect(z.freizeitRolle('f1', 'p2')).toBeNull();
    expect(z.treffRolle('t1', 'p1')).toBe('betreuerin');
    expect(z.freizeitenVon('p1')).toHaveLength(1);
    expect(z.treffsVon('p2')).toEqual([]);
  });
  it('ändern ersetzt, hinzufügen ergänzt, null entfernt – ohne die Eingabe zu verändern', () => {
    expect(mitFreizeitRolle(ft, 'f1', 'p1', 'leitung')).toEqual([{ freizeit_id: 'f1', person_id: 'p1', rolle: 'leitung' }]);
    expect(mitFreizeitRolle(ft, 'f2', 'p1', 'teamer')).toHaveLength(2);
    expect(mitFreizeitRolle(ft, 'f1', 'p1', null)).toEqual([]);
    expect(ft).toHaveLength(1);
    expect(mitTreffRolle(tt, 't1', 'p1', 'treffleitung')[0]!.rolle).toBe('treffleitung');
    expect(mitTreffRolle(tt, 't1', 'p1', null)).toEqual([]);
  });
});

describe('Spaltenköpfe', () => {
  const team: FreizeitTeamZeile[] = [
    { freizeit_id: 'a', person_id: '1', rolle: 'leitung' }, { freizeit_id: 'a', person_id: '2', rolle: 'teamer' }, { freizeit_id: 'a', person_id: '3', rolle: 'teamer' }, { freizeit_id: 'b', person_id: '1', rolle: 'teamer' },
  ];
  it('Freizeiten ohne Leitung', () => {
    expect([...ohneLeitungIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }], team)].sort()).toEqual(['b', 'c']);
  });
  it('Anzahl Leitung und TeamerInnen', () => {
    expect(anzahlen('a', team)).toEqual({ leitung: 1, teamer: 2 });
    expect(anzahlen('x', team)).toEqual({ leitung: 0, teamer: 0 });
  });
});

describe('Personen filtern', () => {
  const liste = [p('anna', { kategorie: 'TZK', nachname: 'Adler' }), p('ben', { aktiv: false }), p('carla', { kategorie: 'TZK', nachname: 'Schmidt' })];
  it('ohne Deaktivierte, nach Kategorie und Suche (auch Mail)', () => {
    expect(filterePersonen(liste, { suche: '', kategorie: '', mitDeaktivierten: false }).map((x) => x.id)).toEqual(['anna', 'carla']);
    expect(filterePersonen(liste, { suche: '', kategorie: '', mitDeaktivierten: true })).toHaveLength(3);
    expect(filterePersonen(liste, { suche: '', kategorie: 'TZK', mitDeaktivierten: true }).map((x) => x.id)).toEqual(['anna', 'carla']);
    expect(filterePersonen(liste, { suche: ' ADL ', kategorie: '', mitDeaktivierten: true }).map((x) => x.id)).toEqual(['anna']);
    expect(filterePersonen([{ ...p('x'), mail: 'x@kijub.de' }], { suche: 'kijub', kategorie: '', mitDeaktivierten: false })).toHaveLength(1);
  });
  it('Kandidaten: aktiv, nicht im Team, sortiert nach Nachname', () => {
    const k = kandidatenFuer(liste, new Set(['carla']), { suche: '', kategorie: '' });
    expect(k.map((x) => x.id)).toEqual(['anna']);
    expect(kandidatenFuer([p('z', { nachname: 'Zorn' }), p('a', { nachname: 'Abel' })], new Set(), { suche: '', kategorie: '' }).map((x) => x.id)).toEqual(['a', 'z']);
  });
  it('nur bestimmte Kategorien dürfen in einen Treff', () => {
    expect(['TZK', 'FSJ', 'Praktikum unbezahlt', 'Hauptamtliche*r'].every(darfInTreff)).toBe(true);
    expect(darfInTreff('TeamerIn')).toBe(false);
    expect(darfInTreff('Senior-TeamerIn')).toBe(false);
  });
});

describe('Zusammenfassung', () => {
  const z = indexiere(
    [{ freizeit_id: 'laeuft', person_id: 'anna', rolle: 'teamer' }, { freizeit_id: 'bald', person_id: 'anna', rolle: 'teamer' }, { freizeit_id: 'alt', person_id: 'anna', rolle: 'teamer' }],
    [{ treff_id: 't1', person_id: 'anna', rolle: 'betreuerin' }, { treff_id: 't2', person_id: 'ben', rolle: 'betreuerin' }]);
  it('zählt Freizeiten (ohne vergangene) und Treffs', () => {
    expect(zusammenfassung('anna', [alt, laeuft, bald], z, HEUTE)).toBe('2 Freizeiten · 1 Treff');
    expect(zusammenfassung('ben', [alt, laeuft, bald], z, HEUTE)).toBe('1 Treff');
    expect(zusammenfassung('carla', [alt, laeuft, bald], z, HEUTE)).toBe('');
  });
  it('Einzahl', () => {
    const nur = indexiere([{ freizeit_id: 'bald', person_id: 'x', rolle: 'leitung' }], []);
    expect(zusammenfassung('x', [bald], nur, HEUTE)).toBe('1 Freizeit');
  });
});

describe('Rückfrage beim Entfernen aus einem Treff', () => {
  it('ohne künftige Dienste: schlichte Frage', () => {
    expect(entfernenFrage('Ben Baum', 'Treff Nord', 0)).toBe('Ben Baum aus dem Team von „Treff Nord“ entfernen?');
  });
  it('mit Diensten: Warnung mit Zahl (Einzahl und Mehrzahl), Frage bleibt am Ende', () => {
    expect(entfernenFrage('Ben Baum', 'Treff Nord', 1)).toMatch(/^Achtung: Ben Baum ist noch in einem künftigen Dienst eingeteilt\./);
    expect(entfernenFrage('Ben Baum', 'Treff Nord', 4)).toMatch(/noch in 4 künftigen Diensten eingeteilt/);
    expect(entfernenFrage('Ben Baum', 'Treff Nord', 4).endsWith('Ben Baum aus dem Team von „Treff Nord“ entfernen?')).toBe(true);
    expect(entfernenFrage('Ben Baum', 'Treff Nord', 4)).toContain('vergangene Dienste bleiben');
  });
});
