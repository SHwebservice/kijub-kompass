import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import type { Geladen } from '../../lib/laden';
import { gruppiereOffene, offeneFuerMich, personenText, type OffeneNotiz } from '../../heute/logik';
import { Alert, Badge, Card } from '../../components/ui';

interface Props { heute: string; notizen: Geladen<OffeneNotiz[]> }

/** „Das wartet auf dich“: Hinweise zum Bestätigen („gesehen“) und Absprachen, die noch nicht bestätigt sind – je Freizeit bzw. Treff. */
export function WartetAufDich({ heute, notizen }: Props) {
  const { ich, rollen } = useAuth();
  if (!ich || !rollen) return null;

  const offen = offeneFuerMich(notizen.daten ?? [], ich.id, rollen, heute);
  const gruppen = gruppiereOffene(offen);
  if (!notizen.fehler && gruppen.length === 0) return null;

  return (
    <Card>
      <h2>Das wartet auf dich</h2>
      {notizen.fehler && <Alert ton="error">{notizen.fehler}</Alert>}
      <ul className="list" aria-label="Offene Hinweise und Absprachen">
        {gruppen.map((g) => (
          <li key={g.schluessel} className="list__item">
            <div className="list__main">
              <Link className="list__title" to={g.typ === 'treff' ? `/treffs/${g.id}/absprachen` : `/freizeiten/${g.id}/hinweise`}>{g.name}</Link>
              <div className="list__meta">
                {g.hinweise > 0 && <span>{personenText(g.hinweise, 'Hinweis', 'Hinweise')} zum Bestätigen</span>}
                {g.absprachen > 0 && <span>{personenText(g.absprachen, 'Absprache', 'Absprachen')} zum Bestätigen</span>}
              </div>
            </div>
            <Badge ton="warning">{g.anzahl}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
