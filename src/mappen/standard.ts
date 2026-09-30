/**
 * Teamermappe und Treffmappe: Aufbau der Inhalte und die Standardtexte.
 * Die Standardtexte gelten, solange die Koordination nichts gespeichert hat (Übernahme aus der alten Teamermappe bzw. Treffmappe).
 */

export interface IconWahl { id: string; emoji: string; farbe: string; label: string }

/** Auswahl für die Kacheln (wie in der alten Mappe: zehn Symbole mit fester Farbe). */
export const ICON_WAHL: IconWahl[] = [
  { id: 'schild', emoji: '🛡️', farbe: 'var(--orange)', label: 'Schild (Warnung)' },
  { id: 'schloss', emoji: '🔒', farbe: '#1d7a5a', label: 'Schloss' },
  { id: 'karte', emoji: '🗺️', farbe: 'var(--accent)', label: 'Karte' },
  { id: 'info', emoji: 'ℹ️', farbe: '#3b5bdb', label: 'Info' },
  { id: 'herz', emoji: '❤️', farbe: '#c2410c', label: 'Herz' },
  { id: 'team', emoji: '👥', farbe: '#0f766e', label: 'Team' },
  { id: 'idee', emoji: '💡', farbe: '#a16207', label: 'Idee' },
  { id: 'achtung', emoji: '⚠️', farbe: '#c92a2a', label: 'Achtung' },
  { id: 'erste-hilfe', emoji: '🩹', farbe: '#a61e4d', label: 'Erste Hilfe' },
  { id: 'termin', emoji: '📅', farbe: '#5f3dc4', label: 'Termin' },
];

/** Symbole für den Qualitäts-Kodex (zusätzlich zur Kachel-Auswahl gibt es die Tür). */
export const KODEX_ICONS: Record<string, string> = { ...Object.fromEntries(ICON_WAHL.map((i) => [i.id, i.emoji])), tuer: '🚪' };

export interface Kachel { title: string; desc: string; icon: string; tags: string[]; items: string[] }
export interface Kodex { icon: string; title: string; text: string }
export interface Faq { q: string; a: string }

export interface MappeDaten {
  sections: Kachel[];
  standards: Kodex[];
  faqs: Faq[];
  emergencyText: string;
}

export const MAX_KACHELN = 10;

export type MappenSchluessel = 'teamermappe' | 'treffmappe';

const k = (title: string, desc: string, icon: string, items: string[], tags: string[] = []): Kachel => ({ title, desc, icon, tags, items });

