import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { rollenBezeichnungen } from '../lib/rollen';
import { PasswortAendern } from './PasswortAendern';
import { VERSION } from '../version';
import { MitteilungenKarte } from './MitteilungenKarte';
import { baueMenue, initialen } from './mehr/menue';
import { DarstellungsUmschalter } from '../components/DarstellungsUmschalter';

/** „Mehr“: Profil, Wissen und Material, Verwaltung (Koordination), Mitteilungen und Konto. */
export function Mehr() {
  const { ich, rollen, abmelden, passwortAendern } = useAuth();
  const gruppen = baueMenue(rollen);
  const bezeichnungen = rollen ? rollenBezeichnungen(rollen) : [];

  return (
    <>
      <PageHeader titel="Mehr" />
      <div className="stack">
        <Card>
          <div className="profil">
            <span className="profil__bild" aria-hidden="true">{initialen(ich?.vorname, ich?.nachname)}</span>
            <div>
              <strong>{ich?.vorname} {ich?.nachname}</strong>
              <div className="profil__mail">{ich?.mail}</div>
              <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                {ich && <Badge>{ich.kategorie}</Badge>}
                {bezeichnungen.map((b) => <Badge key={b} ton="accent">{b}</Badge>)}
              </div>
            </div>
          </div>
        </Card>

        {gruppen.map((g) => (
          <section key={g.id} aria-labelledby={`menue-${g.id}`}>
            <h2 id={`menue-${g.id}`} className="menue__titel">{g.titel}</h2>
            <ul className="menue">
              {g.eintraege.map((x) => (
                <li key={x.pfad}>
                  <Link className="menue__eintrag" to={x.pfad}>
                    <span className="menue__icon" aria-hidden="true">{x.icon}</span>
                    <span className="menue__text"><span className="menue__name">{x.label}</span><span className="menue__hinweis">{x.text}</span></span>
                    <span className="menue__pfeil" aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section aria-labelledby="menue-konto">
          <h2 id="menue-konto" className="menue__titel">Mein Konto</h2>
          <div className="stack">
            <Card>
              <strong id="darstellung-titel">Darstellung</strong>
              <p className="field__hint">Hell, dunkel oder wie dein Gerät. Gilt nur in diesem Browser.</p>
              <DarstellungsUmschalter />
            </Card>
            <MitteilungenKarte />
            <details className="menue__details">
              <summary>Passwort ändern</summary>
              <PasswortAendern speichern={passwortAendern} />
            </details>
            <Button block onClick={() => void abmelden()}>Abmelden</Button>
          </div>
        </section>

        <p className="field__hint" style={{ textAlign: 'center' }}>
          <Link to="/impressum">Impressum</Link> · <Link to="/datenschutz">Datenschutz</Link><br />KiJuB-Kompass · Version {VERSION}
        </p>
      </div>
    </>
  );
}
