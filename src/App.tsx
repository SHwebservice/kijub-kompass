import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/auth-kontext';
import { konfiguriert } from './lib/supabase';
import { AppShell } from './components/AppShell';
import { Alert, Button, Card, Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Heute } from './pages/Heute';
import { PasswortAendern } from './pages/PasswortAendern';
import { Impressum } from './pages/recht/Impressum';
import { Datenschutz } from './pages/recht/Datenschutz';


/** Seiten werden erst geladen, wenn man sie öffnet – der Start bleibt schlank. */
const Mehr = lazy(() => import('./pages/Mehr').then((m) => ({ default: m.Mehr })));
const Personen = lazy(() => import('./pages/Personen').then((m) => ({ default: m.Personen })));
const KijukoImportSeite = lazy(() => import('./pages/KijukoImport').then((m) => ({ default: m.KijukoImportSeite })));
const ChecklisteVorlage = lazy(() => import('./pages/ChecklisteVorlage').then((m) => ({ default: m.ChecklisteVorlage })));
const FreizeitenListe = lazy(() => import('./pages/freizeiten/FreizeitenListe').then((m) => ({ default: m.FreizeitenListe })));
const FreizeitDetail = lazy(() => import('./pages/freizeiten/FreizeitDetail').then((m) => ({ default: m.FreizeitDetail })));
const FreizeitForm = lazy(() => import('./pages/freizeiten/FreizeitForm').then((m) => ({ default: m.FreizeitForm })));
const Orte = lazy(() => import('./pages/Orte').then((m) => ({ default: m.Orte })));
const MappeSeite = lazy(() => import('./pages/mappen/MappeSeite').then((m) => ({ default: m.MappeSeite })));
const FormularSeite = lazy(() => import('./pages/mappen/FormularSeite').then((m) => ({ default: m.FormularSeite })));
const KatalogListe = lazy(() => import('./pages/katalog/KatalogListe').then((m) => ({ default: m.KatalogListe })));
const AngebotDetail = lazy(() => import('./pages/katalog/AngebotDetail').then((m) => ({ default: m.AngebotDetail })));
const AngebotForm = lazy(() => import('./pages/katalog/AngebotForm').then((m) => ({ default: m.AngebotForm })));
const Vorschlaege = lazy(() => import('./pages/katalog/Vorschlaege').then((m) => ({ default: m.Vorschlaege })));
const KatalogImport = lazy(() => import('./pages/katalog/KatalogImport').then((m) => ({ default: m.KatalogImport })));
const QuizSeite = lazy(() => import('./pages/quiz/QuizSeite').then((m) => ({ default: m.QuizSeite })));
const QuizVerwaltung = lazy(() => import('./pages/quiz/QuizVerwaltung').then((m) => ({ default: m.QuizVerwaltung })));
const TreffeListe = lazy(() => import('./pages/treffs/TreffeListe').then((m) => ({ default: m.TreffeListe })));
const TreffDetail = lazy(() => import('./pages/treffs/TreffDetail').then((m) => ({ default: m.TreffDetail })));
const TreffForm = lazy(() => import('./pages/treffs/TreffForm').then((m) => ({ default: m.TreffForm })));
const Fehlermeldungen = lazy(() => import('./pages/Fehlermeldungen').then((m) => ({ default: m.Fehlermeldungen })));
const Bewerbungen = lazy(() => import('./pages/Bewerbungen').then((m) => ({ default: m.Bewerbungen })));
const MitteilungSenden = lazy(() => import('./pages/MitteilungSenden').then((m) => ({ default: m.MitteilungSenden })));

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
        <Route path="freizeiten/neu" element={rollen?.freizeitkoordination ? <FreizeitForm /> : <Navigate to="/freizeiten" replace />} />
        <Route path="freizeiten/:id/bearbeiten" element={rollen?.freizeitkoordination ? <FreizeitForm /> : <Navigate to="/freizeiten" replace />} />
        <Route path="freizeiten/:id/*" element={<FreizeitDetail />} />
        <Route path="treffs" element={<TreffeListe />} />
        <Route path="treffs/neu" element={rollen?.treffkoordination ? <TreffForm /> : <Navigate to="/treffs" replace />} />
        <Route path="treffs/:id/bearbeiten" element={rollen?.treffkoordination ? <TreffForm /> : <Navigate to="/treffs" replace />} />
        <Route path="treffs/:id/*" element={<TreffDetail />} />
        <Route path="katalog" element={<KatalogListe />} />
        <Route path="katalog/neu" element={rollen?.koordination ? <AngebotForm modus="neu" /> : <Navigate to="/katalog" replace />} />
        <Route path="katalog/vorschlagen" element={<AngebotForm modus="vorschlag" />} />
        <Route path="katalog/vorschlaege" element={<Vorschlaege />} />
        <Route path="katalog/import" element={rollen?.koordination ? <KatalogImport /> : <Navigate to="/katalog" replace />} />
        <Route path="katalog/:id/bearbeiten" element={rollen?.koordination ? <AngebotForm modus="bearbeiten" /> : <Navigate to="/katalog" replace />} />
        <Route path="katalog/:id" element={<AngebotDetail />} />
        <Route path="teamermappe" element={<MappeSeite schluessel="teamermappe" titel="Teamermappe" mitSchlagworten
          untertitel="Regeln, Abläufe und Antworten für die Arbeit in den Freizeiten." />} />
        <Route path="quiz" element={<QuizSeite />} />
        <Route path="quiz/verwalten" element={rollen?.koordination ? <QuizVerwaltung /> : <Navigate to="/quiz" replace />} />
        <Route path="formulare" element={<FormularSeite />} />
        <Route path="treffmappe" element={rollen?.darfTreffmappe ? <MappeSeite schluessel="treffmappe" titel="Treffmappe" mitSchlagworten={false}
          untertitel="Regeln, Abläufe und Antworten für die Arbeit in den Treffs." /> : <Navigate to="/" replace />} />
        <Route path="mehr" element={<Mehr />} />
        <Route path="mitteilungen" element={rollen?.koordination ? <MitteilungSenden /> : <Navigate to="/" replace />} />
        <Route path="personen" element={rollen?.koordination ? <Personen /> : <Navigate to="/" replace />} />
        <Route path="fehler" element={rollen?.koordination ? <Fehlermeldungen /> : <Navigate to="/" replace />} />
        <Route path="orte" element={rollen?.koordination ? <Orte /> : <Navigate to="/" replace />} />
        <Route path="bewerbungen" element={rollen?.freizeitkoordination ? <Bewerbungen /> : <Navigate to="/" replace />} />
        <Route path="import" element={rollen?.freizeitkoordination ? <KijukoImportSeite /> : <Navigate to="/" replace />} />
        <Route path="checkliste" element={rollen?.freizeitkoordination ? <ChecklisteVorlage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Ohne Anmeldung erreichbar */}
          <Route path="impressum" element={<Impressum />} />
          <Route path="datenschutz" element={<Datenschutz />} />
          <Route path="*" element={<Zugang />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
