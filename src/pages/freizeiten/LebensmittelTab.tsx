import type { FreizeitDetailDaten } from '../../freizeiten/api';
import { EmptyState } from '../../components/ui';

export function LebensmittelTab(_props: { freizeit: FreizeitDetailDaten }) {
  return <EmptyState titel="Kommt im nächsten Schritt">Lebensmittel</EmptyState>;
}
