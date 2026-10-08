import type { AngebotFormular } from './logik';

/** Vorbefüllen eines Programmpunkts aus einem Word-Workshop-Plan (Formular „Programmpunkt anlegen/vorschlagen“). */

/* ───── Word ───── */

/**
 * Liest die Tabelle eines Workshop-Plans (als HTML) und befüllt die Felder vor:
 * Titel in Anführungszeichen, Phasen Vorbereitung/Umsetzung/Nachbereitung, Material, Personal und die Summe der Minuten.
 */
export function ausWordHtml(html: string, dateiname: string): Partial<AngebotFormular> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let name = '';
  for (const el of Array.from(doc.querySelectorAll('h1, h2, h3, p'))) {
    const t = (el.textContent ?? '').trim();
    const m = /[„"“](.+?)["“”]/.exec(t);
    if (m) { name = m[1]!.trim(); break; }
    if (!name && /workshop|programmpunkt|plan/i.test(t) && t.length < 100) name = t;
  }
  if (!name) name = dateiname.replace(/\.docx$/i, '');

  const tabelle = doc.querySelector('table');
  if (!tabelle) return { name };

  const phasen = { vorbereitung: [] as string[], umsetzung: [] as string[], nachbereitung: [] as string[] };
  const material: string[] = [];
  let personal = '';
  let minuten = 0;
  let zeitGefunden = false;

  for (const zeile of Array.from(tabelle.querySelectorAll('tr')).slice(1)) {          // erste Zeile = Kopf
    const zellen = Array.from(zeile.querySelectorAll('td, th')).map((c) => (c.textContent ?? '').trim());
    if (zellen.length < 2) continue;
    const [phase = '', mat = '', todo = '', pers = '', zeit = ''] = zellen;
    const p = phase.toLowerCase();
    if (mat) material.push(mat.replace(/\s*\n\s*/g, ', '));
    const ziel = p.includes('vorbereitung') ? 'vorbereitung' : p.includes('umsetzung') || p.includes('durchführung') ? 'umsetzung' : p.includes('nachbereitung') ? 'nachbereitung' : null;
    if (ziel) { if (todo) phasen[ziel].push(todo); else if (mat) phasen[ziel].push(mat); }
    if (pers && !personal) personal = pers.trim();
    const m = /(\d+)\s*min/i.exec(zeit);
    if (m) { minuten += parseInt(m[1]!, 10); zeitGefunden = true; }
  }

  return {
    name, material: material.join('\n'), vorbereitung: phasen.vorbereitung.join('\n'), umsetzung: phasen.umsetzung.join('\n'),
    nachbereitung: phasen.nachbereitung.join('\n'), ...(personal ? { personal } : {}), ...(zeitGefunden ? { dauer: `${minuten} Min.` } : {}),
  };
}
