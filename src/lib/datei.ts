/** Macht aus einem Namen einen sicheren Dateinamen-Teil („Treff Nord“ → „Treff-Nord“). */
export const dateiName = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Datei';
