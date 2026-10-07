import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { holeFreizeit } from '../../freizeiten/api';
import { ferienText, heuteIso, phase, zeitraumText } from '../../freizeiten/logik';
import { istLeitungOderKoordination, rolleInFreizeit, type RolleInFreizeit } from '../../lib/rollen';
import { Alert, Badge, EmptyState, Spinner } from '../../components/ui';
import { FzPunkt } from '../../components/FreizeitFarbe';
import { Uebersicht } from './Uebersicht';
import { TeamTab } from './TeamTab';
import { PlanTab } from './PlanTab';
import { HinweiseTab } from './HinweiseTab';
import { LebensmittelTab } from './LebensmittelTab';

interface TabDef { pfad: string; label: string; sichtbar: (r: RolleInFreizeit) => boolean }

/** Welche Reiter eine Rolle in einer Freizeit sieht (Gäste, die sich nur bewerben, sehen nur die Übersicht). */
export const TABS: TabDef[] = [
  { pfad: '', label: 'Übersicht', sichtbar: () => true },
  { pfad: 'plan', label: 'Wochenplan', sichtbar: (r) => r !== 'gast' },
  { pfad: 'hinweise', label: 'Hinweise', sichtbar: (r) => r !== 'gast' },
  { pfad: 'lebensmittel', label: 'Lebensmittel', sichtbar: istLeitungOderKoordination },
  { pfad: 'team', label: 'Team', sichtbar: (r) => r !== 'gast' },
];

export function FreizeitDetail() {
  const { id = '' } = useParams();
  const { rollen } = useAuth();
  const f = useLaden(() => holeFreizeit(id), `freizeit-${id}`);
  if (!rollen) return null;
  const rolle = rolleInFreizeit(rollen, id);
  const tabs = TABS.filter((t) => t.sichtbar(rolle));

  if (f.fehler) return <Alert ton="error">{f.fehler}</Alert>;
  if (f.laedt) return <Spinner />;
  if (!f.daten) {
    return <EmptyState icon="🔍" titel="Freizeit nicht gefunden">Sie existiert nicht mehr, oder du hast keinen Zugriff darauf. <Link to="/freizeiten">Zur Liste</Link></EmptyState>;
  }
  const d = f.daten;
  const p = phase(d, heuteIso());

  return (
    <>
      <p><Link to="/freizeiten">← Alle Freizeiten</Link></p>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: 'var(--space-2)' }}><FzPunkt freizeit={d} />{d.name}</h1>
          <div className="list__meta">
            <span>{zeitraumText(d.start_datum, d.ende_datum)}</span>
            {d.ferienzeitraum && <span>{ferienText(d)}</span>}
            {d.ort_name && <span>{d.ort_name}</span>}
            {rolle === 'leitung' && <Badge ton="accent">Leitung</Badge>}
            {rolle === 'teamer' && <Badge ton="accent">Team</Badge>}
            {d.status === 'abgesagt' && <Badge ton="danger">Abgesagt</Badge>}
            {d.status === 'geplant' && p === 'laufend' && <Badge ton="success">Läuft</Badge>}
            {p === 'vergangen' && <Badge>Vergangen</Badge>}
          </div>
        </div>
        {rolle === 'koordination' && <Link className="btn" to={`/freizeiten/${id}/bearbeiten`}>Bearbeiten</Link>}
      </div>

      {d.kijuko_entfallen_am && rolle === 'koordination' && (
        <Alert ton="info">Diese Freizeit ist in der letzten KiJuKo-Sicherung nicht mehr enthalten.</Alert>
      )}

      {tabs.length > 1 && (
        <nav className="tabs" aria-label="Bereiche der Freizeit">
          {tabs.map((t) => (
            <NavLink key={t.pfad} to={t.pfad === '' ? `/freizeiten/${id}` : `/freizeiten/${id}/${t.pfad}`} end className="tabs__tab">{t.label}</NavLink>
          ))}
        </nav>
      )}

      <Routes>
        <Route index element={<Uebersicht freizeit={d} rolle={rolle} />} />
        {tabs.some((t) => t.pfad === 'plan') && <Route path="plan" element={<PlanTab freizeit={d} rolle={rolle} />} />}
        {tabs.some((t) => t.pfad === 'hinweise') && <Route path="hinweise" element={<HinweiseTab freizeit={d} rolle={rolle} />} />}
        {tabs.some((t) => t.pfad === 'lebensmittel') && <Route path="lebensmittel" element={<LebensmittelTab freizeit={d} />} />}
        {tabs.some((t) => t.pfad === 'team') && <Route path="team" element={<TeamTab freizeit={d} rolle={rolle} />} />}
        <Route path="*" element={<Navigate to={`/freizeiten/${id}`} replace />} />
      </Routes>
    </>
  );
}