export const TEAMERMAPPE_STANDARD: MappeDaten = {
  sections: [
    k('Aufsichtspflicht', 'Der rechtliche Rahmen für unsere tägliche Arbeit. Was darf ich, was muss ich?', 'schild', [
      'Präsenzpflicht: Sei immer da, wo deine Teilnehmenden sind.',
      'Präventives Handeln: Gefahrenquellen vorher erkennen und beseitigen (z.B. Scherben).',
      'Informationspflicht: Teilnahmebogen lesen – Alter, Gesundheit, Charakter der Kinder beachten.',
      'Übertragung: Die Aufsichtspflicht endet erst mit der Übergabe an eine berechtigte Person.',
      'Konsequenzen vorher ankündigen und dann auch verhältnismäßig durchsetzen.',
    ]),
    k('Datenschutz (DSGVO)', 'Umgang mit Fotos, Kontaktlisten und persönlichen Daten der Kinder.', 'schloss', [
      'Fotos/Videos nie privat versenden oder auf Social Media teilen.',
      'Nur Fotos mit Einverständniserklärung an Leitung/Freizeiten-Koordination weiterleiten.',
      'Listen: Teilnahmelisten gehören nicht in öffentliche WhatsApp-Gruppen und bleiben abends vor Ort.',
      'Vertraulichkeit: Infos über Familie, Krankheiten etc. bleiben im Team-Kreis.',
    ]),
    k('Tagesablauf', 'Der feste Zeitplan eines Freizeittages – von der Teamsitzung bis zur Abgabe.', 'karte', [
      '07.30 Uhr Teamsitzung – 08.00 Uhr Eingang öffnen, Kinder empfangen.',
      '08.30 Uhr Fehlkinder an Leitung melden · 09.00 Uhr Gruppenprogramm.',
      '12.00 Uhr Mittagessen · 12.45–13.45 Uhr Mittagsruhe (Tandems wechseln sich mit Pause ab).',
      '14.00 Uhr Gruppenprogramm · 16.00 Uhr Imbiss · 16.30 Uhr Abholung.',
      '17.00 Uhr offizielles Ende der Arbeitszeit.',
      'Freitags zusätzlich: Ordnungsdienst, Materiallager aufräumen, Stundenzettel unterschreiben, Abschlussreflexion.',
    ]),
    k('Kleidung, Handy & Rauchen', 'Auftreten und Verhalten während der Arbeitszeit.', 'info', [
      'Gelbes T-Shirt den ganzen Tag tragen, Namensschild anfangs sichtbar.',
      'Feste Schuhe mit Fersenriemen – keine Flipflops erlaubt.',
      'Handy während der Arbeitszeit aus, außerhalb des Geländes nur als Notfalltelefon nutzen.',
      'Private Handynutzung ausnahmslos in der Mittagspause.',
      'Rauchen nur in der Mittagspause und außer Sichtweite der Kinder.',
    ], ['Gelbes T-Shirt']),
    k('Schwimmen & Wasser', 'Sicherheitsregeln beim Schwimmen – konsequent und ohne Ausnahme.', 'herz', [
      'Schwimmer/Nichtschwimmer laut Teilnahmeliste einteilen, neue Schwimmer schwimmen vor.',
      'Nichtschwimmer (mit/ohne Schwimmhilfe) bekommen ein Neonband und bleiben bis zur Beckenmitte.',
      'Fehlt die Schwimmhilfe, darf das Kind an dem Tag nicht ins Wasser.',
      'Montags ist Schwimmverbot, der Weiher ist grundsätzlich tabu.',
      'Teamer dürfen nur ins Wasser, wenn alle vier Beckenseiten besetzt sind – pro Tandem nur einer.',
      'Auf Sonnenschutz, ausreichend Trinken und Auskühlen achten.',
    ], ['Schwimmen/Wasser']),
    k('Abholregelung', 'Wer darf Kinder abholen und wie läuft die Übergabe ab?', 'team', [
      'Nur die in der Teilnahmeliste genannten Personen sind abholberechtigt – auch nicht Großeltern/Geschwister ohne Nachmeldung.',
      'Weitere Abholberechtigte dürfen Eltern jederzeit formlos schriftlich nachmelden.',
      'Kinder werden nur direkt in die Hand der abholenden Person übergeben.',
      'Selbstgeher-Kinder werden Punkt 16.30 Uhr entlassen, danach endet die Aufsichtspflicht.',
      'Abweichungen (früher gehen/abholen) nur mit schriftlicher Bestätigung – sonst Leitung informieren.',
    ]),
    k('Gesundheit & Auffälligkeiten', 'Kopfläuse, Medikamente und der Umgang mit AD(H)S.', 'idee', [
      'Medikamente dürfen wir nicht verabreichen, nur an die Einnahme erinnern – bei Weigerung Leitung informiert die Eltern.',
      'Verdacht auf Kopfläuse: Ruhe bewahren, Kind nicht bloßstellen, diskret die Leitung informieren.',
      'Wir sind nicht berechtigt, den Kopf eines Kindes selbst zu untersuchen.',
      'Bei AD(H)S: wenige klare Regeln, nicht persönlich nehmen, positives Verhalten loben statt nur Fehler zu sehen.',
      'Keine langen Diskussionen – Anweisungen freundlich, kurz und konsequent durchsetzen.',
    ]),
    k('Regeln & Material', 'Verhalten auf dem Gelände, beim Essen und im Straßenverkehr.', 'achtung', [
      'Auf dem Gelände wird außerhalb der Halle nicht gerannt oder gebrüllt.',
      'Nur Teamer tragen Schüsseln mit heißen Speisen, Küche betritt nur das Küchenteam.',
      'Im Straßenverkehr immer im Tandem: eine Person vorne, eine hinten, Kinder in Zweierreihen.',
      'Material wird ausschließlich von Teamer*innen ausgegeben und zurückgeräumt.',
      'Handkasse: keine Auszahlung ohne Beleg, Restgeld sofort bei der Leitung abgeben.',
    ]),
  ],
  standards: [
    { icon: 'herz', title: 'Empathie zuerst', text: 'Wir hören zu, bevor wir werten. Jedes Kind ist einzigartig.' },
    { icon: 'team', title: 'Team-Spirit', text: 'Wir unterstützen uns gegenseitig. Kein Teamer steht alleine.' },
    { icon: 'idee', title: 'Kreativität', text: 'Fehler sind erlaubt. Wir probieren Neues aus und lernen gemeinsam.' },
  ],
  faqs: [
    { q: 'Wie bewerbe ich mich für eine konkrete Freizeit?', a: 'Gehe in die Übersicht „Freizeiten“, wähle dein Wunschprojekt aus und klicke auf „Bewerben“. Deine Bewerbung wird dann von der Koordination gesichtet.' },
    { q: 'Was mache ich, wenn ich kurzfristig krank werde?', a: 'Informiere bitte umgehend deine Projektleitung telefonisch. Je früher wir Bescheid wissen, desto eher können wir für Ersatz sorgen, damit das Team vor Ort nicht unterbesetzt ist.' },
    { q: 'Bekomme ich eine Bestätigung für mein Engagement?', a: 'Ja, wir stellen dir nach Abschluss der Saison gerne ein qualifiziertes Zeugnis oder eine ehrenamtliche Bestätigung aus. Diese macht sich super in jedem Lebenslauf!' },
    { q: 'Wie werden Reisekosten erstattet?', a: 'Sammle alle Belege (Bahn-Tickets, Tankquittungen). Nach der Freizeit kannst du diese über das Abrechnungsformular einreichen. Wir erstatten in der Regel bis zu 100% der Kosten.' },
    { q: 'Wer ist mein Ansprechpartner bei Konflikten im Team?', a: 'Erster Ansprechpartner ist deine Projektleitung. Sollte es dort zu Problemen kommen, kannst du dich jederzeit vertrauensvoll an die pädagogische Bereichsleitung im Hauptbüro wenden.' },
    { q: 'Was passiert mit den Teilnahmelisten, wenn Eltern etwas ändern?', a: 'Änderungen sind jederzeit möglich, es gilt immer die letzte schriftliche Angabe. Zettel oder Bescheinigungen bitte sofort mit Datum/Unterschrift lochen und in die Teamermappe heften.' },
    { q: 'Was mache ich, wenn ein Kind fehlt?', a: 'Trage es in deine Anwesenheitsliste ein (E = entschuldigt, U = unentschuldigt) und gib den Fehlkinderzettel spätestens bis 08.30 Uhr bei der Leitung ab, damit überzählige Mittagessen abbestellt werden können.' },
    { q: 'Darf ich als Teamer privat einkaufen und das über die Handkasse abrechnen?', a: 'Nein. Einkäufe für die Freizeit vorher mit der Leitung absprechen, danach Quittung und Restgeld sofort zurückgeben. Private Einkäufe dürfen nicht mit auf dem Beleg stehen.' },
    { q: 'Wie verhalte ich mich bei einem Verdacht auf Kopfläuse?', a: 'Ruhig bleiben, das Kind nicht vor anderen ansprechen und diskret die Leitung informieren. Wir dürfen den Kopf eines Kindes nicht selbst untersuchen – das übernehmen die Eltern nach Information durch die Leitung.' },
    { q: 'Was gilt beim Ausflug mit öffentlichen Verkehrsmitteln?', a: 'Es gehen immer mindestens zwei Teamer*innen mit (am besten mit Assistent*in), 1.-Hilfe-Tasche und Handy mit Leitungsnummer sind Pflicht. Beim Einsteigen zählen zwei Teamer unabhängig voneinander die Kinder, damit niemand zurückbleibt.' },
  ],
  emergencyText: 'Im Falle eines Unfalls oder einer Krise: Ruhe bewahren, Erstversorgung einleiten, sofort die Leitung informieren und den Vorfall am selben Tag im Tagesbericht dokumentieren. Wichtige Nummern: Büro KiJuB-Verwaltung 06233-89-858, Freizeiten-Koordination (Frau Schmidt) 06233-89-814, Diensthandy Herr Horn 0172-1424712.',
};

