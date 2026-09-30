import type { FreizeitDetailDaten } from '../../freizeiten/api';
import type { RolleInFreizeit } from '../../lib/rollen';
import { EmptyState } from '../../components/ui';

export function HinweiseTab(_props: { freizeit: FreizeitDetailDaten; rolle: RolleInFreizeit }) {
  return <EmptyState titel="Kommt im nächsten Schritt">Hinweise</EmptyState>;
}
