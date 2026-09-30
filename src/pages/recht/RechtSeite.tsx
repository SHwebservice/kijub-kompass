import type { ReactNode } from 'react';
import { LOGO } from '../../lib/assets';

/** Rahmen für Seiten, die ohne Anmeldung erreichbar sind (Impressum, Datenschutz). */
export function RechtSeite({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <main className="recht">
      <p><a href="/" className="brand"><img src={LOGO} alt="" width="28" height="28" /> <span>KiJuB-Kompass</span></a></p>
      <h1>{titel}</h1>
      {children}
      <p className="recht__fuss"><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/">Zur Anmeldung</a></p>
    </main>
  );
}