export const TREFFMAPPE_STANDARD: MappeDaten = {
  sections: [
    k('Ankommen & Abschließen', 'Öffnen und Schließen des Treffs – der feste Rahmen für jeden Diensttag.', 'schloss', [
      'Rechtzeitig vor Öffnungsbeginn da sein, Räume aufschließen und lüften.',
      'Anwesenheit der Kinder/Jugendlichen im Blick behalten, keine unbeaufsichtigten Räume.',
      'Zum Dienstende gemeinsam aufräumen, Räume kontrollieren, ordnungsgemäß abschließen.',
      'Besonderheiten des Tages (Vorfälle, Absprachen) an die nächste Schicht bzw. die Treffleitung weitergeben.',
    ]),
    k('Aufsichtspflicht', 'Der rechtliche Rahmen für unsere Arbeit im offenen Treff.', 'schild', [
      'Präsenzpflicht: immer dort sein, wo sich Kinder/Jugendliche aufhalten.',
      'Gefahrenquellen vorausschauend erkennen und beseitigen.',
      'Besonderheiten einzelner Kinder/Jugendlicher (Alter, Gesundheit, Verhalten) beachten.',
      'Konsequenzen vorher ankündigen und dann verhältnismäßig durchsetzen.',
    ]),
    k('Datenschutz (DSGVO)', 'Umgang mit Fotos, Kontaktdaten und persönlichen Informationen.', 'info', [
      'Fotos/Videos nie privat versenden oder auf Social Media teilen.',
      'Nur mit Einverständniserklärung an die Koordination weiterleiten.',
      'Persönliche Informationen über Besucher*innen bleiben im Team-Kreis.',
    ]),
    k('Gesundheit & Auffälligkeiten', 'Medikamente, Verletzungen und der Umgang mit besonderem Verhalten.', 'idee', [
      'Medikamente dürfen nicht verabreicht werden, nur an die Einnahme erinnert.',
      'Bei Verletzungen: Erstversorgung, Ruhe bewahren, Treffleitung informieren.',
      'Auffälligkeiten diskret und ohne Bloßstellung an die Treffleitung melden.',
    ]),
    k('Regeln im Treff', 'Verhalten im Haus, beim Umgang miteinander und mit dem Material.', 'achtung', [
      'Respektvoller Umgang miteinander – Konflikte ansprechen statt eskalieren lassen.',
      'Material wird gemeinsam gepflegt und nach Benutzung zurückgeräumt.',
      'Küche/Aufenthaltsbereich nur nach Absprache und mit Aufsicht nutzen.',
    ]),
  ],
  standards: [
    { icon: 'tuer', title: 'Offene Tür', text: 'Jede*r ist willkommen – ohne Anmeldung, ohne Vorbedingung.' },
    { icon: 'team', title: 'Beziehungsarbeit', text: 'Wir sind verlässliche Ansprechpersonen über den einzelnen Besuch hinaus.' },
    { icon: 'herz', title: 'Respekt', text: 'Wir begegnen allen Besucher*innen auf Augenhöhe, unabhängig von Herkunft oder Verhalten.' },
  ],
  faqs: [
    { q: 'Was mache ich, wenn ich kurzfristig krank werde?', a: 'Informiere umgehend die Treffleitung, damit rechtzeitig für Ersatz gesorgt werden kann. Trag deinen Wunsch/Ausfall wenn möglich auch im Dienstplan ein.' },
    { q: 'Wie trage ich meine Arbeitszeiten für den Nachweis ein?', a: 'Im Reiter „Nachweis“ deines Treffs – die regulären und außerordentlichen Dienste werden automatisch übernommen, abweichende Zeiten kannst du dort direkt anpassen.' },
    { q: 'Wer ist meine Ansprechperson bei Fragen oder Konflikten?', a: 'Erste Ansprechperson ist deine Treffleitung. Bei weiterem Klärungsbedarf wende dich an die Koordination.' },
    { q: 'Was mache ich bei einem Notfall?', a: 'Siehe Notfall-Management unten – Ruhe bewahren, Erstversorgung einleiten, sofort die Treffleitung informieren und den Vorfall dokumentieren.' },
  ],
  emergencyText: 'Im Falle eines Unfalls oder einer Krise: Ruhe bewahren, Erstversorgung einleiten, sofort die Treffleitung informieren. Wichtige Nummern bitte hier durch die Koordination ergänzen lassen.',
};

export const STANDARD: Record<MappenSchluessel, MappeDaten> = { teamermappe: TEAMERMAPPE_STANDARD, treffmappe: TREFFMAPPE_STANDARD };
