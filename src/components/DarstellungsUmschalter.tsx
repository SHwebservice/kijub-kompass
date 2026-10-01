import { useDarstellung, type Darstellung } from '../theme/darstellung';

const WAHL: { wert: Darstellung; label: string }[] = [
  { wert: 'system', label: 'Wie Gerät' },
  { wert: 'hell', label: 'Hell' },
  { wert: 'dunkel', label: 'Dunkel' },
];

/** Drei Knöpfe für „Mehr“: dem Gerät folgen, immer hell, immer dunkel. */
export function DarstellungsUmschalter() {
  const { wahl, setze } = useDarstellung();
  return (
    <div className="darstellung" role="group" aria-label="Darstellung">
      {WAHL.map((w) => (
        <button key={w.wert} type="button" className="darstellung__knopf" aria-pressed={wahl === w.wert} onClick={() => setze(w.wert)}>{w.label}</button>
      ))}
    </div>
  );
}

/** Schneller Wechsel im Kopf: zeigt, wohin umgeschaltet wird (Sonne im Dunkeln, Mond im Hellen). */
export function DarstellungsKnopf() {
  const { dunkel, setze } = useDarstellung();
  return (
    <button type="button" className="icon-knopf" onClick={() => setze(dunkel ? 'hell' : 'dunkel')}
      aria-label={dunkel ? 'Helle Darstellung einschalten' : 'Dunkle Darstellung einschalten'}>
      <span aria-hidden="true">{dunkel ? '☀️' : '🌙'}</span>
    </button>
  );
}
