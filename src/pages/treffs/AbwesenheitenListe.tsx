import { useState } from 'react';
import { useLaden } from '../../lib/laden';
import { formatDatum } from '../../freizeiten/logik';
import { listeAbwesenheiten, type TreffTeamMitglied } from '../../treffs/api';
import { abwesenheitenJePerson, type Block } from '../../treffs/abwesenheit';
import { addTage, ABWESENHEIT_TEXT } from '../../treffs/dienstplan';
import { Alert, Badge, Button, Spinner } from '../../components/ui';
import { AbwesenheitSheet, type AbwesenheitErgebnis } from './AbwesenheitSheet';

const zeitraum = (von: string, bis: string) => (von === bis ? formatDatum(von) : `${formatDatum(von)} – ${formatDatum(bis)}`);
const TON = { urlaub: 'neutral', krank: 'danger', sonstiges: 'accent', verhindert: 'neutral' } as const;

interface Props {
  treffId: string;
  team: TreffTeamMitglied[];
  heute: string;
  /** Nach dem Speichern (z. B. Dienstplan neu laden, Ersatz-Hinweis zeigen). */
  geaendert?: (e: AbwesenheitErgebnis) => void;
  /** Statt eines eigenen Fensters: das Bearbeiten-Fenster vom Aufrufer öffnen lassen (z. B. wenn die Liste selbst in einem Fenster steht). */
  oeffnen?: (block: Block | null) => void;
}

/**
 * Abwesenheiten des Teams je Person: laufende und kommende sichtbar, vergangene (60 Tage) eingeklappt.
 * Jeder Eintrag lässt sich antippen und ändern; „+ Abwesenheit eintragen“ öffnet dasselbe Fenster.
 */
export function AbwesenheitenListe({ treffId, team, heute, geaendert, oeffnen }: Props) {
  const liste = useLaden(() => listeAbwesenheiten(addTage(heute, -60), addTage(heute, 366)), `abw-liste-${treffId}-${heute}`);
  const [offen, setOffen] = useState<{ block: Block | null } | null>(null);
  const [vergangeneZeigen, setVergangeneZeigen] = useState(false);
  const personen = abwesenheitenJePerson(liste.daten ?? [], team, heute);
  const aktuell = personen.filter((p) => p.laufend.length + p.kommend.length > 0);
  const mitVergangenen = personen.filter((p) => p.vergangen.length > 0);

  const eintrag = (b: Block, name: string) => (
    <li key={`${b.typ}-${b.von}`} className="list__item list__item--klickbar">
      <div className="list__main">
        <button type="button" className="list__title linklike" aria-label={`Abwesenheit von ${name} (${zeitraum(b.von, b.bis)}) ändern`} onClick={() => (oeffnen ? oeffnen(b) : setOffen({ block: b }))}>
          {zeitraum(b.von, b.bis)}
        </button>
        <div className="list__meta">
          <Badge ton={TON[b.typ]}>{b.typ === 'krank' ? 'Krank' : ABWESENHEIT_TEXT[b.typ]}</Badge>
          {b.notiz && <span>{b.notiz}</span>}
          {b.von <= heute && heute <= b.bis && <Badge ton="warning">läuft</Badge>}
        </div>
      </div>
      <span className="field__hint" aria-hidden="true">ändern ›</span>
    </li>
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
      <p><Button variante="primary" onClick={() => (oeffnen ? oeffnen(null) : setOffen({ block: null }))}>+ Abwesenheit eintragen</Button></p>
      {liste.laedt && <Spinner />}
      {!liste.laedt && aktuell.length === 0 && <p>Keine laufenden oder kommenden Abwesenheiten.</p>}
      {aktuell.map((p) => (
        <section key={p.person_id} aria-label={`Abwesenheiten von ${p.name}`}>
          <h3 className="abw__name">{p.name}</h3>
          <ul className="list">{[...p.laufend, ...p.kommend].map((b) => eintrag(b, p.name))}</ul>
        </section>
      ))}
      {mitVergangenen.length > 0 && (
        <div>
          <Button klein variante="ghost" aria-expanded={vergangeneZeigen} onClick={() => setVergangeneZeigen(!vergangeneZeigen)}>
            {vergangeneZeigen ? 'Vergangene ausblenden' : 'Vergangene (60 Tage) anzeigen'}
          </Button>
          {vergangeneZeigen && mitVergangenen.map((p) => (
            <section key={p.person_id} aria-label={`Vergangene Abwesenheiten von ${p.name}`}>
              <h3 className="abw__name">{p.name}</h3>
              <ul className="list">{p.vergangen.map((b) => eintrag(b, p.name))}</ul>
            </section>
          ))}
        </div>
      )}
      {offen && (
        <AbwesenheitSheet treffId={treffId} team={team} heute={heute} block={offen.block}
          gespeichert={(e) => { liste.neuLaden(); geaendert?.(e); }} schliessen={() => setOffen(null)} />
      )}
    </div>
  );
}
