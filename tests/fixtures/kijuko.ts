/**
 * Künstliches KiJuKo-Backup für Tests (Struktur wie die echte Sicherung, alle Daten erfunden).
 * Enthält bewusst Stolperstellen: doppelte/fehlende Mail, ungültige Woche, Beispielzeile, private Felder,
 * die im Plan NICHT auftauchen dürfen.
 */
export type Backup = Record<string, unknown[]>;

export const PRIVAT = ['1990-01-01', 'Musterstraße 1', '99999', 'Musterstadt', 'Frau', 'ZUGANG1', 'https://zugang.example'];

export function beispielBackup(): Backup {
  return {
    locations: [
      { id: 'L1', name: 'Mörscher Au', address: 'Au 1, 67227 Frankenthal', capacity: 0, lieferstelleNr: '5' },
      { id: 'L2', name: 'Kindertreff Mörsch', address: 'Dorfstr. 2', capacity: 0 },
      { id: 'L3', name: 'Strandbad', address: '', capacity: 0 },
    ],
    hauptamtliche: [
      { id: 'H1', firstName: 'Hanna', name: 'Leiter', email: 'hanna@kijuko.example', phone: '0171 111', notes: '' },
      { id: 'H2', firstName: 'Hugo', name: 'Zweit', email: 'hugo@kijuko.example', phone: '', notes: '' },
      { id: 'H3', firstName: 'Nora', name: 'Ohnemail', email: '', phone: '' },
      { id: 'H4', name: 'Maria Muster', email: 'maria@kijuko.example', phone: '' },
    ],
    staff: [
      { id: 'S1', firstName: 'Anna', lastName: 'Adler', email: 'anna@kijuko.example', phone: '0170 1', employmentType: 'TeamerIn',
        diet: 'Vegetarisch', allergies: '', note: '', birthDate: '1990-01-01', street: 'Musterstraße 1', zip: '99999',
        city: 'Musterstadt', salutation: 'Frau', accessCode: 'ZUGANG1', accessLink: 'https://zugang.example' },
      { id: 'S2', firstName: 'Ben', lastName: 'Baum', email: 'ben@kijuko.example', phone: '', employmentType: 'TZK',
        diet: 'Mischkost', allergies: 'Nüsse', note: 'kann Gitarre', birthDate: '1990-01-01' },
      { id: 'S3', firstName: 'Cleo', lastName: 'Clever', email: ' Cleo@KiJuKo.Example ', phone: '', employmentType: 'Praktikum bezahlt', diet: 'Vegan' },
      { id: 'S4', firstName: 'Doppelt', lastName: 'Hanna', email: 'HANNA@kijuko.example', phone: '', employmentType: 'TeamerIn' },
      { id: 'S5', firstName: 'Ohne', lastName: 'Mail', email: '', phone: '', employmentType: 'TeamerIn' },
      { id: 'S6', firstName: 'Inge', lastName: 'Inaktiv', email: 'inge@kijuko.example', phone: '', employmentType: 'FSJ', active: false },
      { id: 'S7', firstName: 'Kurt', lastName: 'Komisch', email: 'kurt@kijuko.example', phone: '', employmentType: 'Sonderstatus' },
    ],
    projects: [
      { id: 'P1', type: 'Camp', name: 'Sommer-Sause 1', code: 'F27S1', holidayPeriod: 'Sommer', holidayWeek: 'Sommer - Woche 1',
        locationId: 'L1', ageRange: '6-11', maxParticipants: 48, startDate: '2027-07-05', endDate: '2027-07-09',
        workStartTime: '07:30', workEndTime: '17:00', leader1Id: 'H1', leader2Id: 'H2', seriesId: 'SER1' },
      { id: 'P2', type: 'Camp', name: 'Oster-Woche', holidayPeriod: 'Ostern', holidayWeek: 'Ostern - Woche 3', locationId: 'L2',
        ageRange: '0', maxParticipants: 20, startDate: '2027-03-29', endDate: '2027-04-02', status: 'Abgesagt' },
      { id: 'P3', type: 'Camp', name: 'Kaputte Daten', startDate: '2027-08-10', endDate: '2027-08-01', locationId: 'L1' },
      { id: 'P4', type: 'Camp', name: 'Ohne Ort', holidayPeriod: 'Herbst', holidayWeek: 'Herbst - Woche 2', locationId: 'XX',
        ageRange: '8-12', startDate: '2027-10-11', endDate: '2027-10-15', leader1Id: 'H4' },
    ],
    allocations: [
      { id: 'A1', staffId: 'S1', projectId: 'P1' },
      { id: 'A2', staffId: 'S2', projectId: 'P1', status: 'Bestätigt' },
      { id: 'A3', staffId: 'S1', projectId: 'P4' },
      { id: 'A4', staffId: 'S4', projectId: 'P1' }, // doppelte Mail → zählt für Hanna (Leitung)
      { id: 'A5', staffId: 'S5', projectId: 'P1' }, // Person ohne Mail
      { id: 'A6', staffId: 'S1', projectId: 'PX' }, // unbekanntes Projekt
      { id: 'A7', staffId: 'S3', projectId: 'P1' },
    ],
    cateringEntries: [
      { projectId: 'P1', mischkost: 50, vegetarisch: 3, allergiker: [{ id: 'x', allergy: 'Nüsse', count: 2 }, { id: 'y', allergy: 'Laktose', count: 1 }],
        dailyPortions: { '05.07.2027': { mischkost: 52, vegetarisch: 4, allergiker: 1 }, '06.07.2027': { mischkost: 0, vegetarisch: 56, allergiker: 0 }, 'kaputt': { mischkost: 1 } } },
    ],
    materialNeeds: [
      { id: 'M1', projectId: 'P1', name: 'Bälle', unit: 'Stück', qtyNeeded: 10, note: '' },
      { id: 'M2', projectId: 'P1', name: 'Beispiel', unit: 'Stück', qtyNeeded: 1, note: 'Beispielzeile – bitte löschen' },
      { id: 'M3', projectId: 'P1', name: 'Kleber', unit: 'Packung', qtyNeeded: 4, note: 'bunt' },
    ],
    // Bereiche, die der Kompass bewusst nicht übernimmt
    checklists: [{ id: 'C1', projectId: 'P1', category: 'Vorbereitung', task: 'Nicht importieren', done: false }],
    todos: [], taskTemplates: [], budgetRates: [], mailTemplates: [{ id: 't', subject: 'x', body: 'Code ZUGANG1' }],
  };
}

/** Tiefe Kopie zum Verändern einzelner Stellen in Tests. */
export function kopie<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
