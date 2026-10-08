import { describe, it, expect } from 'vitest';
import { baueKacheln, KEINE_ZAEHLER, MAX_ZIELE, summeBadges, type KachelKontext } from './kacheln';

const ctx = (o: Partial<KachelKontext> = {}): KachelKontext => ({
  freizeitkoordination: false, treffkoordination: false, bewerbend: true, darfTreffmappe: false, leitung: false, treffleitung: false, freizeitTeam: false, treffTeam: false,
  kategorie: 'TeamerIn', freizeiten: [], treffs: [], zaehler: KEINE_ZAEHLER, ...o,
});
const ids = (k: KachelKontext) => baueKacheln(k).flatMap((g) => g.kacheln.map((x) => x.id));
const gruppe = (k: KachelKontext, id: string) => baueKacheln(k).find((g) => g.id === id);
const kachel = (k: KachelKontext, id: string) => baueKacheln(k).flatMap((g) => g.kacheln).find((x) => x.id === id);
const fz = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i + 1}`, name: `Freizeit ${i + 1}` }));

describe('Schnellzugriff: Grundausstattung für alle', () => {
  it('jede angemeldete Person hat Katalog, Mappe, Formulare, Quiz und Konto', () => {
    const w = gruppe(ctx(), 'wissen')!;
    expect(w.kacheln.map((x) => x.id)).toEqual(['katalog', 'teamermappe', 'formulare', 'quiz', 'vorschlagen', 'konto']);
    expect(kachel(ctx(), 'konto')!.pfad).toBe('/mehr');
  });
  it('die Treffmappe nur, wenn das Recht dazu besteht', () => {
    expect(ids(ctx())).not.toContain('treffmappe');
    expect(ids(ctx({ darfTreffmappe: true }))).toContain('treffmappe');
  });
  it('die Koordination (jeder Bereich) schlägt keine Programmpunkte vor, sie legt sie an', () => {
    expect(ids(ctx({ freizeitkoordination: true }))).not.toContain('vorschlagen');
    expect(ids(ctx({ treffkoordination: true }))).not.toContain('vorschlagen');
  });
  it('ohne Rolle, die nicht bewerben darf (Hauptamtliche ohne Zuordnung): nur Wissen und Konto', () => {
    const g = baueKacheln(ctx({ bewerbend: false, kategorie: 'Hauptamtliche*r' }));
    expect(g.map((x) => x.id)).toEqual(['wissen']);
  });
});

describe('Schnellzugriff: Freizeiten', () => {
  it('bewerbende Person ohne Einsatz: „Freizeiten & Bewerben“, keine Reiter-Kacheln', () => {
    const g = gruppe(ctx(), 'freizeiten')!;
    expect(g.kacheln.map((x) => [x.id, x.label])).toEqual([['freizeiten', 'Freizeiten & Bewerben']]);
  });
  it('TeamerIn mit einer Freizeit: direkte Links in die Reiter, kein Lebensmittel', () => {
    const k = ctx({ freizeitTeam: true, freizeiten: fz(1) });
    expect(gruppe(k, 'freizeiten')!.kacheln.map((x) => x.id)).toEqual(['plan', 'hinweise', 'team', 'freizeiten']);
    expect(kachel(k, 'plan')).toMatchObject({ pfad: '/freizeiten/f1/plan' });
    expect(kachel(k, 'hinweise')).toMatchObject({ pfad: '/freizeiten/f1/hinweise' });
    expect(kachel(k, 'team')).toMatchObject({ pfad: '/freizeiten/f1/team' });
    expect(kachel(k, 'freizeiten')!.label).toBe('Alle Freizeiten');
    expect(kachel(k, 'plan')!.ziele).toBeUndefined();
  });
  it('Leitung bekommt zusätzlich Lebensmittel', () => {
    const k = ctx({ freizeitTeam: true, leitung: true, freizeiten: fz(1) });
    expect(kachel(k, 'lebensmittel')).toMatchObject({ pfad: '/freizeiten/f1/lebensmittel' });
  });
  it('mehrere Freizeiten: die Kachel bietet eine Auswahl an (Sammelseite als Rückfall)', () => {
    const k = ctx({ freizeitTeam: true, freizeiten: fz(3) });
    const p = kachel(k, 'plan')!;
    expect(p.pfad).toBe('/freizeiten');
    expect(p.ziele).toEqual([
      { label: 'Freizeit 1', pfad: '/freizeiten/f1/plan' }, { label: 'Freizeit 2', pfad: '/freizeiten/f2/plan' }, { label: 'Freizeit 3', pfad: '/freizeiten/f3/plan' },
    ]);
  });
  it('die Auswahl ist begrenzt', () => {
    const k = ctx({ freizeitTeam: true, freizeiten: fz(MAX_ZIELE + 5) });
    expect(kachel(k, 'plan')!.ziele).toHaveLength(MAX_ZIELE);
  });
  it('ohne aktuelle Freizeit (alle vorbei): keine Reiter-Kacheln, aber die Liste', () => {
    const k = ctx({ freizeitTeam: true, freizeiten: [] });
    expect(gruppe(k, 'freizeiten')!.kacheln.map((x) => x.id)).toEqual(['freizeiten']);
  });
  it('Zahlen hängen an Hinweisen und Lebensmitteln – und nur dort, wo sie größer als 0 sind', () => {
    const k = ctx({ freizeitTeam: true, leitung: true, freizeiten: fz(1), zaehler: { ...KEINE_ZAEHLER, hinweise: 3, knapp: 2 } });
    expect(kachel(k, 'hinweise')!.badge).toBe(3);
    expect(kachel(k, 'lebensmittel')!.badge).toBe(2);
    expect(kachel(k, 'plan')).not.toHaveProperty('badge');
    expect(kachel(ctx({ freizeitTeam: true, freizeiten: fz(1) }), 'hinweise')).not.toHaveProperty('badge');
  });
});

describe('Schnellzugriff: Treffs', () => {
  const treff = [{ id: 't1', name: 'Kindertreff' }];
  it('Betreuerin (FSJ): Dienstplan, Absprachen, Team – ohne Nachweis', () => {
    const k = ctx({ treffTeam: true, treffs: treff, kategorie: 'FSJ' });
    expect(gruppe(k, 'treffs')!.kacheln.map((x) => x.id)).toEqual(['protokoll', 'notizen', 'dienstplan', 'treff-absprachen', 'treff-team', 'treffs']);
    expect(kachel(k, 'dienstplan')!.pfad).toBe('/treffs/t1/dienstplan');
  });
  it('Tagesprotokoll und Notizen für alle im Treff-Team, mit Zahl fehlender Protokolle und offener Notizen', () => {
    const k = ctx({ treffTeam: true, treffs: treff, kategorie: 'FSJ', zaehler: { ...KEINE_ZAEHLER, protokollFehlt: 1, offeneNotizen: 5 } });
    expect(kachel(k, 'protokoll')).toMatchObject({ pfad: '/treffs/t1/protokoll', badge: 1 });
    expect(kachel(k, 'notizen')).toMatchObject({ pfad: '/treffs/t1/notizen', badge: 5 });
    expect(kachel(ctx({ treffTeam: true, treffs: treff }), 'protokoll')).not.toHaveProperty('badge');
  });
  it('mehrere Treffs: Auswahl für Protokoll und Notizen', () => {
    const k = ctx({ treffTeam: true, treffs: [{ id: 't1', name: 'Nord' }, { id: 't2', name: 'Süd' }] });
    expect(kachel(k, 'protokoll')!.ziele).toEqual([{ label: 'Nord', pfad: '/treffs/t1/protokoll' }, { label: 'Süd', pfad: '/treffs/t2/protokoll' }]);
  });
  it('TZK bekommt den Nachweis (ohne Zahl)', () => {
    const k = ctx({ treffTeam: true, treffs: treff, kategorie: 'TZK', zaehler: { ...KEINE_ZAEHLER, nachweise: 4 } });
    expect(kachel(k, 'nachweis')).toMatchObject({ pfad: '/treffs/t1/nachweis' });
    expect(kachel(k, 'nachweis')).not.toHaveProperty('badge');
  });
  it('Treffleitung: Wünsche, Monatsplan, Abwesenheit & Feiertage, Nachweise mit Zahl der eingereichten', () => {
    const k = ctx({ treffTeam: true, treffleitung: true, treffs: treff, kategorie: 'Hauptamtliche*r', zaehler: { ...KEINE_ZAEHLER, wuensche: 2, nachweise: 3, diensteHeute: 1 } });
    expect(gruppe(k, 'treffs')!.kacheln.map((x) => x.id)).toEqual(['protokoll', 'notizen', 'dienstplan', 'treff-absprachen', 'nachweis', 'wuensche', 'monat', 'abwesenheit', 'treff-team', 'treffs']);
    expect(kachel(k, 'wuensche')).toMatchObject({ badge: 2, pfad: '/treffs/t1/dienstplan' });
    expect(kachel(k, 'nachweis')!.badge).toBe(3);
    expect(kachel(k, 'dienstplan')!.badge).toBe(1);
    expect(kachel(k, 'monat')!.pfad).toBe('/treffs/t1/dienstplan?ansicht=monat');
    expect(kachel(k, 'abwesenheit')!.pfad).toBe('/treffs/t1/verwaltung');
  });
  it('wer in keinem Treff ist und nicht Koordination: keine Treff-Gruppe', () => {
    expect(gruppe(ctx({ freizeitTeam: true, freizeiten: fz(1) }), 'treffs')).toBeUndefined();
  });
});

describe('Schnellzugriff: Koordination (beide Bereiche)', () => {
  const k = ctx({ freizeitkoordination: true, treffkoordination: true, bewerbend: false, freizeiten: fz(2), treffs: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }], zaehler: { ...KEINE_ZAEHLER, bewerbungen: 2, vorschlaege: 1 } });
  it('Verwaltung mit allen Aufgaben und den Zahlen offener Bewerbungen und Vorschläge', () => {
    const v = gruppe(k, 'verwaltung')!;
    expect(v.kacheln.map((x) => x.id)).toEqual(['bewerbungen', 'vorschlaege', 'personen', 'neue-freizeit', 'checkliste', 'neuer-treff', 'orte', 'mitteilung', 'kijuko', 'katalog-import', 'quiz-fragen', 'fehler']);
    expect(v.kacheln[0]).toMatchObject({ pfad: '/bewerbungen', badge: 2 });
    expect(v.kacheln[1]).toMatchObject({ pfad: '/katalog/vorschlaege', badge: 1 });
    expect(summeBadges(v)).toBe(3);
  });
  it('sieht auch die Freizeit- und Treff-Kacheln (mit Auswahl der aktuellen Freizeiten) und Lebensmittel', () => {
    expect(gruppe(k, 'freizeiten')!.kacheln.map((x) => x.id)).toEqual(['plan', 'hinweise', 'lebensmittel', 'team', 'vorbereitung', 'freizeiten']);
    expect(kachel(k, 'plan')!.ziele).toHaveLength(2);
    expect(kachel(k, 'dienstplan')!.ziele).toHaveLength(2);
  });
  it('alle anderen sehen die Verwaltung nicht', () => {
    for (const o of [{}, { leitung: true, freizeitTeam: true }, { treffleitung: true, treffTeam: true }]) expect(gruppe(ctx(o), 'verwaltung')).toBeUndefined();
  });
});

describe('Schnellzugriff: mehrere Rollen', () => {
  it('Leitung und Treffleitung zugleich: beide Gruppen, jede Kachel nur einmal', () => {
    const k = ctx({ kategorie: 'Hauptamtliche*r', leitung: true, freizeitTeam: true, treffleitung: true, treffTeam: true, freizeiten: fz(1), treffs: [{ id: 't1', name: 'Treff' }] });
    const alle = ids(k);
    expect(new Set(alle).size).toBe(alle.length);
    expect(baueKacheln(k).map((g) => g.id)).toEqual(['freizeiten', 'treffs', 'wissen']);
    expect(alle).toEqual(expect.arrayContaining(['lebensmittel', 'wuensche', 'plan', 'dienstplan']));
  });
  it('Reihenfolge der Gruppen: Freizeiten, Treffs, Wissen, Verwaltung', () => {
    const k = ctx({ freizeitkoordination: true, treffkoordination: true, freizeiten: fz(1), treffs: [{ id: 't1', name: 'T' }] });
    expect(baueKacheln(k).map((g) => g.id)).toEqual(['freizeiten', 'treffs', 'wissen', 'verwaltung']);
  });
});

describe('Schnellzugriff: Koordination getrennt nach Bereichen', () => {
  const treffs = [{ id: 't1', name: 'A' }];
  const zaehler = { ...KEINE_ZAEHLER, bewerbungen: 2, vorschlaege: 1, knapp: 3, wuensche: 1, nachweise: 4 };

  it('Freizeitenkoordination: Freizeiten, Lebensmittel, Bewerbungen und KiJuKo – aber keine Treffs', () => {
    const k = ctx({ freizeitkoordination: true, bewerbend: false, freizeiten: fz(1), treffs, zaehler });
    expect(baueKacheln(k).map((g) => g.id)).toEqual(['freizeiten', 'wissen', 'verwaltung']);
    expect(kachel(k, 'lebensmittel')).toMatchObject({ badge: 3 });
    expect(gruppe(k, 'verwaltung')!.kacheln.map((x) => x.id)).toEqual(['bewerbungen', 'vorschlaege', 'personen', 'neue-freizeit', 'checkliste', 'orte', 'mitteilung', 'kijuko', 'katalog-import', 'quiz-fragen', 'fehler']);
    expect(ids(k)).not.toContain('neuer-treff');
    expect(ids(k)).not.toContain('protokoll');
  });

  it('Treffkoordination: Treffs, Protokolle, Nachweise und Dienstwünsche – aber keine Freizeiten, Lebensmittel, Bewerbungen, KiJuKo', () => {
    const k = ctx({ treffkoordination: true, bewerbend: false, freizeiten: fz(1), treffs, zaehler });
    expect(baueKacheln(k).map((g) => g.id)).toEqual(['treffs', 'wissen', 'verwaltung']);
    expect(kachel(k, 'nachweis')).toMatchObject({ badge: 4 });
    expect(kachel(k, 'wuensche')).toMatchObject({ badge: 1 });
    expect(gruppe(k, 'verwaltung')!.kacheln.map((x) => x.id)).toEqual(['vorschlaege', 'personen', 'neuer-treff', 'orte', 'mitteilung', 'katalog-import', 'quiz-fragen', 'fehler']);
    for (const weg of ['lebensmittel', 'bewerbungen', 'neue-freizeit', 'kijuko', 'plan']) expect(ids(k)).not.toContain(weg);
  });

  it('gemeinsame Verwaltung (Personen, Orte, Katalog, Quiz, Mitteilungen) hat jede der beiden', () => {
    for (const o of [{ freizeitkoordination: true }, { treffkoordination: true }]) {
      expect(gruppe(ctx(o), 'verwaltung')!.kacheln.map((x) => x.id)).toEqual(expect.arrayContaining(['personen', 'orte', 'mitteilung', 'vorschlaege', 'katalog-import', 'quiz-fragen', 'fehler']));
    }
  });

  it('Treffkoordination ist zugleich Freizeit-Leitung: dann gibt es auch die Freizeit-Kacheln, aber keine Verwaltung der Freizeiten', () => {
    const k = ctx({ treffkoordination: true, leitung: true, freizeitTeam: true, freizeiten: fz(1), treffs, bewerbend: false, kategorie: 'Hauptamtliche*r' });
    expect(ids(k)).toEqual(expect.arrayContaining(['lebensmittel', 'plan', 'protokoll']));
    expect(ids(k)).not.toContain('bewerbungen');
  });
});
