/**
 * Angaben für Impressum und Datenschutzhinweise. Übernommen aus dem Impressum der bisherigen Anwendung.
 * Änderungen (Ansprechpersonen, Adressen) gehören hierher – die Seiten ziehen sich alles aus dieser Datei.
 */
export const TRAEGER = {
  name: 'Stadtverwaltung Frankenthal (Pfalz)',
  rechtsform: 'Körperschaft des öffentlichen Rechts',
  vertretung: 'vertreten durch den Oberbürgermeister Dr. Nicolas Meyer',
  adresse: ['Rathausplatz 2-7', '67227 Frankenthal (Pfalz)'],
  telefon: 'Telefon (Behördenrufnummer): 115 oder 06233 / 89-666',
  fax: 'Telefax: 06233 / 89-400',
  mail: 'stadtverwaltung@frankenthal.de',
  ustId: 'DE148432151',
} as const;

export const FACHSTELLE = {
  name: 'Kinder- und Jugendbüro (KiJuB)',
  traeger: 'Stadtverwaltung Frankenthal (Pfalz)',
  adresse: ['Stephan-Cosacchi-Platz 3', '67227 Frankenthal'],
  telefon: '06233 89 858',
  mail: 'freizeiten@frankenthal.de',
} as const;

export const LINKS = {
  impressumStadt: 'https://www.frankenthal.de/stadt-frankenthal/de/impressum/',
  datenschutzStadt: 'https://www.frankenthal.de/stadt-frankenthal/de/datenschutzerklaerung/',
} as const;
