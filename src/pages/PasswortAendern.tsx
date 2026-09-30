import { useState, type FormEvent } from 'react';
import { LOGO } from '../lib/assets';
import { MIN_PASSWORT, passwortProblem } from '../lib/auth-fehler';
import { Alert, Button, Card, TextField } from '../components/ui';

interface Props {
  /** true: erste Anmeldung mit Startpasswort – die Seite lässt sich nicht überspringen. */
  erzwungen?: boolean;
  speichern: (neu: string) => Promise<string | null>;
  abmelden?: () => void;
  onFertig?: () => void;
}

/** Neues Passwort festlegen (Pflicht nach dem Startpasswort, freiwillig unter „Mehr"). */
export function PasswortAendern({ erzwungen = false, speichern, abmelden, onFertig }: Props) {
  const [neu, setNeu] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(false);
  const [laedt, setLaedt] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    const problem = passwortProblem(neu, wiederholung);
    if (problem) { setFehler(problem); return; }
    setLaedt(true); setFehler(null);
    const f = await speichern(neu);
    setLaedt(false);
    if (f) { setFehler(f); return; }
    setNeu(''); setWiederholung(''); setErledigt(true);
    onFertig?.();
  }

  const formular = (
    <Card>
      <form onSubmit={absenden} noValidate>
        <h2>{erzwungen ? 'Eigenes Passwort festlegen' : 'Passwort ändern'}</h2>
        {erzwungen && (
          <p>Du hast ein Startpasswort von der Koordination bekommen. Bitte lege jetzt ein eigenes fest, das nur du kennst.</p>
        )}
        {fehler && <Alert ton="error">{fehler}</Alert>}
        {erledigt && <Alert ton="success">Passwort gespeichert.</Alert>}
        <TextField label="Neues Passwort" type="password" autoComplete="new-password"
          value={neu} onChange={(e) => { setNeu(e.target.value); setErledigt(false); }}
          hinweis={`Mindestens ${MIN_PASSWORT} Zeichen. Am besten ein eigener Satz, den du sonst nirgends verwendest.`} required />
        <TextField label="Neues Passwort wiederholen" type="password" autoComplete="new-password"
          value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} required />
        <Button variante="primary" block type="submit" laedt={laedt} disabled={neu.length === 0}>
          Passwort speichern
        </Button>
      </form>
    </Card>
  );

  if (!erzwungen) return formular;
  return (
    <div className="login">
      <div className="login__box">
        <img className="login__logo" src={LOGO} alt="" />
        {formular}
        {abmelden && (
          <p className="center" style={{ marginTop: 'var(--space-3)' }}>
            <Button variante="ghost" klein onClick={abmelden}>Abmelden</Button>
          </p>
        )}
      </div>
    </div>
  );
}
