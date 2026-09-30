import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/auth-kontext';
import { konfiguriert } from './lib/supabase';
import { AppShell } from './components/AppShell';
import { Alert, Button, Card, Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Heute, Platzhalter } from './pages/Heute';
import { Mehr } from './pages/Mehr';
import { Personen } from './pages/Personen';
import { PasswortAendern } from './pages/PasswortAendern';
import { KijukoImportSeite } from './pages/KijukoImport';
import { FreizeitenListe } from './pages/freizeiten/FreizeitenListe';
import { FreizeitDetail } from './pages/freizeiten/FreizeitDetail';
import { FreizeitForm } from './pages/freizeiten/FreizeitForm';
import { Orte } from './pages/Orte';
import { Bewerbungen } from './pages/Bewerbungen';

function Zugang() {
  const { status, fehler, mussPasswortAendern, anmelden, passwortAendern, abmelden } = useAuth();
  const navigate = useNavigate();
  const zurStartseite = () => navigate('/', { replace: true });

  if (status === 'laedt') {
    return <div className="login"><Spinner beschriftung="App wird geladen …" /></div>;
  }
  if (status === 'abgemeldet') {
    return <Login anmelden={anmelden} konfiguriert={konfiguriert} nachAnmeldung={zurStartseite} />;
  }
  if (status === 'keine_person' || status === 'fehler') {
    return (
      <div className="login">
        <div className="login__box">
          <Card>
            <h1>Kein Zugriff</h1>
            <Alert ton="error">
              {status === 'keine_person'
                ? 'Dein Konto ist keiner Person im KiJuB-Kompass zugeordnet. Bitte wende dich an die Koordination.'
                : `Die Daten konnten nicht geladen werden${fehler ? ` (${fehler})` : ''}.`}
            </Alert>
            <Button block onClick={() => void abmelden()}>Abmelden</Button>
          </Card>
        </div>
      </div>
    );
  }

  if (mussPasswortAendern) {
    return <PasswortAendern erzwungen speichern={passwortAendern} abmelden={() => void abmelden()} onFertig={zurStartseite} />;
  }

  return <Geschuetzt />;
}

function Geschuetzt() {
  const { rollen } = useAuth();
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Heute />} />
        <Route path="freizeiten" element={<FreizeitenListe />} />
        <Route path="freizeiten/neu" element={rollen?.koordination ? <FreizeitForm /> : <Navigate to="/freizeiten" replace />} />
        <Route path="freizeiten/:id/bearbeiten" element={rollen?.koordination ? <FreizeitForm /> : <Navigate to="/freizeiten" replace />} />
        <Route path="freizeiten/:id/*" element={<FreizeitDetail />} />
        <Route path="treffs/*" element={<Platzhalter titel="Treffs" text="Wochenprogramm, Dienstplan und Nachweise folgen in Phase 3." />} />
        <Route path="katalog/*" element={<Platzhalter titel="Katalog" text="Programmpunkte, Favoriten und Bewertungen folgen in Phase 3." />} />
        <Route path="mehr" element={<Mehr />} />
        <Route path="personen" element={rollen?.koordination ? <Personen /> : <Navigate to="/" replace />} />
        <Route path="orte" element={rollen?.koordination ? <Orte /> : <Navigate to="/" replace />} />
        <Route path="bewerbungen" element={rollen?.koordination ? <Bewerbungen /> : <Navigate to="/" replace />} />
        <Route path="import" element={rollen?.koordination ? <KijukoImportSeite /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Zugang />
      </BrowserRouter>
    </AuthProvider>
  );
}
