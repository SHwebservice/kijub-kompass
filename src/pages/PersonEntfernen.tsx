import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Spinner, TextField } from '../components/ui';

export interface Uebersicht {
  hat_zugang: boolean;
  ist_koordination: boolean;
  aktiv: boolean;
  freizeiten: number;
  leitung_freizeiten: number;
  treffs: number;
  bewerbungen: number;
  dienste: number;
  abwesenheiten: number;
  nachweise: number;
  vorschlaege: number;
  notizen_verfasst: number;
}

export type Modus = 'deaktivieren' | 'zugang' | 'person';

const n = (zahl: number, einzahl: string, mehrzahl: string) => `${zahl} ${zahl === 1 ? einzahl : mehrzahl}`;

/** Was beim endgültigen Löschen mit verschwindet (nur Posten, die es wirklich gibt). */
export function folgenListe(u: Uebersicht): string[] {
  const l: string[] = [];
  if (u.freizeiten) {
    l.push(`Zuordnung zu ${n(u.freizeiten, 'Freizeit', 'Freizeiten')}` +
      (u.leitung_freizeiten ? ` (davon ${n(u.leitung_freizeiten, 'Mal', 'Mal')} als Leitung)` : ''));
  }
  if (u.treffs) l.push(`Zuordnung zu ${n(u.treffs, 'Treff', 'Treffs')}`);
  if (u.bewerbungen) l.push(n(u.bewerbungen, 'Bewerbung', 'Bewerbungen'));
  if (u.dienste) l.push(n(u.dienste, 'Dienst-Zuteilung', 'Dienst-Zuteilungen'));
  if (u.abwesenheiten) l.push(n(u.abwesenheiten, 'Abwesenheit', 'Abwesenheiten'));
  if (u.nachweise) l.push(n(u.nachweise, 'Zeitnachweis', 'Zeitnachweise'));
  if (u.vorschlaege) l.push(n(u.vorschlaege, 'Programmpunkt-Vorschlag', 'Programmpunkt-Vorschläge'));
  return l;
}

/** Stimmt die Eingabe mit dem Nachnamen überein? (Groß-/Kleinschreibung und Leerzeichen am Rand egal) */
export function nameBestaetigt(eingabe: string, nachname: string): boolean {
  return eingabe.trim().length > 0 && eingabe.trim().toLowerCase() === nachname.trim().toLowerCase();
}

interface Props {
  person: { vorname: string; nachname: string; aktiv: boolean };
  ladeUebersicht: () => Promise<Uebersicht>;
  /** Führt die Aktion aus; liefert eine Fehlermeldung oder null. */
  ausfuehren: (modus: Modus) => Promise<string | null>;
  schliessen: () => void;
}

/** Bestätigungsfenster: deaktivieren, Zugang entziehen oder Person endgültig löschen. */
export function PersonEntfernen({ person, ladeUebersicht, ausfuehren, schliessen }: Props) {
  const [u, setU] = useState<Uebersicht | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    let aktuell = true;
    ladeUebersicht()
      .then((x) => { if (aktuell) setU(x); })
      .catch(() => { if (aktuell) setLadeFehler('Die Übersicht konnte nicht geladen werden.'); });
    return () => { aktuell = false; };
  }, [ladeUebersicht]);

  const name = `${person.vorname} ${person.nachname}`;
  const bereit = modus !== null && (modus !== 'person' || nameBestaetigt(eingabe, person.nachname));

  async function bestaetigen() {
    if (!modus || !bereit) return;
    setLaedt(true); setFehler(null);
    const f = await ausfuehren(modus);
    setLaedt(false);
    if (f) setFehler(f);
  }

  const auswahl = (wert: Modus, titel: string, text: string, verfuegbar = true) => (
    <label className="option" style={{ opacity: verfuegbar ? 1 : 0.5 }}>
      <input type="radio" name="modus" value={wert} checked={modus === wert} disabled={!verfuegbar}
        onChange={() => { setModus(wert); setFehler(null); setEingabe(''); }} />
      <span><strong>{titel}</strong><br /><span style={{ color: 'var(--text-muted)' }}>{text}</span></span>
    </label>
  );

  return (
    <Card>
      <h2>„{name}" entfernen</h2>
      {ladeFehler && <Alert ton="error">{ladeFehler}</Alert>}
      {!u && !ladeFehler && <Spinner />}
      {u && (
        <>
          <p className="row" style={{ gap: 'var(--space-2)' }}>
            <Badge ton={u.hat_zugang ? 'success' : 'neutral'}>{u.hat_zugang ? 'Hat Zugang' : 'Kein Zugang'}</Badge>
            {!u.aktiv && <Badge ton="danger">Deaktiviert</Badge>}
            {u.ist_koordination && <Badge ton="warning">Koordination</Badge>}
          </p>

          <fieldset className="optionen">
            <legend className="sr-only">Was soll passieren?</legend>
            {auswahl('deaktivieren', 'Deaktivieren',
              'Zugang sofort gesperrt, alle Daten bleiben erhalten. Jederzeit rückgängig zu machen.', u.aktiv)}
            {auswahl('zugang', 'Zugang entziehen',
              'Das Login wird gelöscht. Die Person und alle ihre Daten bleiben erhalten; später kann ein neuer Zugang eingerichtet werden.', u.hat_zugang)}
            {auswahl('person', 'Person endgültig löschen',
              'Person, Zugang und alle zugehörigen Daten werden unwiderruflich entfernt.')}
          </fieldset>

          {modus === 'person' && (
            <div className="stack">
              <Alert ton="error">
                Das lässt sich nicht rückgängig machen.
                {folgenListe(u).length > 0
                  ? ' Mit der Person verschwinden:'
                  : ' An der Person hängen keine weiteren Daten.'}
                {folgenListe(u).length > 0 && (
                  <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-5)' }}>
                    {folgenListe(u).map((z) => <li key={z}>{z}</li>)}
                  </ul>
                )}
              </Alert>
              {u.nachweise > 0 && (
                <Alert ton="info">
                  Zeitnachweise können aufbewahrungspflichtig sein (Arbeitszeitnachweise). Im Zweifel besser nur deaktivieren.
                </Alert>
              )}
              {u.notizen_verfasst > 0 && (
                <p>{n(u.notizen_verfasst, 'verfasster Hinweis/Absprache bleibt', 'verfasste Hinweise/Absprachen bleiben')} ohne Namen erhalten.</p>
              )}
              <TextField label={`Zur Bestätigung den Nachnamen eingeben: ${person.nachname}`}
                value={eingabe} onChange={(e) => setEingabe(e.target.value)} autoComplete="off" />
            </div>
          )}

          {fehler && <Alert ton="error">{fehler}</Alert>}
        </>
      )}

      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <Button variante={modus === 'person' ? 'danger' : 'primary'} laedt={laedt} disabled={!bereit}
          onClick={() => void bestaetigen()}>
          {modus === 'person' ? 'Endgültig löschen' : modus === 'zugang' ? 'Zugang entziehen' : 'Bestätigen'}
        </Button>
        <Button onClick={schliessen}>Abbrechen</Button>
      </div>
    </Card>
  );
}
