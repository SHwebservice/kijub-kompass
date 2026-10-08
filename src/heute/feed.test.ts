import { describe, it, expect } from 'vitest';
import { baueFeed, jeGruppe, type FeedEingabe } from './feed';

const leer: FeedEingabe = { ohneProtokoll: [], offene: [], knapp: [], nichtGesehen: [], wuensche: [], vorbereitung: [], diensteHeute: [], freizeitenHeute: [], neu: [] };
const mit = (o: Partial<FeedEingabe>): FeedEingabe => ({ ...leer, ...o });

describe('baueFeed', () => {
  it('ohne Daten ist der Feed leer', () => {
    expect(baueFeed(leer)).toEqual([]);
  });

  it('Reihenfolge: erst „zu erledigen“, dann „heute“, dann „neu“ – egal in welcher Reihenfolge die Daten kommen', () => {
    const f = baueFeed(mit({
      neu: [{ zeit: '2027-01-01T10:00:00Z', art: 'hinweis', text: 'Sonnencreme', quelle: 'Sommer', url: '/x' }],
      diensteHeute: [{ id: 'd', treff_id: 't', treff_name: 'Treff', datum: '2027-01-01', von: '15:00', bis: '18:00', ist_sonder: false, bezeichnung: null }],
      ohneProtokoll: [{ id: 't', name: 'Treff' }],
    }));
    expect(f.map((x) => x.gruppe)).toEqual(['erledigen', 'heute', 'neu']);
  });

  it('Vorbereitung: überfällige Punkte warnen, bald fällige ruhig; nichts fällig, keine Karte', () => {
    const f = baueFeed({ ...leer, vorbereitung: [
      { id: 'f1', name: 'Zeltlager', ueberfaellig: 2, bald: 1 },
      { id: 'f2', name: 'Stadtranderholung', ueberfaellig: 0, bald: 3 },
      { id: 'f3', name: 'Ruhig', ueberfaellig: 0, bald: 0 },
    ] });
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ titel: 'Vorbereitung: 2 Punkte sind überfällig', text: 'Zeltlager · 1 Punkt in den nächsten 7 Tagen', ton: 'warnung', link: '/freizeiten/f1/vorbereitung', zahl: 3, gruppe: 'erledigen' });
    expect(f[1]).toMatchObject({ titel: 'Vorbereitung: bald fällig', text: 'Stadtranderholung · 3 Punkte in den nächsten 7 Tagen', ton: 'ruhig' });
  });

  it('Protokoll fehlt: Link zum Protokoll, Knopf „Jetzt schreiben“, Warnton', () => {
    const [e] = baueFeed(mit({ ohneProtokoll: [{ id: 't1', name: 'Kindertreff' }] }));
    expect(e).toMatchObject({ titel: 'Tagesprotokoll fehlt', link: '/treffs/t1/protokoll', aktion: 'Jetzt schreiben', ton: 'warnung' });
    expect(e!.text).toContain('Kindertreff');
  });

  it('offene Hinweise und Absprachen: Link je nach Freizeit oder Treff, Zahl, Text mit beiden Teilen', () => {
    const f = baueFeed(mit({
      offene: [
        { schluessel: 'f-f1', typ: 'freizeit', id: 'f1', name: 'Sommer', anzahl: 3, hinweise: 2, absprachen: 1 },
        { schluessel: 't-t1', typ: 'treff', id: 't1', name: 'Kindertreff', anzahl: 1, hinweise: 0, absprachen: 1 },
      ],
    }));
    expect(f[0]).toMatchObject({ link: '/freizeiten/f1/hinweise', zahl: 3, titel: '2 Hinweise und 1 Absprache zum Bestätigen', text: 'Sommer' });
    expect(f[1]).toMatchObject({ link: '/treffs/t1/absprachen', zahl: 1, titel: '1 Absprache zum Bestätigen', text: 'Kindertreff' });
  });

  it('knappe Lebensmittel: Ort, Artikel mit Rest, Link zum Lebensmittel-Reiter; ohne Freizeit zur Liste', () => {
    const ort = { ort_id: 'o1', leer: 1, knapp: 1, artikel: [{ ort_id: 'o1', name: 'Reis', einheit: 'kg', rest: 0, status: 'leer' as const }, { ort_id: 'o1', name: 'Milch', einheit: 'l', rest: 3.5, status: 'knapp' as const }] };
    const f = baueFeed(mit({ knapp: [{ ort, freizeitId: 'f1', name: 'Mörscher Au' }, { ort, freizeitId: null, name: 'Irgendwo' }] }));
    expect(f[0]).toMatchObject({ link: '/freizeiten/f1/lebensmittel', zahl: 2, text: 'Mörscher Au: Reis (leer), Milch (3,5 l)' });
    expect(f[1]!.link).toBe('/freizeiten');
  });

  it('Dienstwünsche und nicht gesehene Hinweise', () => {
    const f = baueFeed(mit({
      wuensche: [{ treff: { treff_id: 't1', anzahl: 2, erster: '2027-03-04' }, name: 'Kindertreff' }],
      nichtGesehen: [{ freizeit_id: 'f1', quelle: 'Sommer', anzahl: 1 }],
    }));
    expect(f.find((x) => x.id === 'wunsch-t1')).toMatchObject({ link: '/treffs/t1/dienstplan', zahl: 2 });
    expect(f.find((x) => x.id === 'wunsch-t1')!.text).toContain('2 Wünsche warten auf Antwort');
    expect(f.find((x) => x.id === 'ungesehen-f1')!.text).toBe('Sommer: 1 Hinweis mit offenen Bestätigungen im Team');
  });

  it('Dienst heute mit Uhrzeit und Sonderdienst; laufende Freizeit mit Tagesprogramm oder Hinweis auf den leeren Plan', () => {
    const f = baueFeed(mit({
      diensteHeute: [{ id: 'd', treff_id: 't1', treff_name: 'Kindertreff', datum: '2027-01-01', von: '15:00', bis: '19:00', ist_sonder: true, bezeichnung: 'Fest' }],
      freizeitenHeute: [
        { id: 'f1', name: 'Sommer', ort_name: 'Au', punkte: [{ id: '1', freizeit_id: 'f1', titel: 'Fangen', slot: 'Vormittag', position: 1 }] },
        { id: 'f2', name: 'Winter', ort_name: null, punkte: [] },
      ],
    }));
    expect(f[0]).toMatchObject({ titel: 'Dienst heute · 15:00–19:00 Uhr', text: 'Kindertreff · Sonderdienst: Fest', link: '/treffs/t1/dienstplan' });
    expect(f[1]).toMatchObject({ titel: 'Sommer läuft', zeilen: ['Vormittag: Fangen'], link: '/freizeiten/f1/plan' });
    expect(f[2]!.zeilen).toEqual(['Für heute steht noch nichts im Wochenplan.']);
  });

  it('Neuigkeiten: Symbol und Bezeichnung nach Art, Quelle und Zeit als Text', () => {
    const [e] = baueFeed(mit({ neu: [{ zeit: new Date().toISOString(), art: 'bewerbung', text: 'Mira', quelle: 'Herbst', url: '/bewerbungen' }] }));
    expect(e).toMatchObject({ icon: '📥', titel: 'Bewerbung: Mira', link: '/bewerbungen', gruppe: 'neu', ton: 'ruhig' });
    expect(e!.text).toMatch(/^Herbst · /);
  });

  it('jeGruppe filtert, die Kennungen sind eindeutig', () => {
    const f = baueFeed(mit({ ohneProtokoll: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], neu: [{ zeit: '2027-01-01T10:00:00Z', art: 'notiz', text: 'x', quelle: 'q', url: '/x' }, { zeit: '2027-01-01T10:00:00Z', art: 'notiz', text: 'x', quelle: 'q', url: '/x' }] }));
    expect(jeGruppe(f, 'erledigen')).toHaveLength(2);
    expect(jeGruppe(f, 'neu')).toHaveLength(2);
    expect(new Set(f.map((x) => x.id)).size).toBe(f.length);
  });
});
