import { LOGO } from '../lib/assets';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, TextField } from '../components/ui';

interface Props {
  codeSenden: (mail: string) => Promise<string | null>;
  codePruefen: (mail: string, code: string) => Promise<string | null>;
  konfiguriert: boolean;
}

/** Anmeldung per Einmalcode: Mail eingeben → Code aus der Mail eintippen. Kein Passwort. */
export function Login({ codeSenden, codePruefen, konfiguriert }: Props) {
  const [schritt, setSchritt] = useState<'mail' | 'code'>('mail');
  const [mail, setMail] = useState('');
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function mailAbsenden(e: FormEvent) {
    e.preventDefault();
    setLaedt(true); setFehler(null);
    const f = await codeSenden(mail);
    setLaedt(false);
    if (f) setFehler(f); else setSchritt('code');
  }

  async function codeAbsenden(e: FormEvent) {
    e.preventDefault();
    setLaedt(true); setFehler(null);
    const f = await codePruefen(mail, code);
    setLaedt(false);
    if (f) setFehler(f);
    // Bei Erfolg wechselt die App über den Auth-Zustand von selbst in den angemeldeten Bereich.
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
          {schritt === 'mail' ? (
            <form onSubmit={mailAbsenden} noValidate>
              <h2>Anmelden</h2>
              <p>Wir schicken dir einen Code an deine Mail-Adresse. Ein Passwort brauchst du nicht.</p>
              {fehler && <Alert ton="error">{fehler}</Alert>}
              <TextField label="Mail-Adresse" type="email" autoComplete="email" inputMode="email"
                value={mail} onChange={(e) => setMail(e.target.value)} required />
              <Button variante="primary" block type="submit" laedt={laedt} disabled={!mail.includes('@') || !konfiguriert}>
                Code senden
              </Button>
            </form>
          ) : (
            <form onSubmit={codeAbsenden} noValidate>
              <h2>Code eingeben</h2>
              <p>Wir haben einen Code an <strong>{mail}</strong> geschickt. Er ist kurze Zeit gültig.</p>
              {fehler && <Alert ton="error">{fehler}</Alert>}
              <TextField label="Code" autoComplete="one-time-code" inputMode="numeric"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                hinweis="Sechs bis acht Ziffern aus der Mail" required />
              <Button variante="primary" block type="submit" laedt={laedt} disabled={code.length < 6}>
                Anmelden
              </Button>
              <p className="center" style={{ marginTop: 'var(--space-3)' }}>
                <Button variante="ghost" klein onClick={() => { setSchritt('mail'); setCode(''); setFehler(null); }}>
                  Andere Mail-Adresse verwenden
                </Button>
              </p>
            </form>
          )}
        </Card>

        <p className="center" style={{ color: 'var(--text-hint)', fontSize: 'var(--fs-sm)', marginTop: 'var(--space-4)' }}>
          Noch keinen Zugang? Die Koordination lädt dich per Mail ein.
        </p>
      </div>
    </div>
  );
}
