import { describe, it, expect } from 'vitest';
import { KEINE_ZAEHLER } from './kacheln';
import { baueBento, type BentoEingabe } from './bento';
import { inTagen } from '../test-daten';

const heute = inTagen(0);
const basis: BentoEingabe = {
  freizeitkoordination: false, treffkoordination: false, heute, zaehler: KEINE_ZAEHLER, aktuelle: [], laufendHeute: 0, ohneLeitung: 0, wunschTreffId: null, erstesTreffId: null,
};
const mit = (o: Partial<BentoEingabe>): BentoEingabe => ({ ...basis, ...o });
const ids = (k: ReturnType<typeof baueBento>) => k.map((x) => x.id);

describe('baueBento', () => {
  it('Freizeitenkoordination: Freizeit-Kacheln, keine Treff-Kacheln', () => {
    const k = baueBento(mit({ freizeitkoordination: true, aktuelle: [{ id: 'f1', name: 'Sommer', start_datum: inTagen(4), ende_datum: inTagen(8) }] }));
    expect(ids(k)).toEqual(['heute', 'bewerbungen', 'vorschlaege', 'naechste', 'lebensmittel', 'fehler']);
  });

  it('Treffkoordination: Treff-Kacheln, keine Bewerbungen und Lebensmittel', () => {
    const k = baueBento(mit({ treffkoordination: true }));
    expect(ids(k)).toEqual(['vorschlaege', 'wuensche', 'nachweise', 'fehler']);           // keine Kachel zu Tagesprotokollen (0026)
  });

  it('wer beides ist, sieht beides; die große Kachel nennt die laufenden Freizeiten, nichts zu Protokollen', () => {
    const k = baueBento(mit({ freizeitkoordination: true, treffkoordination: true, laufendHeute: 2 }));
    expect(ids(k)).toEqual(expect.arrayContaining(['bewerbungen', 'wuensche', 'nachweise']));
    expect(k[0]).toMatchObject({ id: 'heute', breit: true, ton: 'haupt', zahl: '2', unter: 'Freizeiten laufen gerade', link: '/freizeiten' });
    expect(k.map((x) => x.unter).join(' ')).not.toMatch(/Protokoll/);
  });

  it('nichts offen: ruhige Kacheln mit freundlichem Text; sonst Warnton', () => {
    const ruhig = baueBento(mit({ treffkoordination: true }));
    expect(ruhig.every((x) => x.ton === 'ruhig')).toBe(true);
    const laut = baueBento(mit({ treffkoordination: true, zaehler: { ...KEINE_ZAEHLER, wuensche: 3, vorschlaege: 1, fehler: 2 }, wunschTreffId: 't9' }));
    expect(laut.find((x) => x.id === 'wuensche')).toMatchObject({ zahl: '3', ton: 'warnung', link: '/treffs/t9/dienstplan' });
    expect(laut.find((x) => x.id === 'vorschlaege')!.ton).toBe('warnung');
    expect(laut.find((x) => x.id === 'fehler')).toMatchObject({ zahl: '2', link: '/fehler', ton: 'warnung' });
  });


  it('nur Freizeiten: „läuft jetzt“ statt Tagen; „Ohne Leitung“ nur, wenn es das gibt', () => {
    const lauf = baueBento(mit({ freizeitkoordination: true, laufendHeute: 1, ohneLeitung: 2, aktuelle: [{ id: 'f1', name: 'Sommer', start_datum: inTagen(-1), ende_datum: inTagen(3) }] }));
    expect(lauf.find((x) => x.id === 'naechste')).toMatchObject({ label: 'Läuft gerade', zahl: 'jetzt', unter: 'Sommer' });
    expect(lauf.find((x) => x.id === 'ohne-leitung')).toMatchObject({ zahl: '2', ton: 'warnung' });
    expect(lauf[0]).toMatchObject({ id: 'heute', zahl: '1', unter: 'Freizeit läuft gerade' });
    expect(baueBento(mit({ freizeitkoordination: true })).some((x) => x.id === 'ohne-leitung')).toBe(false);
  });

  it('„in 1 Tag“ im Singular; ohne aktuelle Freizeit keine „Nächste“-Kachel und Lebensmittel führen zur Liste', () => {
    const k = baueBento(mit({ freizeitkoordination: true, aktuelle: [{ id: 'f1', name: 'Sommer', start_datum: inTagen(1), ende_datum: inTagen(5) }] }));
    expect(k.find((x) => x.id === 'naechste')!.zahl).toBe('in 1 Tag');
    const keine = baueBento(mit({ freizeitkoordination: true }));
    expect(keine.some((x) => x.id === 'naechste')).toBe(false);
    expect(keine.find((x) => x.id === 'lebensmittel')!.link).toBe('/freizeiten');
  });
});
