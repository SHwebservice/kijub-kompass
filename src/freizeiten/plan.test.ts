import { describe, it, expect } from 'vitest';
import {
  zellen, zellenSchluessel, eintragTitel, darfEintragAendern, darfEintragen, darfFreitext, darfSlotsVerwalten, kannAbendHinzufuegen,
  naechstePosition, tauschPositionen, sortiereSlots, filtereAngebote, type PlanEintrag, type Slot, type AngebotKurz,
} from './plan';

const e = (o: Partial<PlanEintrag> & { id: string }): PlanEintrag => ({
  datum: '2027-07-05', slot_id: 's1', angebot_id: null, angebot_name: null, angebot_kategorie: null, freitext: 'x', notiz: null,
  erstellt_von: null, created_at: '2027-06-01T10:00:00Z', ...o,
});
const slots: Slot[] = [{ id: 's2', name: 'Nachmittag', position: 2 }, { id: 's1', name: 'Vormittag', position: 1 }];

describe('Zellen', () => {
  it('gruppiert nach Tag und Slot, in Reihenfolge des Eintragens', () => {
    const m = zellen([
      e({ id: 'c', created_at: '2027-06-03T00:00:00Z' }),
      e({ id: 'a', created_at: '2027-06-01T00:00:00Z' }),
      e({ id: 'b', created_at: '2027-06-02T00:00:00Z', slot_id: 's2' }),
      e({ id: 'd', datum: '2027-07-06' }),
    ]);
    expect(m.get(zellenSchluessel('2027-07-05', 's1'))!.map((x) => x.id)).toEqual(['a', 'c']);
    expect(m.get(zellenSchluessel('2027-07-05', 's2'))!.map((x) => x.id)).toEqual(['b']);
    expect(m.get(zellenSchluessel('2027-07-06', 's1'))!.map((x) => x.id)).toEqual(['d']);
    expect(m.get(zellenSchluessel('2027-07-07', 's1'))).toBeUndefined();
  });
  it('Titel: Katalog vor Freitext, sonst Hinweis', () => {
    expect(eintragTitel({ angebot_name: 'Fangen', freitext: 'egal' })).toBe('Fangen');
    expect(eintragTitel({ angebot_name: null, freitext: 'Eis essen' })).toBe('Eis essen');
    expect(eintragTitel({ angebot_name: null, freitext: null })).toBe('(gelöschter Programmpunkt)');
  });
});

describe('Berechtigungen (gespiegelt aus der Datenbank)', () => {
  it('Leitung und Koordination ändern alle Einträge', () => {
    for (const r of ['leitung', 'koordination'] as const) {
      expect(darfEintragAendern(r, { erstellt_von: 'andere' }, 'ich')).toBe(true);
      expect(darfEintragAendern(r, { erstellt_von: null }, 'ich')).toBe(true);
    }
  });
  it('TeamerInnen nur eigene; Einträge ohne Verfasser (gelöschte Person) nicht', () => {
    expect(darfEintragAendern('teamer', { erstellt_von: 'ich' }, 'ich')).toBe(true);
    expect(darfEintragAendern('teamer', { erstellt_von: 'andere' }, 'ich')).toBe(false);
    expect(darfEintragAendern('teamer', { erstellt_von: null }, 'ich')).toBe(false);
  });
  it('Gäste dürfen nichts', () => {
    expect(darfEintragAendern('gast', { erstellt_von: 'ich' }, 'ich')).toBe(false);
    expect(darfEintragen('gast')).toBe(false);
  });
  it('Eintragen: alle im Team; Freitext und Slots nur Leitung/Koordination', () => {
    expect(['teamer', 'leitung', 'koordination'].map((r) => darfEintragen(r as never))).toEqual([true, true, true]);
    expect(['teamer', 'leitung', 'koordination', 'gast'].map((r) => darfFreitext(r as never))).toEqual([false, true, true, false]);
    expect(['teamer', 'leitung', 'koordination', 'gast'].map((r) => darfSlotsVerwalten(r as never))).toEqual([false, true, true, false]);
  });
});

describe('Slots', () => {
  it('sortiert nach Position', () => {
    expect(sortiereSlots(slots).map((s) => s.id)).toEqual(['s1', 's2']);
  });
  it('Abend nur einmal hinzufügbar (ohne Beachtung der Schreibweise)', () => {
    expect(kannAbendHinzufuegen(slots)).toBe(true);
    expect(kannAbendHinzufuegen([...slots, { id: 's3', name: 'abend', position: 3 }])).toBe(false);
  });
  it('nächste Position', () => {
    expect(naechstePosition(slots)).toBe(3);
    expect(naechstePosition([])).toBe(1);
  });
  it('Tauschen mit dem Nachbarn; am Rand nichts', () => {
    expect(tauschPositionen(slots, 's1', 1)).toEqual([{ id: 's1', position: 2 }, { id: 's2', position: 1 }]);
    expect(tauschPositionen(slots, 's2', -1)).toEqual([{ id: 's2', position: 1 }, { id: 's1', position: 2 }]);
    expect(tauschPositionen(slots, 's1', -1)).toBeNull();
    expect(tauschPositionen(slots, 's2', 1)).toBeNull();
    expect(tauschPositionen(slots, 'unbekannt', 1)).toBeNull();
  });
  it('Tauschen trennt doppelte Positionen sauber', () => {
    const doppelt: Slot[] = [{ id: 'a', name: 'A', position: 1 }, { id: 'b', name: 'B', position: 1 }, { id: 'c', name: 'C', position: 1 }];
    const r = tauschPositionen(doppelt, 'a', 1)!;
    expect(r.map((x) => x.position).sort()).toEqual([1, 2]);
    expect(r[0]!.position).toBe(2);
  });
});

describe('Katalogsuche', () => {
  const a = (id: string, name: string, kategorie = 'bewegung'): AngebotKurz => ({ id, name, kategorie, dauer: null, gruppe: null, wetter: null, alter_gruppen: [] });
  const katalog = [a('1', 'Schnitzeljagd', 'highlight'), a('2', 'Fangen'), a('3', 'Großes Fangspiel'), a('4', 'Wasserbomben-Schlacht', 'wasser')];
  it('findet ohne Beachtung von Groß-/Kleinschreibung, Umlauten und ß', () => {
    expect(filtereAngebote(katalog, 'SCHNITZEL', null).map((x) => x.id)).toEqual(['1']);
    expect(filtereAngebote(katalog, 'grosses', null).map((x) => x.id)).toEqual(['3']);
    expect(filtereAngebote([a('9', 'Bälle werfen')], 'balle', null)).toHaveLength(1);
  });
  it('mehrere Suchwörter müssen alle vorkommen', () => {
    expect(filtereAngebote(katalog, 'fang spiel', null).map((x) => x.id)).toEqual(['3']);
    expect(filtereAngebote(katalog, 'fang xyz', null)).toEqual([]);
  });
  it('Kategorie filtert; leere Suche liefert alle, alphabetisch', () => {
    expect(filtereAngebote(katalog, '', 'wasser').map((x) => x.id)).toEqual(['4']);
    expect(filtereAngebote(katalog, '', null).map((x) => x.name)).toEqual(['Fangen', 'Großes Fangspiel', 'Schnitzeljagd', 'Wasserbomben-Schlacht']);
  });
});
