import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthKontext, type AuthWert } from './lib/auth-kontext';
import { berechneRollen, type FreizeitZuordnung, type Ich, type TreffZuordnung } from './lib/rollen';

/**
 * Beispielperson. `ist_koordination: true` (wie im Altbestand) meint beide Bereiche; einzelne Bereiche über
 * `ist_freizeitkoordination` bzw. `ist_treffkoordination`.
 */
export const beispielIch = (o: Partial<Ich> = {}): Ich => {
  const alt = o.ist_koordination === true && o.ist_freizeitkoordination === undefined && o.ist_treffkoordination === undefined;
  const fk = alt || o.ist_freizeitkoordination === true;
  const tk = alt || o.ist_treffkoordination === true;
  return {
    id: 'ich', vorname: 'Anna', nachname: 'Adler', mail: 'anna@test.example', kategorie: 'TeamerIn',
    ...o, ist_koordination: fk || tk, ist_freizeitkoordination: fk, ist_treffkoordination: tk,
  };
};

export interface Szene {
  ich?: Partial<Ich>;
  freizeiten?: FreizeitZuordnung[];
  treffs?: TreffZuordnung[];
  /** Adresse, bei der das Element gerendert wird (Standard "/"). */
  pfad?: string;
  /** Routenmuster, unter dem das Element hängt (Standard "*"). */
  route?: string;
}

/** Rendert ein Element mit Anmeldezustand (beliebige Rolle) und Router. */
export function renderMitAuth(ui: ReactElement, szene: Szene = {}) {
  const ich = beispielIch(szene.ich);
  const rollen = berechneRollen(ich, szene.freizeiten ?? [], szene.treffs ?? []);
  const wert: AuthWert = {
    status: 'bereit', session: null, ich, rollen, fehler: null, mussPasswortAendern: false,
    anmelden: async () => null, passwortAendern: async () => null, abmelden: async () => undefined,
  };
  return render(
    <AuthKontext.Provider value={wert}>
      <MemoryRouter initialEntries={[szene.pfad ?? '/']}>
        <Routes>
          <Route path={szene.route ?? '*'} element={ui} />
          <Route path="*" element={<div data-testid="andere-seite" />} />
        </Routes>
      </MemoryRouter>
    </AuthKontext.Provider>,
  );
}
