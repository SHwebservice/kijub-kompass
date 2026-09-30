/** Kategorien der Programmpunkte (im Katalog und im Wochenplan). */
export type AngebotKategorie = 'kennenlernen' | 'bewegung' | 'wasser' | 'planb' | 'kreativ' | 'highlight';

export const KATEGORIEN_ANGEBOT: { id: AngebotKategorie; label: string; icon: string }[] = [
  { id: 'kennenlernen', label: 'Kennenlernspiele', icon: '🤝' },
  { id: 'bewegung', label: 'Bewegungsspiele', icon: '🏃' },
  { id: 'wasser', label: 'Wasserspiele', icon: '💧' },
  { id: 'planb', label: 'Plan-B-Spiele', icon: '☔' },
  { id: 'kreativ', label: 'Kreativangebote', icon: '🎨' },
  { id: 'highlight', label: 'Highlights', icon: '⭐' },
];

export const kategorieLabel = (id: string | null | undefined): string =>
  KATEGORIEN_ANGEBOT.find((k) => k.id === id)?.label ?? '';

export const kategorieIcon = (id: string | null | undefined): string =>
  KATEGORIEN_ANGEBOT.find((k) => k.id === id)?.icon ?? '';
