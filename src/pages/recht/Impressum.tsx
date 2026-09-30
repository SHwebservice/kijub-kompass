import { FACHSTELLE, LINKS, TRAEGER } from './angaben';
import { RechtSeite } from './RechtSeite';

const Adresse = ({ zeilen }: { zeilen: readonly string[] }) => <address>{zeilen.map((z) => <span key={z}>{z}<br /></span>)}</address>;

export function Impressum() {
  return (
    <RechtSeite titel="Impressum">
      <h2>Angaben gemäß DDG</h2>
      <p><strong>{TRAEGER.name}</strong><br />{TRAEGER.rechtsform}<br />{TRAEGER.vertretung}</p>
      <Adresse zeilen={TRAEGER.adresse} />
      <p>{TRAEGER.telefon}<br />{TRAEGER.fax}<br />E-Mail: <a href={`mailto:${TRAEGER.mail}`}>{TRAEGER.mail}</a><br />
        Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {TRAEGER.ustId}</p>

      <h2>Zuständige Fachstelle für diese Anwendung</h2>
      <p><strong>{FACHSTELLE.name}</strong><br />{FACHSTELLE.traeger}</p>
      <Adresse zeilen={FACHSTELLE.adresse} />
      <p>Telefon: {FACHSTELLE.telefon}<br />E-Mail: <a href={`mailto:${FACHSTELLE.mail}`}>{FACHSTELLE.mail}</a></p>

      <h2>Haftung für Inhalte</h2>
      <p>Die Inhalte dieser Anwendung wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte kann jedoch keine Gewähr übernommen werden.</p>

      <h2>Weiterführende Informationen</h2>
      <p>
        <a href={LINKS.impressumStadt} target="_blank" rel="noopener noreferrer">Vollständiges Impressum der Stadt Frankenthal (Pfalz)</a><br />
        <a href={LINKS.datenschutzStadt} target="_blank" rel="noopener noreferrer">Datenschutzerklärung der Stadt Frankenthal (Pfalz)</a>
      </p>
    </RechtSeite>
  );
}
