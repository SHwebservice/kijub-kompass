import { FACHSTELLE, LINKS, TRAEGER } from './angaben';
import { RechtSeite } from './RechtSeite';

/**
 * Datenschutzhinweise zu dieser Anwendung (Stand: Funktionsumfang 2026). Beschreiben, was tatsächlich verarbeitet wird.
 * Vor dem Einsatz von der/dem Datenschutzbeauftragten der Stadt prüfen lassen (siehe docs/BETRIEB.md).
 */
export function Datenschutz() {
  return (
    <RechtSeite titel="Datenschutzhinweise">
      <p>Der KiJuB-Kompass ist eine interne Anwendung des Kinder- und Jugendbüros für Mitarbeitende, Teamer*innen und Betreuungskräfte der Ferienfreizeiten und Treffs.
        Er ist nur nach Anmeldung nutzbar. Ergänzend gilt die <a href={LINKS.datenschutzStadt} target="_blank" rel="noopener noreferrer">Datenschutzerklärung der Stadt Frankenthal (Pfalz)</a>.</p>

      <h2>Verantwortlich</h2>
      <p>{TRAEGER.name}, {TRAEGER.adresse.join(', ')}, E-Mail: <a href={`mailto:${TRAEGER.mail}`}>{TRAEGER.mail}</a>.<br />
        Fachlich zuständig: {FACHSTELLE.name}, E-Mail: <a href={`mailto:${FACHSTELLE.mail}`}>{FACHSTELLE.mail}</a>, Telefon {FACHSTELLE.telefon}.</p>

      <h2>Welche Daten verarbeitet werden und wozu</h2>
      <ul>
        <li><strong>Stammdaten der Mitarbeitenden:</strong> Name, Mail-Adresse, Telefonnummer, Kategorie (z. B. TeamerIn, TZK), bei Bedarf Ernährungshinweise und interne Notizen. Zweck: Organisation der Einsätze und Erreichbarkeit im Team.</li>
        <li><strong>Einsätze:</strong> Zuordnung zu Freizeiten und Treffs, Dienstpläne, Dienstwünsche, Bewerbungen. Zweck: Personaleinsatzplanung.</li>
        <li><strong>Abwesenheiten und Zeitnachweise:</strong> Urlaub und Krankheit (nur als Tage, ohne Diagnose) sowie die Nachweise der Teilzeitkräfte. Zweck: Dienstplanung und Arbeitszeitnachweis. Nur die Person selbst, die Treffleitung und die Koordination sehen sie.</li>
        <li><strong>Inhalte:</strong> Hinweise, Absprachen, Wochenpläne, Lebensmittelbestände, Bewertungen und Kommentare im Katalog, Quiz-Ergebnisse und Formular-Entwürfe. Zweck: Zusammenarbeit und Qualifizierung.</li>
        <li><strong>Teilnehmende Kinder:</strong> Es werden keine Namenslisten von Kindern gespeichert. Die Anwesenheitsliste bleibt im Browser und wird nicht übertragen. Freie Texte (z. B. Hinweise) sollten keine Namen oder Gesundheitsdaten von Kindern enthalten.</li>
        <li><strong>Anmeldung:</strong> Mail-Adresse und ein verschlüsselt gespeichertes Passwort; Zeitpunkt der letzten Anmeldung.</li>
      </ul>

      <h2>Wer Zugriff hat</h2>
      <p>Jede Person sieht nur, was für ihre Aufgabe nötig ist: Kontaktdaten und Ernährungshinweise sehen nur Leitungen der jeweiligen Freizeit bzw. des Treffs und die Koordination. Die Zugriffsregeln werden von der Datenbank selbst durchgesetzt.</p>

      <h2>Dienstleister</h2>
      <p>Die Datenbank und die Anmeldung werden von Supabase betrieben, die Auslieferung der Webseite übernimmt Cloudflare. Beide verarbeiten Daten im Auftrag der Stadt auf Grundlage von Auftragsverarbeitungsverträgen. Eine Weitergabe an sonstige Dritte findet nicht statt.</p>

      <h2>Cookies und lokale Speicherung</h2>
      <p>Die Anwendung setzt keine Werbe- oder Analyse-Cookies. Im Browser wird lediglich die Anmeldung gespeichert, damit du nicht bei jedem Öffnen neu anmelden musst.</p>

      <h2>Speicherdauer</h2>
      <p>Daten werden gelöscht, wenn sie nicht mehr gebraucht werden. Auf Wunsch entfernt die Koordination eine Person mit allen zugehörigen Daten. Zeitnachweise können aufbewahrungspflichtig sein und werden in dem Fall nur gesperrt. Sicherungskopien der Datenbank werden verschlüsselt abgelegt und nach 60 Tagen automatisch gelöscht.</p>

      <h2>Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch sowie das Recht, dich bei der zuständigen Datenschutz-Aufsichtsbehörde zu beschweren. Wende dich dazu an das Kinder- und Jugendbüro oder an die/den Datenschutzbeauftragte*n der Stadt Frankenthal (Pfalz) über die oben genannte Adresse.</p>
    </RechtSeite>
  );
}
