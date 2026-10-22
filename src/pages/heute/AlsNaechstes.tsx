import { Link } from 'react-router-dom';
import type { FreizeitZeile } from '../../freizeiten/api';
import { formatKurz, formatTagMonat, relativerTag, wochentagLang, zeitraumText } from '../../freizeiten/logik';
import type { MeinDienst } from '../../treffs/api';
import { dienstZeitKurz, istNeu } from '../../treffs/dienstplan';
import { Badge } from '../../components/ui';
import { DatumsKachel } from '../../components/DatumsKachel';
import { fzStreifen } from '../../components/FreizeitFarbe';

/** Der nächste Dienst groß mit Kalenderblatt und „Morgen · Donnerstag“, damit man auf einen Blick sieht, wann er ist. */
export function NaechsterDienst({ dienst, heute, letzterBesuch }: { dienst: MeinDienst; heute: string; letzterBesuch: string | null }) {
  const zeit = dienstZeitKurz(dienst);
  return (
    <Link className="naechster" to={`/treffs/${dienst.treff_id}/dienstplan?datum=${dienst.datum}`}>
      <DatumsKachel datum={dienst.datum} gross />
      <span className="naechster__inhalt">
        <span className="naechster__wann"><strong>{relativerTag(dienst.datum, heute)}</strong> · {wochentagLang(dienst.datum)}, {formatTagMonat(dienst.datum)}</span>
        {zeit && <span className="naechster__zeit">{zeit} Uhr</span>}
        <span className="naechster__ort">{dienst.treff_name}</span>
        {(dienst.ist_sonder || istNeu(dienst.eingeteilt_am, letzterBesuch)) && (
          <span className="naechster__chips">
            {dienst.ist_sonder && <Badge ton="warning">Sonderdienst: {dienst.bezeichnung}</Badge>}
            {istNeu(dienst.eingeteilt_am, letzterBesuch) && <Badge ton="accent">neu</Badge>}
          </span>
        )}
      </span>
    </Link>
  );
}

/** Die Dienste danach: je eine kompakte Zeile mit Datum, Abstand, Uhrzeit und Treff. */
export function FolgeDienste({ dienste, heute, letzterBesuch }: { dienste: MeinDienst[]; heute: string; letzterBesuch: string | null }) {
  if (dienste.length === 0) return null;
  return (
    <>
      <h3 className="naechster__danach">Danach</h3>
      <ul className="folgedienste" aria-label="Weitere Dienste">
        {dienste.map((x) => (
          <li key={x.id}>
            <Link className="folgedienst" to={`/treffs/${x.treff_id}/dienstplan?datum=${x.datum}`}>
              <span className="folgedienst__datum">{formatKurz(x.datum)}</span>
              <span className="folgedienst__abstand">{relativerTag(x.datum, heute)}</span>
              <span className="folgedienst__zeit">{dienstZeitKurz(x) ? `${dienstZeitKurz(x)} Uhr` : ''}</span>
              <span className="folgedienst__ort">
                {x.treff_name}
                {x.ist_sonder && <> <Badge ton="warning">Sonderdienst: {x.bezeichnung}</Badge></>}
                {istNeu(x.eingeteilt_am, letzterBesuch) && <> <Badge ton="accent">neu</Badge></>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Die nächste eigene Freizeit im selben Aufbau wie der nächste Dienst. */
export function NaechsteFreizeit({ freizeit, heute }: { freizeit: FreizeitZeile; heute: string }) {
  return (
    <Link className="naechster fz-streifen" style={fzStreifen(freizeit)} to={`/freizeiten/${freizeit.id}`}>
      <DatumsKachel datum={freizeit.start_datum} gross />
      <span className="naechster__inhalt">
        <span className="naechster__wann"><strong>{relativerTag(freizeit.start_datum, heute)}</strong> · {wochentagLang(freizeit.start_datum)}</span>
        <span className="naechster__zeit">{freizeit.name}</span>
        <span className="naechster__ort">{zeitraumText(freizeit.start_datum, freizeit.ende_datum)}</span>
      </span>
    </Link>
  );
}
