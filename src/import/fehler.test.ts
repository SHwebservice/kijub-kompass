import { describe, it, expect } from 'vitest';
import { importMeldung } from './fehler';

const m = (fehler: unknown, schritt: 'pruefen' | 'uebernehmen' = 'pruefen') => importMeldung(fehler, schritt);

describe('importMeldung', () => {
  it('fehlende Datenbankfunktion (Migration nicht eingespielt) wird klar benannt', () => {
    for (const f of [{ code: 'PGRST202', message: 'Could not find the function public.fn_kijuko_import(...) in the schema cache' }, { message: 'function fn_kijuko_import does not exist' }]) {
      expect(m(f).text).toMatch(/Migration „0010_kijuko_import.sql“ wurde noch nicht eingespielt/);
    }
  });
  it('fehlende Berechtigung: nur die Koordination', () => {
    expect(m({ code: '42501', message: 'Nur die Koordination darf importieren' }).text).toMatch(/der Koordination vorbehalten/);
    expect(m({ message: 'permission denied for table personen' }).text).toMatch(/Berechtigung/);
  });
  it('Zeitüberschreitung, abgelaufene Anmeldung, Netzwerk', () => {
    expect(m({ code: '57014', message: 'canceling statement due to statement timeout' }).text).toMatch(/zu lange gebraucht/);
    expect(m({ code: 'PGRST301', message: 'JWT expired' }).text).toMatch(/Anmeldung ist abgelaufen/);
    expect(m({ status: 401, message: 'x' }).text).toMatch(/Anmeldung ist abgelaufen/);
    expect(m(new TypeError('Failed to fetch')).text).toMatch(/Keine Verbindung/);
  });
  it('fehlende Browser-Verschlüsselung (Seite ohne HTTPS über Netzwerkadresse)', () => {
    expect(m(new Error('crypto.subtle ist nicht verfügbar (Seite nicht über HTTPS oder localhost geöffnet)')).text).toMatch(/localhost:5173/);
  });
  it('abgelehnte Daten zeigen den Text der Datenbank', () => {
    expect(m({ code: 'P0001', message: 'Ungültiger Plan: Version 9' }).text).toMatch(/Ungültiger Plan: Version 9/);
  });
  it('alles Unbekannte: allgemeine Meldung mit technischer Angabe', () => {
    const r = m({ code: 'XX000', message: 'irgendwas', name: 'PostgrestError' });
    expect(r.text).toMatch(/technische Angabe unten/);
    expect(r.technisch).toBe('PostgrestError · XX000 · irgendwas');
  });
  it('Einleitung je Schritt', () => {
    expect(m({}, 'pruefen').text).toMatch(/^Die Datei konnte nicht geprüft werden\./);
    expect(m({}, 'uebernehmen').text).toMatch(/^Der Import ist fehlgeschlagen\. Es wurde nichts verändert\./);
  });
  it('kommt mit Text, null und Unsinn zurecht', () => {
    expect(m('kaputt').technisch).toBe('kaputt');
    expect(m(null).technisch).toBe('keine Angabe');
    expect(m(42).technisch).toBe('keine Angabe');
  });
  it('die Standardbezeichnung „Error“ wird in der technischen Angabe weggelassen', () => {
    expect(m(new Error('x')).technisch).toBe('x');
  });
});
