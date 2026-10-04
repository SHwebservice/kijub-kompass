import { Link } from 'react-router-dom';
import {
  anzahlen, darfInTreff, FREIZEIT_ROLLEN, kollidierende, konflikteFuer, konfliktText, ohneLeitungIds, personName, spaltenZeitraum, TREFF_ROLLEN, ueberschneidungsPaare,
  type Akzeptiert, type FreizeitRolle, type FreizeitSpalte, type FreizeitTeamZeile, type TreffRolle, type TreffSpalte, type Zuordnungen,
} from '../../zuordnung/logik';
import type { PersonZeile } from '../../zuordnung/api';
import { Badge } from '../../components/ui';
import { RollenAuswahl } from './RollenAuswahl';

export interface ZuordnungsAnsicht {
  /** Die angezeigten Freizeiten (Spalten). */
  spalten: FreizeitSpalte[];
  treffs: TreffSpalte[];
  freizeitTeams: FreizeitTeamZeile[];
  z: Zuordnungen;
  /** Bewusst akzeptierte Überschneidungen: dafür gibt es keine Warnung. */
  akzeptiert: Akzeptiert;
  aendereFreizeit: (person: PersonZeile, f: FreizeitSpalte, rolle: FreizeitRolle | null) => void;
  aendereTreff: (person: PersonZeile, t: TreffSpalte, rolle: TreffRolle | null) => void;
  gesperrt: boolean;
}

interface Props extends ZuordnungsAnsicht {
  personen: PersonZeile[];
  oeffne: (p: PersonZeile) => void;
  /** Öffnet die Überschneidungen einer Person (Freizeiten ansehen, akzeptieren). */
  oeffneUeberschneidung: (p: PersonZeile) => void;
}

/** Die Personen-Tabelle mit einer Spalte je Freizeit und je Treff. Eine Auswahl in der Zelle ordnet zu, ändert die Rolle oder entfernt. */
export function ZuordnungsTabelle({ personen, spalten, treffs, freizeitTeams, z, akzeptiert, aendereFreizeit, aendereTreff, gesperrt, oeffne, oeffneUeberschneidung }: Props) {
  const keineLeitung = ohneLeitungIds(spalten, freizeitTeams);

  return (
    <div className="tabelle-wrap zuordnung-wrap">
      <table className="tabelle zuordnung">
        <caption className="sr-only">Personen mit ihren Zuordnungen zu Freizeiten und Treffs</caption>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="zuordnung__person">Person</th>
            {spalten.length > 0 && <th scope="colgroup" colSpan={spalten.length} className="zuordnung__gruppe">Freizeiten</th>}
            {treffs.length > 0 && <th scope="colgroup" colSpan={treffs.length} className="zuordnung__gruppe">Treffs</th>}
          </tr>
          <tr>
            {spalten.map((f) => {
              const n = anzahlen(f.id, freizeitTeams);
              return (
                <th key={f.id} scope="col" className="zuordnung__kopf">
                  <Link to={`/freizeiten/${f.id}/team`}>{f.name}</Link>
                  <div className="zuordnung__klein">{spaltenZeitraum(f)}</div>
                  <div className="zuordnung__klein">{n.leitung} Leitung · {n.teamer} Team</div>
                  {keineLeitung.has(f.id) && <Badge ton="danger">Keine Leitung</Badge>}
                </th>
              );
            })}
            {treffs.map((t) => <th key={t.id} scope="col" className="zuordnung__kopf"><Link to={`/treffs/${t.id}/team`}>{t.name}</Link></th>)}
          </tr>
        </thead>
        <tbody>
          {personen.map((p) => {
            const kollision = kollidierende(p.id, spalten, z, akzeptiert);
            const akzeptierte = kollision.size === 0 && ueberschneidungsPaare(p.id, spalten, z).length > 0;
            return (
              <tr key={p.id} className={p.aktiv ? undefined : 'zuordnung__inaktiv'}>
                <th scope="row" className="zuordnung__person">
                  <button type="button" className="linklike" onClick={() => oeffne(p)} aria-label={`Zuordnungen von ${personName(p)} öffnen`}>{personName(p)}</button>
                  <div className="zuordnung__klein">
                    {p.kategorie}
                    {!p.aktiv && ' · deaktiviert'}
                    {kollision.size > 0 && <> <button type="button" className="badge badge--warning badge--knopf" onClick={() => oeffneUeberschneidung(p)}
                      aria-label={`Überschneidung von ${personName(p)} ansehen`}>Überschneidung</button></>}
                    {akzeptierte && <> <button type="button" className="badge badge--knopf" onClick={() => oeffneUeberschneidung(p)}
                      aria-label={`Akzeptierte Überschneidung von ${personName(p)} ansehen`}>Überschneidung akzeptiert</button></>}
                  </div>
                </th>
                {spalten.map((f) => {
                  const konflikte = kollision.has(f.id) ? konflikteFuer(p.id, f, spalten, z, akzeptiert) : [];
                  return (
                    <td key={f.id}>
                      <RollenAuswahl label={`${personName(p)}: ${f.name}`} wert={z.freizeitRolle(f.id, p.id)} optionen={FREIZEIT_ROLLEN} disabled={gesperrt || !p.aktiv}
                        warnung={konflikte.length > 0} titel={konflikte.length ? `Überschneidet sich mit: ${konflikte.map(konfliktText).join(', ')}` : undefined}
                        aendere={(r) => aendereFreizeit(p, f, r)} />
                    </td>
                  );
                })}
                {treffs.map((t) => {
                  const rolle = z.treffRolle(t.id, p.id);
                  const erlaubt = darfInTreff(p.kategorie);
                  return (
                    <td key={t.id}>
                      <RollenAuswahl label={`${personName(p)}: ${t.name}`} wert={rolle} optionen={TREFF_ROLLEN} disabled={gesperrt || !p.aktiv || (!erlaubt && rolle === null)}
                        titel={!erlaubt && rolle === null ? `Die Kategorie „${p.kategorie}“ kann keinem Treff zugeordnet werden` : undefined}
                        aendere={(r) => aendereTreff(p, t, r)} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
