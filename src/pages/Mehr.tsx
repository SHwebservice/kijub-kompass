import { Link } from 'react-router-dom';
import { Button, Card, PageHeader } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { PasswortAendern } from './PasswortAendern';

export function Mehr() {
  const { ich, rollen, abmelden, passwortAendern } = useAuth();
  return (
    <>
      <PageHeader titel="Mehr" />
      <div className="stack">
        <Card>
          <strong>{ich?.vorname} {ich?.nachname}</strong>
          <p style={{ marginBottom: 0, color: 'var(--text-muted)' }}>{ich?.mail}</p>
        </Card>
        {rollen?.koordination && (
          <Card>
            <h2>Koordination</h2>
            <ul className="list">
              <li><Link className="list__item" to="/personen">Personen &amp; Zugänge</Link></li>
            </ul>
          </Card>
        )}
        <PasswortAendern speichern={passwortAendern} />
        <Button block onClick={() => void abmelden()}>Abmelden</Button>
      </div>
    </>
  );
}
