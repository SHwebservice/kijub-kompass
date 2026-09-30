import { KATEGORIEN_ANGEBOT, type AngebotKategorie } from '../../katalog/kategorien';
import { ALTER_GRUPPEN, alterText, WETTER_LABEL, type AngebotFormular, type Wetter } from '../../katalog/logik';
import { SelectField, TextField } from '../../components/ui';

interface Props {
  wert: AngebotFormular;
  aendere: (neu: AngebotFormular) => void;
  fehler?: { name?: string; kategorie?: string; lang?: string };
}

function Mehrzeilig({ label, wert, aendere, zeilen = 3 }: { label: string; wert: string; aendere: (v: string) => void; zeilen?: number }) {
  return (
    <div className="field">
      <label className="field__label">{label}
        <textarea className="input" rows={zeilen} value={wert} style={{ padding: 'var(--space-3)' }} onChange={(e) => aendere(e.target.value)} />
      </label>
    </div>
  );
}

/** Eingabefelder eines Programmpunkts (für Anlegen, Bearbeiten, Vorschlagen und Korrigieren von Vorschlägen). */
export function AngebotFelder({ wert: w, aendere, fehler = {} }: Props) {
  const set = <K extends keyof AngebotFormular>(k: K, v: AngebotFormular[K]) => aendere({ ...w, [k]: v });
  return (
    <>
      <TextField label="Name" value={w.name} onChange={(e) => set('name', e.target.value)} fehler={fehler.name} maxLength={120} required />
      <SelectField label="Kategorie" value={w.kategorie} onChange={(e) => set('kategorie', e.target.value as AngebotKategorie)} fehler={fehler.kategorie}>
        {KATEGORIEN_ANGEBOT.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
      </SelectField>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 140px' }}><TextField label="Dauer" value={w.dauer} onChange={(e) => set('dauer', e.target.value)} placeholder="z. B. 30 Min." maxLength={60} /></div>
        <div style={{ flex: '1 1 140px' }}><TextField label="Gruppengröße" value={w.gruppe} onChange={(e) => set('gruppe', e.target.value)} placeholder="z. B. 8–12 Kinder" maxLength={60} /></div>
        <div style={{ flex: '1 1 140px' }}><TextField label="Personalbedarf" value={w.personal} onChange={(e) => set('personal', e.target.value)} placeholder="z. B. 2 Teamer" maxLength={60} /></div>
      </div>
      <fieldset className="optionen">
        <legend className="field__label">Alter</legend>
        {ALTER_GRUPPEN.map((g) => (
          <label key={g} className="option">
            <input type="checkbox" checked={w.alter_gruppen.includes(g)} onChange={(e) => set('alter_gruppen', e.target.checked ? [...w.alter_gruppen, g] : w.alter_gruppen.filter((x) => x !== g))} />
            <span>{alterText(g)} Jahre</span>
          </label>
        ))}
      </fieldset>
      <SelectField label="Wetter" value={w.wetter} onChange={(e) => set('wetter', e.target.value as Wetter | '')}>
        <option value="">– egal / nicht angegeben –</option>
        {(Object.keys(WETTER_LABEL) as Wetter[]).map((k) => <option key={k} value={k}>{WETTER_LABEL[k]}</option>)}
      </SelectField>
      <TextField label="Raum" value={w.raum} onChange={(e) => set('raum', e.target.value)} placeholder="z. B. Halle, Wiese" maxLength={120} />
      <Mehrzeilig label="Material" wert={w.material} aendere={(v) => set('material', v)} />
      <Mehrzeilig label="Vorbereitung" wert={w.vorbereitung} aendere={(v) => set('vorbereitung', v)} />
      <Mehrzeilig label="Umsetzung" zeilen={5} wert={w.umsetzung} aendere={(v) => set('umsetzung', v)} />
      <Mehrzeilig label="Nachbereitung" wert={w.nachbereitung} aendere={(v) => set('nachbereitung', v)} />
      {fehler.lang && <span className="field__error">{fehler.lang}</span>}
      <TextField label="Autor/in" value={w.autor} onChange={(e) => set('autor', e.target.value)} maxLength={120} />
    </>
  );
}
