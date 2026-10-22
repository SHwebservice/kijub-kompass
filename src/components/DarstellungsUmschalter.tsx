import { useDarstellung, type Darstellung } from '../theme/darstellung';

const STUFEN: Record<Darstellung, { label: string; icon: string; naechste: Darstellung }> = {
  system: { label: 'Wie Gerät', icon: '🌗', naechste: 'hell' },
  hell: { label: 'Hell', icon: '☀️', naechste: 'dunkel' },
  dunkel: { label: 'Dunkel', icon: '🌙', naechste: 'system' },
};

/** Der einzige Schalter für die Darstellung, im Kopf: wechselt reihum „Wie Gerät“ → „Hell“ → „Dunkel“ und zeigt die aktuelle Wahl. */
export function DarstellungsKnopf() {
  const { wahl, setze } = useDarstellung();
  const s = STUFEN[wahl];
  const text = `Darstellung: ${s.label}. Wechseln zu ${STUFEN[s.naechste].label}`;
  return (
    <button type="button" className="icon-knopf" onClick={() => setze(s.naechste)} aria-label={text} title={text}>
      <span aria-hidden="true">{s.icon}</span>
    </button>
  );
}
