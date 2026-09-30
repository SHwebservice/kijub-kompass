import { useState } from 'react';
import { Link } from 'react-router-dom';
import { phase } from '../../freizeiten/logik';
import {
  darfInTreff, FREIZEIT_ROLLEN, konflikteFuer, konfliktText, personName, spaltenZeitraum, TREFF_ROLLEN,
  type FreizeitSpalte,
} from '../../zuordnung/logik';
import type { PersonZeile } from '../../zuordnung/api';
import { Sheet } from '../../components/Sheet';
import { Badge } from '../../components/ui';
import { RollenAuswahl } from './RollenAuswahl';
import type { ZuordnungsAnsicht } from './ZuordnungsTabelle';

interface Props extends Omit<ZuordnungsAnsicht, 'spalten'> {
  person: PersonZeile;
  /** Alle Freizeiten (auch vergangene). */
  freizeiten: FreizeitSpalte[];
  heute: string;
  schliessen: () => void;
}

/** Alle Zuordnungen einer Person auf einen Blick: jede Freizeit und jeder Treff mit Auswahl. Gut für das Handy, wo die Tabelle zu breit ist. */
export function ZuordnungSheet({ person, freizeiten, treffs, z, heute, aendereFreizeit, aendereTreff, gesperrt, schliessen }: Props) {
  const [vergangene, setVergangene] = useState(false);
  const sichtbar = freizeiten
    .filter((f) => f.status === 'geplant' && (vergangene || phase(f, heute) !== 'vergangen' || z.freizeitRolle(f.id, person.id) !== null))
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum) || a.name.localeCompare(b.name, 'de'));
  const hatVergangene = freizeiten.some((f) => f.status === 'geplant' && phase(f, heute) === 'vergangen' && z.freizeitRolle(f.id, person.id) === null);
  const erlaubt = darfInTreff(person.kategorie);
  // Während gespeichert wird, ist alles gesperrt; bei deaktivierten Personen lassen sich Zuordnungen nur noch entfernen
  const gesperrtFuer = (rolle: unknown, erlaubtHier = true) => gesperrt || (rolle === null && (!person.aktiv || !erlaubtHier));

  return (
    <Sheet titel={`Zuordnungen · ${personName(person)}`} schliessen={schliessen}>
      <p className="field__hint">{person.kategorie}{!person.aktiv && ' · deaktiviert – Zuordnungen lassen sich nur noch entfernen'}</p>

      <h3>Freizeiten</h3>
      {sichtbar.length === 0 && <p>Keine laufenden oder kommenden Freizeiten.</p>}
      <ul className="list" aria-label="Freizeiten">
        {sichtbar.map((f) => {
          const konflikte = konflikteFuer(person.id, f, freizeiten, z);
          const rolle = z.freizeitRolle(f.id, person.id);
          return (
            <li key={f.id} className="list__item">
              <div className="list__main">
                <Link className="list__title" to={`/freizeiten/${f.id}/team`} onClick={schliessen}>{f.name}</Link>
                <div className="list__meta">
                  <span>{spaltenZeitraum(f)}</span>
                  {rolle && konflikte.length > 0 && <Badge ton="warning">Überschneidung: {konflikte.map(konfliktText).join(', ')}</Badge>}
                </div>
              </div>
              <RollenAuswahl label={`${f.name}`} wert={rolle} optionen={FREIZEIT_ROLLEN} disabled={gesperrtFuer(rolle)} warnung={!!rolle && konflikte.length > 0}
                aendere={(r) => aendereFreizeit(person, f, r)} />
            </li>
          );
        })}
      </ul>
      {hatVergangene && (
        <label className="option">
          <input type="checkbox" checked={vergangene} onChange={(e) => setVergangene(e.target.checked)} />
          <span>Vergangene Freizeiten anzeigen</span>
        </label>
      )}

      <h3>Treffs</h3>
      {treffs.length === 0 && <p>Es gibt noch keine Treffs.</p>}
      {treffs.length > 0 && !erlaubt && <p className="field__hint">Die Kategorie „{person.kategorie}“ kann keinem Treff zugeordnet werden.</p>}
      <ul className="list" aria-label="Treffs">
        {treffs.map((t) => {
          const rolle = z.treffRolle(t.id, person.id);
          return (
            <li key={t.id} className="list__item">
              <div className="list__main"><Link className="list__title" to={`/treffs/${t.id}/team`} onClick={schliessen}>{t.name}</Link></div>
              <RollenAuswahl label={t.name} wert={rolle} optionen={TREFF_ROLLEN} disabled={gesperrtFuer(rolle, erlaubt)} aendere={(r) => aendereTreff(person, t, r)} />
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
