import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { holeTreff } from '../../treffs/api';
import { rolleInTreff, type RolleInTreff } from '../../lib/rollen';
import { Alert, Badge, EmptyState, Spinner } from '../../components/ui';
import { TreffUebersicht } from './TreffUebersicht';
import { TreffTeamTab } from './TreffTeamTab';
import { TreffAbsprachenTab } from './TreffAbsprachenTab';
import { DienstplanTab } from './DienstplanTab';
import { VerwaltungTab } from './VerwaltungTab';
import { NachweisTab } from './NachweisTab';
import { ProtokollTab } from './ProtokollTab';
import { NotizenTab } from './NotizenTab';

interface TabDef { pfad: string; label: string; sichtbar: (r: RolleInTreff) => boolean }

/** Welche Reiter eine Rolle in einem Treff sieht. */
export const TREFF_TABS: TabDef[] = [
  { pfad: '', label: 'Übersicht', sichtbar: () => true },
  { pfad: 'protokoll', label: 'Tagesprotokoll', sichtbar: (r) => r !== 'gast' },
  { pfad: 'notizen', label: 'Notizen', sichtbar: (r) => r !== 'gast' },
  { pfad: 'dienstplan', label: 'Dienstplan', sichtbar: (r) => r !== 'gast' },
  { pfad: 'nachweis', label: 'Stundennachweis', sichtbar: (r) => r !== 'gast' },
  { pfad: 'absprachen', label: 'Absprachen', sichtbar: (r) => r !== 'gast' },
  { pfad: 'team', label: 'Team', sichtbar: (r) => r !== 'gast' },
  { pfad: 'verwaltung', label: 'Abwesenheit & Feiertage', sichtbar: (r) => r === 'treffleitung' || r === 'koordination' },
];

export function TreffDetail() {
  const { id = '' } = useParams();
  const { rollen } = useAuth();
  const t = useLaden(() => holeTreff(id), `treff-${id}`);
  if (!rollen) return null;
  const rolle = rolleInTreff(rollen, id);
  const tabs = TREFF_TABS.filter((x) => x.sichtbar(rolle));

  if (t.fehler) return <Alert ton="error">{t.fehler}</Alert>;
  if (t.laedt) return <Spinner />;
  if (!t.daten) {
    return <EmptyState icon="🔍" titel="Treff nicht gefunden">Er existiert nicht mehr, oder du hast keinen Zugriff darauf. <Link to="/treffs">Zur Liste</Link></EmptyState>;
  }
  const d = t.daten;

  return (
    <>
      <p><Link to="/treffs">← Alle Treffs</Link></p>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: 'var(--space-2)' }}>{d.name}</h1>
          <div className="list__meta">
            {d.ort_name && <span>{d.ort_name}</span>}
            {rolle === 'treffleitung' && <Badge ton="accent">Treffleitung</Badge>}
            {rolle === 'betreuerin' && <Badge ton="accent">Team</Badge>}
          </div>
        </div>
        {rolle === 'koordination' && <Link className="btn" to={`/treffs/${id}/bearbeiten`}>Bearbeiten</Link>}
      </div>

      {tabs.length > 1 && (
        <nav className="tabs" aria-label="Bereiche des Treffs">
          {tabs.map((x) => (
            <NavLink key={x.pfad} to={x.pfad === '' ? `/treffs/${id}` : `/treffs/${id}/${x.pfad}`} end className="tabs__tab">{x.label}</NavLink>
          ))}
        </nav>
      )}

      <Routes>
        <Route index element={<TreffUebersicht treff={d} rolle={rolle} />} />
        {tabs.some((x) => x.pfad === 'protokoll') && <Route path="protokoll" element={<ProtokollTab treff={d} rolle={rolle} />} />}
        {tabs.some((x) => x.pfad === 'notizen') && <Route path="notizen" element={<NotizenTab treff={d} />} />}
        {tabs.some((x) => x.pfad === 'dienstplan') && <Route path="dienstplan" element={<DienstplanTab treff={d} rolle={rolle} />} />}
        {tabs.some((x) => x.pfad === 'dienstplan') && <Route path="monat" element={<Navigate to={`/treffs/${id}/dienstplan?ansicht=monat`} replace />} />}
        {tabs.some((x) => x.pfad === 'nachweis') && <Route path="nachweis" element={<NachweisTab treff={d} rolle={rolle} />} />}
        {tabs.some((x) => x.pfad === 'absprachen') && <Route path="absprachen" element={<TreffAbsprachenTab treff={d} rolle={rolle} />} />}
        {tabs.some((x) => x.pfad === 'team') && <Route path="team" element={<TreffTeamTab treff={d} rolle={rolle} />} />}
        {tabs.some((x) => x.pfad === 'verwaltung') && <Route path="verwaltung" element={<VerwaltungTab treff={d} rolle={rolle} />} />}
        <Route path="*" element={<Navigate to={`/treffs/${id}`} replace />} />
      </Routes>
    </>
  );
}
