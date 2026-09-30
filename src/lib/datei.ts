/** Lässt den Browser eine Datei speichern (z. B. CSV-Export). */
export function ladeHerunter(dateiname: string, inhalt: string, typ = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement('a');
  a.href = url; a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Macht aus einem Namen einen sicheren Dateinamen-Teil („Treff Nord“ → „Treff-Nord“). */
export const dateiName = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Datei';
