import { useLaden } from '../../lib/laden';
import { holeLieferungen, holeMaterial, holeSonderkost, holeVerpflegung, type FreizeitDetailDaten, type LieferungZeile, type VerpflegungZeile } from '../../freizeiten/api';
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
      {/* Küchenteam: die Datenbank liefert die Verpflegung nur ihm, für andere TeamerInnen bleibt die Karte weg */}
      {rolle === 'teamer' && <VerpflegungKarte freizeit={f} nurWennVorhanden />}
      {rolle === 'teamer' && <LieferungenKarte freizeit={f} nurWennVorhanden />}
    </div>
  );
}

/** Gerichte eines Tags als kurzer Text (vegetarisch / Mischkost / Dessert). */
function gerichteText(v: VerpflegungZeile): string {
  return [v.menue_vegetarisch && `veg.: ${v.menue_vegetarisch}`, v.menue_mischkost && `Mischkost: ${v.menue_mischkost}`, v.dessert && `Dessert: ${v.dessert}`]
    .filter(Boolean).join(' · ');
}

/**
 * Essenszahlen, Gerichte und Sonderkost aus KiJuKo. Lesen dürfen Leitung, Koordination und das Küchenteam (Datenbankregel);
 * für alle anderen liefert die Datenbank nichts – mit `nurWennVorhanden` erscheint die Karte dann gar nicht.
 */
function VerpflegungKarte({ freizeit: f, nurWennVorhanden = false }: { freizeit: FreizeitDetailDaten; nurWennVorhanden?: boolean }) {
  const verpflegung = useLaden(() => holeVerpflegung(f.id), `verpflegung-${f.id}`);
  const sonderkost = useLaden(() => holeSonderkost(f.id), `sonderkost-${f.id}`);
  const gesamt = verpflegung.daten?.find((v) => v.datum === null);
  const tage = (verpflegung.daten ?? []).filter((v) => v.datum !== null);
  const sorten = sonderkost.daten ?? [];
  const mitGerichten = tage.some((v) => gerichteText(v));
  const leer = !gesamt && tage.length === 0 && sorten.length === 0;
  if (nurWennVorhanden && (leer || verpflegung.fehler)) return null;

  return (
    <Card>
      <h2>Verpflegung</h2>
      {verpflegung.fehler && <Alert ton="error">{verpflegung.fehler}</Alert>}
      {!verpflegung.fehler && leer && <p>Für diese Freizeit liegen keine Verpflegungszahlen vor.</p>}
      {gesamt && (
        <p><strong>Gesamt:</strong> {gesamt.mischkost} Mischkost · {gesamt.vegetarisch} vegetarisch · {gesamt.allergiker} Allergiker</p>
      )}
      {sorten.length > 0 && (
        <p><strong>Sonderkost:</strong> {sorten.map((s) => `${s.anzahl}× ${s.text}`).join(', ')}</p>
      )}
      {tage.length > 0 && (
        <div className="tabelle-wrap">
          <table className="tabelle">
            <caption className="sr-only">Essen pro Tag</caption>
            <thead>
              <tr>
                <th scope="col">Tag</th><th scope="col">Misch&shy;kost</th><th scope="col">Vegetarisch</th><th scope="col">Allergiker</th>
                {mitGerichten && <th scope="col">Gerichte</th>}
              </tr>
            </thead>
            <tbody>
              {tage.map((v) => (
                <tr key={v.datum}>
                  <th scope="row">{formatKurz(v.datum!)}</th><td>{v.mischkost}</td><td>{v.vegetarisch}</td><td>{v.allergiker}</td>
                  {mitGerichten && <td>{gerichteText(v) || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="field__hint">Aus KiJuKo übernommen – Änderungen bitte dort vornehmen.</p>
    </Card>
  );
}

const LIEFERART: { art: LieferungZeile['art']; titel: string }[] = [
  { art: 'lebensmittel', titel: 'Lebensmittel' }, { art: 'material', titel: 'Material' }, { art: 'ausstattung', titel: 'Ausstattung' },
];

/** Was die Koordination zur Freizeit bringt (aus KiJuKo). Lesen dürfen Leitung, Koordination und Küchenteam. */
function LieferungenKarte({ freizeit: f, nurWennVorhanden = false }: { freizeit: FreizeitDetailDaten; nurWennVorhanden?: boolean }) {
  const lieferungen = useLaden(() => holeLieferungen(f.id), `lieferungen-${f.id}`);
  const liste = lieferungen.daten ?? [];
  if (nurWennVorhanden && (liste.length === 0 || lieferungen.fehler)) return null;
  return (
    <Card>
      <h2>Lieferungen</h2>
      {lieferungen.fehler && <Alert ton="error">{lieferungen.fehler}</Alert>}
      {!lieferungen.fehler && liste.length === 0 && <p>Für diese Freizeit sind noch keine Lieferungen eingetragen.</p>}
      {LIEFERART.map(({ art, titel }) => {
        const teil = liste.filter((l) => l.art === art);
        if (!teil.length) return null;
        return (
          <section key={art}>
            <h3>{titel}</h3>
            <ul className="list" aria-label={`Lieferungen ${titel}`}>
              {teil.map((l) => (
                <li key={l.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{l.bezeichnung}</div>
                    {(l.datum || l.notiz) && <div className="list__meta">{[l.datum && formatKurz(l.datum), l.notiz].filter(Boolean).join(' · ')}</div>}
                  </div>
                  <span>{l.menge} {l.einheit ?? ''}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {liste.some((l) => l.art === 'lebensmittel') && (
        <p className="field__hint">Die Lebensmittel stehen auch im Reiter „Lebensmittel“ im Bestand am Ort – dort nur noch den Verbrauch eintragen.</p>
      )}
      <p className="field__hint">Aus KiJuKo übernommen – Änderungen bitte dort vornehmen.</p>
    </Card>
  );
}

function KijukoDaten({ freizeit: f }: { freizeit: FreizeitDetailDaten }) {
  const material = useLaden(() => holeMaterial(f.id), `material-${f.id}`);

  return (
    <>
      <VerpflegungKarte freizeit={f} />
      <LieferungenKarte freizeit={f} />
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
