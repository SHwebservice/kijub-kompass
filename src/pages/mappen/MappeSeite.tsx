import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { holeMappe, schlagworteMeinerFreizeiten, speichereMappe } from '../../mappen/api';
import {
  bereinige, faqTrifft, hervorheben, iconVon, istGleich, kachelTrifft, kodexTrifft, neueKachel, ordneKacheln, validiereMappe, verschiebe,
} from '../../mappen/logik';
import { ICON_WAHL, KODEX_ICONS, MAX_KACHELN, type MappeDaten, type MappenSchluessel } from '../../mappen/standard';
import { listeTags } from '../../freizeiten/api';
import { formatDatum } from '../../freizeiten/logik';
import { Alert, Button, Card, EmptyState, PageHeader, SelectField, Spinner, TextField } from '../../components/ui';

function Text({ t, q }: { t: string; q: string }) {
  return <>{hervorheben(t, q).map((s, i) => (s.treffer ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}</>;
}

interface Props { schluessel: MappenSchluessel; titel: string; untertitel: string; mitSchlagworten: boolean }

/** Teamermappe bzw. Treffmappe: Themenkacheln, Qualitäts-Kodex, FAQ und Notfall-Box. Die Koordination bearbeitet die Inhalte. */
export function MappeSeite({ schluessel, titel, untertitel, mitSchlagworten }: Props) {
  const { ich, rollen } = useAuth();
  const mappe = useLaden(() => holeMappe(schluessel), `mappe-${schluessel}`);
  const meineIds = [...(rollen?.leitungFreizeiten ?? []), ...(rollen?.teamerFreizeiten ?? [])];
  const meineTags = useLaden(async () => (mitSchlagworten ? schlagworteMeinerFreizeiten(meineIds) : []), `mappe-tags-${schluessel}-${meineIds.join(',')}`);
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<Set<number>>(new Set());
  const [offeneFragen, setOffeneFragen] = useState<Set<number>>(new Set());
  const [entwurf, setEntwurf] = useState<MappeDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  if (!ich || !rollen) return null;

  const bearbeiten = entwurf !== null;
  const darfBearbeiten = rollen.koordination;
  const q = suche.trim();
  const daten = entwurf ?? mappe.daten?.daten;
  const umschalten = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  const aendere = (f: (d: MappeDaten) => MappeDaten) => setEntwurf((d) => (d ? f(d) : d));

  async function speichern() {
    if (!entwurf || !ich) return;
    const sauber = bereinige(entwurf);
    const problem = validiereMappe(sauber);
    if (problem) { setFehler(problem); return; }
    setArbeitet(true); setFehler(null);
    try {
      await speichereMappe(schluessel, sauber, ich.id);
      setEntwurf(null); setErfolg('Gespeichert.'); mappe.neuLaden();
    } catch (e) { setFehler(fehlerText(e, 'Die Mappe konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  function beendeBearbeiten() {
    if (mappe.daten && entwurf && !istGleich(bereinige(entwurf), bereinige(mappe.daten.daten)) && !window.confirm('Bearbeitung beenden? Ungespeicherte Änderungen werden verworfen.')) return;
    setEntwurf(null); setFehler(null);
  }

  return (
    <>
      <PageHeader titel={titel}>
        {darfBearbeiten && mappe.daten && (bearbeiten
          ? <Button onClick={beendeBearbeiten}>Bearbeiten beenden</Button>
          : <Button onClick={() => { setEntwurf(structuredClone(mappe.daten!.daten)); setErfolg(null); setSuche(''); }}>Bearbeiten</Button>)}
      </PageHeader>
      <p className="field__hint">{untertitel}</p>
      {(mappe.fehler || fehler) && <Alert ton="error">{mappe.fehler ?? fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      {mappe.laedt && <Spinner />}

      {daten && (
        <div className="stack">
          {!bearbeiten && <TextField label="In der Mappe suchen" type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Stichwort" autoComplete="off" />}

          <section aria-label="Themen" className="stack">
            {bearbeiten ? (
              <KachelEditor daten={daten} aendere={aendere} />
            ) : (
              <>
                {ordneKacheln(daten.sections, meineTags.daten ?? []).filter((x) => kachelTrifft(x.kachel, q)).map(({ kachel: k, index, zurueckgestuft }) => {
                  const aufgeklappt = q ? true : offen.has(index);
                  return (
                    <Card key={index} className={zurueckgestuft ? 'mappe__kachel mappe__kachel--gedaempft' : 'mappe__kachel'}>
                      <button type="button" className="mappe__kopf" aria-expanded={aufgeklappt} onClick={() => setOffen(umschalten(offen, index))}>
                        <span aria-hidden="true" style={{ color: iconVon(k.icon).farbe, fontSize: '1.4rem' }}>{iconVon(k.icon).emoji}</span>
                        <span className="mappe__titel"><Text t={k.title} q={q} /></span>
                        <span aria-hidden="true">{aufgeklappt ? '▲' : '▼'}</span>
                      </button>
                      <p className="field__hint"><Text t={k.desc} q={q} /></p>
                      {aufgeklappt && <ul className="mappe__punkte">{k.items.map((it, i) => <li key={i}><Text t={it} q={q} /></li>)}</ul>}
                      {zurueckgestuft && <p className="field__hint">Vermutlich nicht relevant für deine Freizeit</p>}
                    </Card>
                  );
                })}
                {daten.sections.every((k) => !kachelTrifft(k, q)) && daten.faqs.every((f) => !faqTrifft(f, q)) && daten.standards.every((s) => !kodexTrifft(s, q)) && (
                  <EmptyState icon="🔍" titel={`Keine Treffer für „${q}“`} />
                )}
              </>
            )}
          </section>

          {(!q || bearbeiten || daten.standards.some((s) => kodexTrifft(s, q))) && (
            <section aria-label="Qualitäts-Kodex">
              <h2>Qualitäts-Kodex</h2>
              {bearbeiten ? (
                <div className="stack">
                  {entwurf!.standards.map((s, i) => (
                    <Card key={i}>
                      <SelectField label="Symbol" value={s.icon} onChange={(e) => aendere((d) => ({ ...d, standards: d.standards.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) }))}>
                        {Object.entries(KODEX_ICONS).map(([id, emoji]) => <option key={id} value={id}>{emoji} {ICON_WAHL.find((w) => w.id === id)?.label ?? 'Tür'}</option>)}
                      </SelectField>
                      <TextField label="Kodex-Titel" value={s.title} maxLength={60} onChange={(e) => aendere((d) => ({ ...d, standards: d.standards.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
                      <div className="field">
                        <label className="field__label" htmlFor={`kodex-text-${i}`}>Kodex-Text</label>
                        <textarea id={`kodex-text-${i}`} className="input" rows={2} maxLength={300} value={s.text} style={{ padding: 'var(--space-3)' }}
                          onChange={(e) => aendere((d) => ({ ...d, standards: d.standards.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="mappe__kodex">
                  {daten.standards.filter((s) => kodexTrifft(s, q)).map((s, i) => (
                    <Card key={i}>
                      <div aria-hidden="true" style={{ fontSize: '1.4rem' }}>{KODEX_ICONS[s.icon] ?? '❤️'}</div>
                      <h3><Text t={s.title} q={q} /></h3>
                      <p><Text t={s.text} q={q} /></p>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}

          {(bearbeiten || !q || daten.faqs.some((f) => faqTrifft(f, q))) && (
            <section aria-label="Häufige Fragen">
              <h2>Häufige Fragen</h2>
              {bearbeiten ? (
                <div className="stack">
                  {entwurf!.faqs.map((f, i) => (
                    <Card key={i}>
                      <TextField label="Frage" value={f.q} maxLength={150} onChange={(e) => aendere((d) => ({ ...d, faqs: d.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) }))} />
                      <div className="field">
                        <label className="field__label" htmlFor={`faq-a-${i}`}>Antwort</label>
                        <textarea id={`faq-a-${i}`} className="input" rows={3} maxLength={800} value={f.a} style={{ padding: 'var(--space-3)' }}
                          onChange={(e) => aendere((d) => ({ ...d, faqs: d.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) }))} />
                      </div>
                      <div className="row">
                        <Button klein disabled={i === 0} aria-label={`Frage ${i + 1} nach oben`} onClick={() => aendere((d) => ({ ...d, faqs: verschiebe(d.faqs, i, -1) }))}>↑</Button>
                        <Button klein disabled={i === entwurf!.faqs.length - 1} aria-label={`Frage ${i + 1} nach unten`} onClick={() => aendere((d) => ({ ...d, faqs: verschiebe(d.faqs, i, 1) }))}>↓</Button>
                        <Button klein variante="danger" aria-label={`Frage ${i + 1} löschen`} onClick={() => aendere((d) => ({ ...d, faqs: d.faqs.filter((_, j) => j !== i) }))}>Löschen</Button>
                      </div>
                    </Card>
                  ))}
                  <p><Button onClick={() => aendere((d) => ({ ...d, faqs: [...d.faqs, { q: '', a: '' }] }))}>+ Frage hinzufügen</Button></p>
                </div>
              ) : (
                <ul className="list">
                  {daten.faqs.map((f, i) => ({ f, i })).filter(({ f }) => faqTrifft(f, q)).map(({ f, i }) => {
                    const aufgeklappt = q ? true : offeneFragen.has(i);
                    return (
                      <li key={i} className="list__item" style={{ display: 'block' }}>
                        <button type="button" className="mappe__kopf" aria-expanded={aufgeklappt} onClick={() => setOffeneFragen(umschalten(offeneFragen, i))}>
                          <span className="mappe__titel"><Text t={f.q} q={q} /></span>
                          <span aria-hidden="true">{aufgeklappt ? '−' : '+'}</span>
                        </button>
                        {aufgeklappt && <p><Text t={f.a} q={q} /></p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section aria-label="Notfall-Management">
            <Card className="gefahr">
              <h2>Notfall-Management</h2>
              {bearbeiten ? (
                <div className="field">
                  <label className="field__label" htmlFor="notfall-text">Notfalltext</label>
                  <textarea id="notfall-text" className="input" rows={4} maxLength={500} value={entwurf!.emergencyText} style={{ padding: 'var(--space-3)' }}
                    onChange={(e) => aendere((d) => ({ ...d, emergencyText: e.target.value }))} />
                </div>
              ) : <p style={{ whiteSpace: 'pre-line' }}><Text t={daten.emergencyText} q={q} /></p>}
            </Card>
          </section>

          {bearbeiten && (
            <div className="row">
              <Button variante="primary" laedt={arbeitet} onClick={() => void speichern()}>Speichern</Button>
              <Button disabled={arbeitet} onClick={beendeBearbeiten}>Abbrechen</Button>
            </div>
          )}
          {!bearbeiten && mappe.daten?.aktualisiert && (
            <p className="field__hint">Zuletzt aktualisiert am {formatDatum(mappe.daten.aktualisiert.slice(0, 10))}.</p>
          )}
          {!bearbeiten && schluessel === 'teamermappe' && (
            <p><Link to="/formulare">Zu den Formularen →</Link></p>
          )}
        </div>
      )}
    </>
  );
}

function KachelEditor({ daten, aendere }: { daten: MappeDaten; aendere: (f: (d: MappeDaten) => MappeDaten) => void }) {
  const tags = useLaden(listeTags, 'mappe-alle-tags');
  const setze = (i: number, teil: Partial<MappeDaten['sections'][number]>) => aendere((d) => ({ ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, ...teil } : s)) }));
  return (
    <>
      {daten.sections.map((s, i) => (
        <Card key={i}>
          <h3>Kachel {i + 1}</h3>
          <SelectField label="Symbol" value={s.icon} onChange={(e) => setze(i, { icon: e.target.value })}>
            {ICON_WAHL.map((w) => <option key={w.id} value={w.id}>{w.emoji} {w.label}</option>)}
          </SelectField>
          <TextField label="Titel" value={s.title} maxLength={60} onChange={(e) => setze(i, { title: e.target.value })} />
          <div className="field">
            <label className="field__label" htmlFor={`kachel-desc-${i}`}>Beschreibung</label>
            <textarea id={`kachel-desc-${i}`} className="input" rows={2} maxLength={300} value={s.desc} style={{ padding: 'var(--space-3)' }} onChange={(e) => setze(i, { desc: e.target.value })} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`kachel-items-${i}`}>Punkte (eine Zeile je Punkt)</label>
            <textarea id={`kachel-items-${i}`} className="input" rows={5} value={s.items.join('\n')} style={{ padding: 'var(--space-3)' }}
              onChange={(e) => setze(i, { items: e.target.value.split('\n') })} />
          </div>
          {(tags.daten?.length ?? 0) > 0 && (
            <fieldset className="optionen">
              <legend className="field__label">Nur relevant für Freizeiten mit Schlagwort (leer = für alle)</legend>
              {tags.daten!.map((t) => (
                <label key={t} className="option">
                  <input type="checkbox" checked={s.tags.includes(t)} onChange={(e) => setze(i, { tags: e.target.checked ? [...s.tags, t] : s.tags.filter((x) => x !== t) })} />
                  <span>{t}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="row">
            <Button klein disabled={i === 0} aria-label={`Kachel ${i + 1} nach oben`} onClick={() => aendere((d) => ({ ...d, sections: verschiebe(d.sections, i, -1) }))}>↑</Button>
            <Button klein disabled={i === daten.sections.length - 1} aria-label={`Kachel ${i + 1} nach unten`} onClick={() => aendere((d) => ({ ...d, sections: verschiebe(d.sections, i, 1) }))}>↓</Button>
            <Button klein variante="danger" aria-label={`Kachel ${i + 1} entfernen`} onClick={() => aendere((d) => ({ ...d, sections: d.sections.filter((_, j) => j !== i) }))}>Entfernen</Button>
          </div>
        </Card>
      ))}
      <p>
        <Button disabled={daten.sections.length >= MAX_KACHELN} onClick={() => aendere((d) => ({ ...d, sections: [...d.sections, neueKachel(d.sections.length)] }))}>+ Kachel hinzufügen</Button>
        {daten.sections.length >= MAX_KACHELN && <span className="field__hint"> Höchstens {MAX_KACHELN} Kacheln.</span>}
      </p>
    </>
  );
}
