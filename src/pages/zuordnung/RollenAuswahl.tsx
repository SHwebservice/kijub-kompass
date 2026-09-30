interface Props<R extends string> {
  /** Barrierefreie Beschriftung, z. B. „Anna Adler: Sommer 1“. */
  label: string;
  wert: R | null;
  optionen: { wert: R; label: string }[];
  aendere: (r: R | null) => void;
  disabled?: boolean;
  /** Erklärung beim Darüberfahren (z. B. warum das Feld gesperrt ist oder wo eine Überschneidung besteht). */
  titel?: string;
  warnung?: boolean;
}

/** Kleine Auswahl „– / Rolle“ für eine Zuordnung. „–“ bedeutet: nicht zugeordnet. */
export function RollenAuswahl<R extends string>({ label, wert, optionen, aendere, disabled, titel, warnung }: Props<R>) {
  const klassen = ['input', 'zuordnung__auswahl', wert && 'zuordnung__auswahl--belegt', warnung && 'zuordnung__auswahl--warnung'].filter(Boolean).join(' ');
  return (
    <select aria-label={label} title={titel} className={klassen} value={wert ?? ''} disabled={disabled}
      onChange={(e) => aendere((e.target.value || null) as R | null)}>
      <option value="">–</option>
      {optionen.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
    </select>
  );
}
