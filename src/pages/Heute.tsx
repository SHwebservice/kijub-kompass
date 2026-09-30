import { Card, EmptyState, PageHeader, Badge } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { rollenBezeichnungen } from '../lib/rollen';

/** Startseite. In Phase 3 füllt sie sich rollenabhängig (siehe docs/FEATURES.md, „Startseite Heute"). */
export function Heute() {
  const { ich, rollen } = useAuth();
  if (!ich || !rollen) return null;
  const bezeichnungen = rollenBezeichnungen(rollen);
  return (
    <>
      <PageHeader titel={`Hallo ${ich.vorname}`} />
      <Card>
        <p className="row" style={{ marginBottom: 0 }}>
          {bezeichnungen.length > 0
            ? bezeichnungen.map((b) => <Badge key={b} ton="accent">{b}</Badge>)
            : <Badge>Keine Zuordnung</Badge>}
          <Badge>{ich.kategorie}</Badge>
        </p>
      </Card>
      <EmptyState icon="🧭" titel="Hier erscheint bald dein Überblick">
        Laufende Freizeiten, Dienste, neue Hinweise und Absprachen – passend zu deiner Rolle.
      </EmptyState>
    </>
  );
}

export function Platzhalter({ titel, text }: { titel: string; text: string }) {
  return (
    <>
      <PageHeader titel={titel} />
      <EmptyState titel="Kommt in Kürze">{text}</EmptyState>
    </>
  );
}
