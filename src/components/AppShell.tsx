import { LOGO } from '../lib/assets';
import { Suspense } from 'react';
import { Spinner } from './ui';
import { NavLink, Outlet } from 'react-router-dom';
import { navigation, type NavEintrag } from '../lib/rollen';
import { useAuth } from '../lib/auth-kontext';
import { DarstellungsKnopf } from './DarstellungsUmschalter';

function Navigation({ eintraege, beschriftung }: { eintraege: NavEintrag[]; beschriftung: string }) {
  return (
    <nav aria-label={beschriftung} className="nav">
      {eintraege.map((e) => (
        <NavLink key={e.pfad} to={e.pfad} end={e.pfad === '/'} className="nav__link">
          <span className="nav__icon" aria-hidden="true">{e.icon}</span>
          <span>{e.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Rahmen der angemeldeten App: Kopf, Inhalt, Navigation (mobil unten, Desktop im Kopf). */
export function AppShell() {
  const { rollen } = useAuth();
  const eintraege = rollen ? navigation(rollen) : [];
  return (
    <div className="shell">
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>
      <header className="shell__header">
        <div className="shell__header-inner">
          <NavLink to="/" className="brand">
            <img src={LOGO} alt="" width="28" height="28" />
            <span>KiJuB-Kompass</span>
          </NavLink>
          <div className="shell__kopf-rechts">
            <div className="shell__nav-top"><Navigation eintraege={eintraege} beschriftung="Hauptnavigation" /></div>
            <DarstellungsKnopf />
          </div>
        </div>
      </header>
      <main id="inhalt" className="shell__main" tabIndex={-1}>
        <Suspense fallback={<div className="seite-laedt"><Spinner /></div>}><Outlet /></Suspense>
      </main>
      <div className="shell__nav-bottom"><Navigation eintraege={eintraege} beschriftung="Hauptnavigation (mobil)" /></div>
    </div>
  );
}
