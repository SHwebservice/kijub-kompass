/** Wandelt ein Word-Dokument (.docx) in HTML um. Die Bibliothek wird erst beim ersten Import geladen. */
export async function wordZuHtml(datei: File): Promise<string> {
  const mammoth = await import('mammoth');
  const ergebnis = await mammoth.convertToHtml({ arrayBuffer: await datei.arrayBuffer() });
  return ergebnis.value;
}
