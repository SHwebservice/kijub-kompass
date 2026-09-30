import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/auth-kontext';
import { konfiguriert } from './lib/supabase';
import { AppShell } from './components/AppShell';
import { Alert, Button, Card, Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Heute, Platzhalter } from './pages/Heute';
import { Mehr } from './pages/Mehr';
import { Personen } from './pages/Personen';

function Zugang() {
  const { status, fehler, codeSenden, codePruefen, abmelden } = useAuth();

  if (status === 'laedt') {
    return <div className="login"><Spinner beschriftung="App wird geladen …" /></div>;
  }
  if (status === 'abgemeldet') {
    return <Login codeSenden={codeSenden} codePruefen={codePruefen} konfiguriert={konfiguriert} />;
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

  return <Geschuetzt />;
}

function Geschuetzt() {
  const { rollen } = useAuth();
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Heute />} />
        <Route path="freizeiten/*" element={<Platzhalter titel="Freizeiten" text="Stammdaten, Wochenplan, Hinweise und Lebensmittel folgen in Phase 3." />} />
        <Route path="treffs/*" element={<Platzhalter titel="Treffs" text="Wochenprogramm, Dienstplan und Nachweise folgen in Phase 3." />} />
        <Route path="katalog/*" element={<Platzhalter titel="Katalog" text="Programmpunkte, Favoriten und Bewertungen folgen in Phase 3." />} />
        <Route path="mehr" element={<Mehr />} />
        <Route path="personen" element={rollen?.koordination ? <Personen /> : <Navigate to="/" replace />} />
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
