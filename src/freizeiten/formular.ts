import type { FreizeitDetailDaten, FreizeitFormular } from './api';
import { MAX_FERIENWOCHEN, tageZwischen } from './logik';

export const leeresFormular = (): FreizeitFormular => ({
  name: '', status: 'geplant', ferienzeitraum: '', ferienwoche: '', start_datum: '', ende_datum: '',
  arbeitsbeginn: '', arbeitsende: '', alter_von: '', alter_bis: '', max_teilnehmende: '', ort_id: '', tags: [], farbe: '', bewerbung_offen: true, typ: '',
});

export function formularAusDetail(d: FreizeitDetailDaten): FreizeitFormular {
  return {
    name: d.name, status: d.status, ferienzeitraum: d.ferienzeitraum ?? '', ferienwoche: d.ferienwoche ?? '',
    start_datum: d.start_datum, ende_datum: d.ende_datum, arbeitsbeginn: d.arbeitsbeginn ?? '', arbeitsende: d.arbeitsende ?? '',
    alter_von: d.alter_von ?? '', alter_bis: d.alter_bis ?? '', max_teilnehmende: d.max_teilnehmende ?? '',
    ort_id: d.ort_id ?? '', tags: [...d.tags], farbe: d.farbe ?? '', bewerbung_offen: d.bewerbung_offen, typ: d.typ ?? '',
  };
}

export type Fehlerliste = Partial<Record<keyof FreizeitFormular, string>>;

/** Prüft das Formular; liefert pro Feld eine verständliche Meldung (leer = alles in Ordnung). */
export function validiereFreizeit(f: FreizeitFormular): Fehlerliste {
  const e: Fehlerliste = {};
  if (!f.name.trim()) e.name = 'Bitte einen Namen eingeben.';
  if (!f.start_datum) e.start_datum = 'Bitte das Startdatum angeben.';
  if (!f.ende_datum) e.ende_datum = 'Bitte das Enddatum angeben.';
  if (f.start_datum && f.ende_datum && tageZwischen(f.start_datum, f.ende_datum) < 0) {
    e.ende_datum = 'Das Ende darf nicht vor dem Start liegen.';
  }
  if (f.start_datum && f.ende_datum && tageZwischen(f.start_datum, f.ende_datum) > 60) {
    e.ende_datum = 'Eine Freizeit darf höchstens 61 Tage dauern.';
  }
  if (f.ferienwoche !== '') {
    if (!f.ferienzeitraum) e.ferienwoche = 'Für eine Woche bitte zuerst die Ferienzeit wählen.';
    else if (f.ferienwoche < 1 || f.ferienwoche > MAX_FERIENWOCHEN[f.ferienzeitraum]) {
      e.ferienwoche = `Für diese Ferienzeit sind Wochen 1 bis ${MAX_FERIENWOCHEN[f.ferienzeitraum]} möglich.`;
    }
  }
  if (f.alter_von !== '' && f.alter_von < 0) e.alter_von = 'Das Alter darf nicht negativ sein.';
  if (f.alter_von !== '' && f.alter_bis !== '' && f.alter_bis < f.alter_von) e.alter_bis = 'Das höchste Alter darf nicht unter dem niedrigsten liegen.';
  if (f.max_teilnehmende !== '' && f.max_teilnehmende < 1) e.max_teilnehmende = 'Bitte eine Zahl ab 1 angeben.';
  if (f.arbeitsbeginn && f.arbeitsende && f.arbeitsende <= f.arbeitsbeginn) e.arbeitsende = 'Das Arbeitsende muss nach dem Beginn liegen.';
  return e;
}
