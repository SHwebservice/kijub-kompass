export interface Pruefergebnis { name: string; ok: boolean; detail: string }
export function pruefeSeite(holen: typeof fetch, adresse: string): Promise<Pruefergebnis[]>;
