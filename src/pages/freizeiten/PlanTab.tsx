import type { FreizeitDetailDaten } from '../../freizeiten/api';
import type { RolleInFreizeit } from '../../lib/rollen';
import { EmptyState } from '../../components/ui';

export function PlanTab(_props: { freizeit: FreizeitDetailDaten; rolle: RolleInFreizeit }) {
  return <EmptyState titel="Kommt im nächsten Schritt">Wochenplan</EmptyState>;
}
