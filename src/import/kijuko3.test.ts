import { describe, it, expect } from 'vitest';
import { baueImportPlan } from './kijuko';

/** Datei, wie sie KiJuKo 3 unter „Einstellungen → KiJuB-Kompass“ speichert. */
function kijuko3Export() {
  return {
    format: 'kijuko-kompass', version: 1, programm: 'KiJuKo 3.0.0', erstelltAm: '2026-10-08T10:00:00.000Z',
    orte: [{ id: 'o1', name: 'Zuckerfabrik', adresse: 'Musterstr. 1', lieferstelleNr: '42' }, { id: '', name: 'Ohne ID', adresse: '', lieferstelleNr: '' }],
    personen: [
      { id: 's1', vorname: 'Tom', nachname: 'Teamer', email: ' Tom@Example.org ', telefon: '0151', ernaehrung: 'Vegetarisch', allergien: 'Nüsse', notiz: 'fährt Bus', beschaeftigungsart: 'Senior-TeamerIn', hauptamt: false, aktiv: true },
      { id: 'h1', vorname: 'Petra', nachname: 'Schmidt', email: 'petra@example.org', telefon: '', ernaehrung: '', allergien: '', notiz: '', beschaeftigungsart: 'Hauptamt', hauptamt: true, aktiv: true },
      { id: 'h2', vorname: '', nachname: 'Anna Alt', email: 'anna@example.org', telefon: '', ernaehrung: '', allergien: '', notiz: '', beschaeftigungsart: 'Hauptamt', hauptamt: true, aktiv: true },
      { id: 's2', vorname: 'Kim', nachname: 'Koch', email: 'kim@example.org', telefon: '', ernaehrung: '', allergien: '', notiz: '', beschaeftigungsart: 'Küchenkraft', hauptamt: false, aktiv: false },
      { id: 's3', vorname: 'Doppelt', nachname: 'Petra', email: 'PETRA@example.org', telefon: '', ernaehrung: '', allergien: '', notiz: '', beschaeftigungsart: 'TeamerIn', hauptamt: false, aktiv: true },
      { id: 's4', vorname: 'Ohne', nachname: 'Mail', email: '', telefon: '', ernaehrung: '', allergien: '', notiz: '', beschaeftigungsart: 'TeamerIn', hauptamt: false, aktiv: true },
    ],
    freizeiten: [
      {
        id: 'f1', name: 'Sommerspaß', von: '2026-07-06', bis: '2026-07-10', status: 'Geplant', ortId: 'o1', kennziffer: 'F26S3Sa2', serieId: 'v1',
        ferien: { art: 'Sommer', nummer: 2 }, arbeitsbeginn: '8:00', arbeitsende: '16:00', altersgruppe: '6-11', maxTeilnehmende: 30,
        leitung: ['h1', 's1'], team: ['s1', 's2', 's3', 's4'],
      },
      {
        id: 'f2', name: 'Pfingsten', von: '2026-05-26', bis: '2026-05-29', status: 'Abgesagt', ortId: 'weg', kennziffer: 'F26P??1', serieId: '',
        ferien: { art: 'Pfingsten', nummer: 1 }, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '', maxTeilnehmende: null, leitung: [], team: [],
      },
      { id: 'f3', name: 'Ohne Datum', von: '', bis: '', status: 'Geplant', ortId: '', kennziffer: '', serieId: '', ferien: null, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '', maxTeilnehmende: null, leitung: [], team: [] },
    ],
    verpflegung: [
      { freizeitId: 'f1', datum: '2026-07-06', mischkost: 3, vegetarisch: 1, allergiker: 1 },
      { freizeitId: 'f1', datum: '2026-07-06', mischkost: 9, vegetarisch: 9, allergiker: 9 },
      { freizeitId: 'f3', datum: '2026-07-06', mischkost: 1, vegetarisch: 0, allergiker: 0 },
    ],
    material: [
      { id: 'm1', freizeitId: 'f1', name: 'Kleber', einheit: 'Stück', menge: 5, notiz: '' },
      { id: 'm2', freizeitId: 'f1', name: 'Muster', einheit: '', menge: 1, notiz: 'Beispielzeile – bitte löschen' },
    ],
  };
}

