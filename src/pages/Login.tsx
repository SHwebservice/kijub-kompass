import { useState, type FormEvent } from 'react';
import { LOGO } from '../lib/assets';
import { Alert, Button, Card, TextField } from '../components/ui';

interface Props {
  anmelden: (mail: string, passwort: string) => Promise<string | null>;
  konfiguriert: boolean;
  /** Wird nach erfolgreicher Anmeldung aufgerufen (die App springt dann zur Startseite). */
  nachAnmeldung?: () => void;
}

/** Anmeldung mit Mail-Adresse und Passwort. Zugänge richtet die Koordination ein. */
export function Login({ anmelden, konfiguriert, nachAnmeldung }: Props) {
  const [mail, setMail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaedt(true); setFehler(null);
    const f = await anmelden(mail, passwort);
    setLaedt(false);
    if (f) { setFehler(f); return; }
    // Bei Erfolg wechselt die App über den Auth-Zustand von selbst in den angemeldeten Bereich.
    nachAnmeldung?.();
  }

  return (
    <div className="login">
      <div className="login__box">
        <img className="login__logo" src={LOGO} alt="" />
        <h1 className="center">KiJuB-Kompass</h1>

        {!konfiguriert && (
          <Alert ton="error">
            Die App ist noch nicht mit Supabase verbunden. Bitte <code>.env</code> anlegen
            (siehe <code>docs/SETUP.md</code>).
          </Alert>
        )}

        <Card>
          <form onSubmit={absenden} noValidate>
            <h2>Anmelden</h2>
            {fehler && <Alert ton="error">{fehler}</Alert>}
            <TextField label="Mail-Adresse" type="email" autoComplete="username" inputMode="email"
              value={mail} onChange={(e) => setMail(e.target.value)} required />
            <TextField label="Passwort" type="password" autoComplete="current-password"
              value={passwort} onChange={(e) => setPasswort(e.target.value)} required />
            <Button variante="primary" block type="submit" laedt={laedt}
              disabled={!mail.includes('@') || passwort.length === 0 || !konfiguriert}>
              Anmelden
            </Button>
          </form>
        </Card>

        <p className="center" style={{ color: 'var(--text-hint)', fontSize: 'var(--fs-sm)', marginTop: 'var(--space-4)' }}>
          Noch keinen Zugang oder Passwort vergessen? Bitte bei der Koordination melden.
        </p>
        <p className="center" style={{ color: 'var(--text-hint)', fontSize: 'var(--fs-sm)' }}>
          <a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a>
        </p>
      </div>
    </div>
  );
}
