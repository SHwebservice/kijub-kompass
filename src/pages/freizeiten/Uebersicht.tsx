import { useLaden } from '../../lib/laden';
import { holeMaterial, holeVerpflegung, type FreizeitDetailDaten } from '../../freizeiten/api';
import { formatDatum, formatKurz, tageVonBis } from '../../freizeiten/logik';
import { istLeitungOderKoordination, type RolleInFreizeit } from '../../lib/rollen';
import { Alert, Badge, Card } from '../../components/ui';

function Zeile({ label, wert }: { label: string; wert: React.ReactNode }) {
  if (wert === null || wert === undefined || wert === '') return null;
  return (<><dt>{label}</dt><dd>{wert}</dd></>);
}

/** Stammdaten der Freizeit; für Leitung und Koordination zusätzlich Verpflegung und Material aus KiJuKo. */
export function Uebersicht({ freizeit: f, rolle }: { freizeit: FreizeitDetailDaten; rolle: RolleInFreizeit }) {
  const leitung = istLeitungOderKoordination(rolle);
  const alter = f.alter_von && f.alter_bis ? `${f.alter_von}–${f.alter_bis} Jahre` : f.alter_von ? `ab ${f.alter_von} Jahren` : f.alter_bis ? `bis ${f.alter_bis} Jahre` : '';
  const arbeitszeit = f.arbeitsbeginn || f.arbeitsende ? `${f.arbeitsbeginn ?? '?'} – ${f.arbeitsende ?? '?'} Uhr` : '';
  const tage = tageVonBis(f.start_datum, f.ende_datum).length;

  return (
    <div className="stack">
      <Card>
        <h2>Stammdaten</h2>
        <dl className="daten">
          <Zeile label="Zeitraum" wert={`${formatDatum(f.start_datum)} – ${formatDatum(f.ende_datum)} (${tage} ${tage === 1 ? 'Tag' : 'Tage'})`} />
          <Zeile label="Ort" wert={f.ort_name} />
          <Zeile label="Adresse" wert={f.ort_adresse ?? f.adresse_abw} />
          <Zeile label="Arbeitszeit" wert={arbeitszeit} />
          <Zeile label="Alter der Kinder" wert={alter} />
          <Zeile label="Max. Teilnehmende" wert={f.max_teilnehmende} />
          <Zeile label="Schlagworte" wert={f.tags.length ? <span className="row" style={{ gap: 'var(--space-2)' }}>{f.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : ''} />
        </dl>
      </Card>
      {leitung && <KijukoDaten freizeit={f} />}
    </div>
  );
}

function KijukoDaten({ freizeit: f }: { freizeit: FreizeitDetailDaten }) {
  const verpflegung = useLaden(() => holeVerpflegung(f.id), `verpflegung-${f.id}`);
  const material = useLaden(() => holeMaterial(f.id), `material-${f.id}`);
  const gesamt = verpflegung.daten?.find((v) => v.datum === null);
  const tage = (verpflegung.daten ?? []).filter((v) => v.datum !== null);

  return (
    <>
      <Card>
        <h2>Verpflegung</h2>
        {verpflegung.fehler && <Alert ton="error">{verpflegung.fehler}</Alert>}
        {!verpflegung.fehler && !gesamt && tage.length === 0 && <p>Für diese Freizeit liegen keine Verpflegungszahlen vor.</p>}
        {gesamt && (
          <p><strong>Gesamt:</strong> {gesamt.mischkost} Mischkost · {gesamt.vegetarisch} vegetarisch · {gesamt.allergiker} Allergiker</p>
        )}
        {tage.length > 0 && (
          <div className="tabelle-wrap">
            <table className="tabelle">
              <caption className="sr-only">Essen pro Tag</caption>
              <thead><tr><th scope="col">Tag</th><th scope="col">Misch&shy;kost</th><th scope="col">Vegetarisch</th><th scope="col">Allergiker</th></tr></thead>
              <tbody>
                {tage.map((v) => (
                  <tr key={v.datum}><th scope="row">{formatKurz(v.datum!)}</th><td>{v.mischkost}</td><td>{v.vegetarisch}</td><td>{v.allergiker}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field__hint">Aus KiJuKo übernommen – Änderungen bitte dort vornehmen.</p>
      </Card>
      <Card>
        <h2>Materialbedarf</h2>
        {material.fehler && <Alert ton="error">{material.fehler}</Alert>}
        {!material.fehler && material.daten?.length === 0 && <p>Für diese Freizeit liegt kein Materialbedarf vor.</p>}
        {(material.daten?.length ?? 0) > 0 && (
          <ul className="list">
            {material.daten!.map((m) => (
              <li key={m.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">{m.name}</div>
                  {m.notiz && <div className="list__meta">{m.notiz}</div>}
                </div>
                <span>{m.menge ?? ''} {m.einheit ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="field__hint">Aus KiJuKo übernommen – Änderungen bitte dort vornehmen.</p>
      </Card>
    </>
  );
}