describe('baueImportPlan mit der Exportdatei aus KiJuKo 3', () => {
  const plan = baueImportPlan(kijuko3Export());

  it('lehnt eine neuere Dateiversion mit klarer Meldung ab', () => {
    expect(() => baueImportPlan({ ...kijuko3Export(), version: 2 })).toThrow(/neueren KiJuKo-Version/);
  });

  it('übernimmt Orte', () => {
    expect(plan.orte).toEqual([{ kijuko_id: 'o1', name: 'Zuckerfabrik', adresse: 'Musterstr. 1', lieferstelle_nr: '42' }]);
  });

  it('Personen: Kategorie, Hauptamtliche gewinnen bei gleicher Mail, Unvollständige mit Grund', () => {
    expect(plan.personen.map((p) => p.kijuko_id)).toEqual(['h1', 'h2', 's1', 's2']);
    expect(plan.personen.find((p) => p.kijuko_id === 's1')).toEqual({
      kijuko_id: 's1', kijuko_quelle: 'staff', vorname: 'Tom', nachname: 'Teamer', mail: 'Tom@Example.org', kategorie: 'Senior-TeamerIn',
      telefon: '0151', ernaehrung: 'Vegetarisch', notizen: 'Allergien: Nüsse\nfährt Bus',
    });
    expect(plan.personen.find((p) => p.kijuko_id === 'h1')).toMatchObject({ kijuko_quelle: 'hauptamtliche', kategorie: 'Hauptamtliche*r' });
    expect(plan.personen.find((p) => p.kijuko_id === 'h2')).toMatchObject({ vorname: 'Anna', nachname: 'Alt' });
    expect(plan.personen.find((p) => p.kijuko_id === 's2')).toMatchObject({ kategorie: 'TeamerIn', aktiv: false });
    expect(plan.hinweise.some((h) => h.includes('Küchenkraft'))).toBe(true);
    expect(plan.uebersprungen.map((u) => u.grund)).toEqual(expect.arrayContaining([
      'Mail-Adresse steht schon bei einer anderen Person im Import', 'Keine gültige Mail-Adresse',
    ]));
  });

  it('Freizeiten: Felder, Status, Ferien; ohne Datum übersprungen', () => {
    expect(plan.freizeiten.map((f) => f.kijuko_id)).toEqual(['f1', 'f2']);
    expect(plan.freizeiten[0]).toEqual({
      kijuko_id: 'f1', name: 'Sommerspaß', start_datum: '2026-07-06', ende_datum: '2026-07-10', status: 'geplant', ort_kijuko_id: 'o1',
      kijuko_code: 'F26S3Sa2', kijuko_serie_id: 'v1', ferienzeitraum: 'sommer', ferienwoche: 2, arbeitsbeginn: '08:00', arbeitsende: '16:00',
      alter_von: 6, alter_bis: 11, max_teilnehmende: 30, leitung_kijuko_ids: ['h1', 's1'],
    });
    // Pfingsten gibt es im Kompass nicht; eine unvollständige Kennziffer wird nicht übernommen
    expect(plan.freizeiten[1]).toMatchObject({ status: 'abgesagt', ferienzeitraum: undefined, ferienwoche: undefined, kijuko_code: undefined, ort_kijuko_id: undefined });
    expect(plan.uebersprungen.some((u) => u.name === 'Ohne Datum')).toBe(true);
  });

  it('Leitung kann jede Person sein; Team ohne Leitung, doppelte Mail zählt für die übernommene Person', () => {
    expect(plan.zuteilungen).toEqual([{ freizeit_kijuko_id: 'f1', person_kijuko_id: 's2' }]);
  });

  it('Essenszahlen je Tag (keine Doppelten) und Material ohne Beispielzeile', () => {
    expect(plan.verpflegung).toEqual([{ freizeit_kijuko_id: 'f1', datum: '2026-07-06', mischkost: 3, vegetarisch: 1, allergiker: 1 }]);
    expect(plan.material).toEqual([{ kijuko_id: 'm1', freizeit_kijuko_id: 'f1', name: 'Kleber', einheit: 'Stück', menge: 5, notiz: undefined }]);
  });

  it('enthält keine Felder außerhalb des Plans', () => {
    expect(JSON.stringify(plan)).not.toContain('erstelltAm');
  });
});
