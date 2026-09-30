import { kategorieLabel } from '../../katalog/kategorien';
import { alterText, WETTER_LABEL, type Angebot } from '../../katalog/logik';

function Zeile({ label, wert }: { label: string; wert: string }) {
  return wert ? <p><strong>{label}:</strong> <span style={{ whiteSpace: 'pre-line' }}>{wert}</span></p> : null;
}

/** Druckvorlage (A4) für einen oder mehrere Programmpunkte – nur beim Drucken sichtbar. */
export function KatalogDruck({ angebote }: { angebote: Angebot[] }) {
  return (
    <div className="katalog-druck" aria-hidden="true">
      {angebote.map((a) => (
        <article key={a.id}>
          <h1>{a.name}</h1>
          <p>{kategorieLabel(a.kategorie)}</p>
          <Zeile label="Dauer" wert={a.dauer} />
          <Zeile label="Gruppengröße" wert={a.gruppe} />
          <Zeile label="Alter" wert={a.alter_gruppen.map(alterText).join(', ')} />
          <Zeile label="Personalbedarf" wert={a.personal} />
          <Zeile label="Wetter" wert={a.wetter ? WETTER_LABEL[a.wetter] : ''} />
          <Zeile label="Raum" wert={a.raum} />
          <Zeile label="Material" wert={a.material} />
          <Zeile label="Vorbereitung" wert={a.vorbereitung} />
          <Zeile label="Umsetzung" wert={a.umsetzung} />
          <Zeile label="Nachbereitung" wert={a.nachbereitung} />
          <Zeile label="Autor/in" wert={a.autor} />
        </article>
      ))}
    </div>
  );
}
