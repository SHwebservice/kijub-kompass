import { describe, it, expect } from 'vitest';
import { baueKacheln, KEINE_ZAEHLER, MAX_ZIELE, type KachelKontext } from './kacheln';

const ctx = (o: Partial<KachelKontext> = {}): KachelKontext => ({
  freizeitkoordination: false, treffkoordination: false, leitung: false, treffleitung: false, freizeitTeam: false, treffTeam: false,
  kategorie: 'TeamerIn', freizeiten: [], treffs: [], zaehler: KEINE_ZAEHLER, ...o,
});
const ids = (k: KachelKontext) => baueKacheln(k).flatMap((g) => g.kacheln.map((x) => x.id));
const gruppe = (k: KachelKontext, id: string) => baueKacheln(k).find((g) => g.id === id);
const kachel = (k: KachelKontext, id: string) => baueKacheln(k).flatMap((g) => g.kacheln).find((x) => x.id === id);
const fz = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i + 1}`, name: `Freizeit ${i + 1}` }));
const tr = [{ id: 't1', name: 'Treff 1' }];

describe('Schnellzugriff: nur Direktlinks in die eigenen Freizeiten und Treffs', () => {
  it('ohne eigene Freizeit oder eigenen Treff: kein Schnellzugriff (Navigation und „Mehr“ reichen)', () => {
    expect(baueKacheln(ctx())).toEqual([]);
    expect(baueKacheln(ctx({ kategorie: 'Hauptamtliche*r' }))).toEqual([]);
    expect(baueKacheln(ctx({ freizeitTeam: true, freizeiten: [] }))).toEqual([]);
  });
  it('nichts, was schon in der Navigation oder unter „Mehr“ steht', () => {
    const alles = ids(ctx({ freizeitkoordination: true, treffkoordination: true, freizeitTeam: true, treffTeam: true, leitung: true, treffleitung: true, freizeiten: fz(2), treffs: tr }));
    for (const weg of ['freizeiten', 'treffs', 'katalog', 'teamermappe', 'treffmappe', 'formulare', 'quiz', 'vorschlagen', 'konto', 'bewerbungen', 'vorschlaege', 'personen', 'orte', 'mitteilung', 'fehler', 'wuensche', 'monat', 'treff-absprachen']) {
      expect(alles).not.toContain(weg);
    }
    expect(new Set(alles).size).toBe(alles.length);
  });
});

describe('Schnellzugriff: Freizeiten', () => {
  it('TeamerIn mit einer Freizeit: direkte Links in die Reiter, kein Lebensmittel', () => {
    const k = ctx({ freizeitTeam: true, freizeiten: fz(1) });
    expect(gruppe(k, 'freizeiten')!.kacheln.map((x) => x.id)).toEqual(['plan', 'hinweise', 'team']);
    expect(kachel(k, 'plan')).toMatchObject({ pfad: '/freizeiten/f1/plan' });
    expect(kachel(k, 'hinweise')).toMatchObject({ pfad: '/freizeiten/f1/hinweise' });
    expect(kachel(k, 'team')).toMatchObject({ pfad: '/freizeiten/f1/team' });
    expect(kachel(k, 'plan')!.ziele).toBeUndefined();
  });
  it('Leitung bekommt zusätzlich Lebensmittel und Vorbereitung', () => {
    const k = ctx({ freizeitTeam: true, leitung: true, freizeiten: fz(1) });
    expect(kachel(k, 'lebensmittel')).toMatchObject({ pfad: '/freizeiten/f1/lebensmittel' });
    expect(kachel(k, 'vorbereitung')).toMatchObject({ pfad: '/freizeiten/f1/vorbereitung' });
  });
  it('mehrere Freizeiten: die Kachel bietet eine Auswahl an (Sammelseite als Rückfall)', () => {
    const p = kachel(ctx({ freizeitTeam: true, freizeiten: fz(3) }), 'plan')!;
    expect(p.pfad).toBe('/freizeiten');
    expect(p.ziele).toEqual([
      { label: 'Freizeit 1', pfad: '/freizeiten/f1/plan' }, { label: 'Freizeit 2', pfad: '/freizeiten/f2/plan' }, { label: 'Freizeit 3', pfad: '/freizeiten/f3/plan' },
    ]);
  });
  it('die Auswahl ist begrenzt', () => {
    expect(kachel(ctx({ freizeitTeam: true, freizeiten: fz(MAX_ZIELE + 5) }), 'plan')!.ziele).toHaveLength(MAX_ZIELE);
  });
  it('keine Zahlen an Hinweisen und Lebensmitteln – die stehen im Feed bzw. im Überblick', () => {
    const k = ctx({ freizeitTeam: true, leitung: true, freizeiten: fz(1), zaehler: { ...KEINE_ZAEHLER, hinweise: 3, knapp: 2 } });
    expect(kachel(k, 'hinweise')!.badge).toBeUndefined();
    expect(kachel(k, 'lebensmittel')!.badge).toBeUndefined();
  });
});

describe('Schnellzugriff: Treffs', () => {
  it('BetreuerIn (FSJ): Tagesprotokoll, Notizen, Dienstplan – ohne Nachweis und Abwesenheit', () => {
    expect(gruppe(ctx({ treffTeam: true, kategorie: 'FSJ', treffs: tr }), 'treffs')!.kacheln.map((x) => x.id)).toEqual(['protokoll', 'notizen', 'dienstplan']);
  });
  it('TZK bekommt den Stundennachweis', () => {
    expect(ids(ctx({ treffTeam: true, kategorie: 'TZK', treffs: tr }))).toContain('nachweis');
  });
  it('offene Notizen tragen eine Zahl (stehen sonst nirgends); fehlende Protokolle und Dienste heute nicht (stehen im Feed)', () => {
    const k = ctx({ treffTeam: true, treffs: tr, zaehler: { ...KEINE_ZAEHLER, offeneNotizen: 4, protokollFehlt: 1, diensteHeute: 2 } });
    expect(kachel(k, 'notizen')!.badge).toBe(4);
    expect(kachel(k, 'protokoll')!.badge).toBeUndefined();
    expect(kachel(k, 'dienstplan')!.badge).toBeUndefined();
  });
  it('Treffleitung: Nachweis mit Zahl der eingereichten, Abwesenheiten (im Dienstplan)', () => {
    const k = ctx({ treffTeam: true, treffleitung: true, treffs: tr, zaehler: { ...KEINE_ZAEHLER, nachweise: 2 } });
    expect(kachel(k, 'nachweis')).toMatchObject({ pfad: '/treffs/t1/nachweis', badge: 2 });
    expect(kachel(k, 'abwesenheit')).toMatchObject({ label: 'Abwesenheiten', pfad: '/treffs/t1/dienstplan?ansicht=monat&zeige=abwesenheiten' });
  });
  it('Treffkoordination: Nachweis ohne Zahl (die steht im Überblick oben)', () => {
    const k = ctx({ treffkoordination: true, treffleitung: true, treffs: tr, zaehler: { ...KEINE_ZAEHLER, nachweise: 2 } });
    expect(kachel(k, 'nachweis')!.badge).toBeUndefined();
  });
});

describe('Schnellzugriff: Koordination und mehrere Rollen', () => {
  it('Freizeitenkoordination ohne aktuelle Freizeit: nichts; mit aktuellen: Freizeit-Kacheln mit Auswahl und Lebensmittel', () => {
    expect(baueKacheln(ctx({ freizeitkoordination: true }))).toEqual([]);
    const k = ctx({ freizeitkoordination: true, freizeiten: fz(2) });
    expect(baueKacheln(k).map((g) => g.id)).toEqual(['freizeiten']);
    expect(kachel(k, 'lebensmittel')!.ziele).toHaveLength(2);
  });
  it('Leitung und Treffleitung zugleich: beide Gruppen in fester Reihenfolge', () => {
    const k = ctx({ freizeitTeam: true, leitung: true, treffTeam: true, treffleitung: true, freizeiten: fz(1), treffs: tr });
    expect(baueKacheln(k).map((g) => g.id)).toEqual(['freizeiten', 'treffs']);
  });
});
