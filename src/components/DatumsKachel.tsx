import { formatMonatKurz } from '../freizeiten/logik';

/** Kalenderblatt mit großer Tageszahl und Monat („23 / Okt“). Rein zur Orientierung; der Text daneben nennt das Datum für Hilfsmittel. */
export function DatumsKachel({ datum, gross = false }: { datum: string; gross?: boolean }) {
  return (
    <span className={`datumskachel${gross ? ' datumskachel--gross' : ''}`} aria-hidden="true">
      <span className="datumskachel__tag">{Number(datum.slice(8, 10))}</span>
      <span className="datumskachel__monat">{formatMonatKurz(datum)}</span>
    </span>
  );
}
