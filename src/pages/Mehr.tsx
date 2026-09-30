import { Link } from 'react-router-dom';
import { Button, Card, PageHeader } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { PasswortAendern } from './PasswortAendern';
import { VERSION } from '../version';

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
        <Card>
          <h2>Wissen</h2>
          <ul className="list">
            <li><Link className="list__item" to="/teamermappe">Teamermappe</Link></li>
            <li><Link className="list__item" to="/formulare">Formulare</Link></li>
            <li><Link className="list__item" to="/quiz">Quiz</Link></li>
            {rollen?.darfTreffmappe && <li><Link className="list__item" to="/treffmappe">Treffmappe</Link></li>}
          </ul>
        </Card>
        {rollen?.koordination && (
          <Card>
            <h2>Koordination</h2>
            <ul className="list">
              <li><Link className="list__item" to="/bewerbungen">Bewerbungen</Link></li>
              <li><Link className="list__item" to="/personen">Personen &amp; Zugänge</Link></li>
              <li><Link className="list__item" to="/orte">Orte</Link></li>
              <li><Link className="list__item" to="/import">KiJuKo-Import</Link></li>
            </ul>
          </Card>
        )}
        <PasswortAendern speichern={passwortAendern} />
        <Button block onClick={() => void abmelden()}>Abmelden</Button>
        <p className="field__hint" style={{ textAlign: 'center' }}>
          <Link to="/impressum">Impressum</Link> · <Link to="/datenschutz">Datenschutz</Link><br />KiJuB-Kompass · Version {VERSION}
        </p>
      </div>
    </>
  );
}
