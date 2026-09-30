import { describe, it, expect } from 'vitest';
import { ApiFehler, fehlerText } from './fehler';

describe('fehlerText', () => {
  it('übersetzt Rechte-Fehler', () => {
    expect(fehlerText(new ApiFehler({ code: '42501', message: 'Nur Treffleitung darf das' }))).toBe('Dafür fehlt die Berechtigung.');
    expect(fehlerText(new ApiFehler({ message: 'new row violates row-level security policy' }))).toBe('Dafür fehlt die Berechtigung.');
  });
  it('zeigt Regeln der eigenen Datenbankfunktionen im Klartext', () => {
    expect(fehlerText(new ApiFehler({ code: '23514', message: 'Du bist an diesem Tag schon eingeteilt' }))).toBe('Du bist an diesem Tag schon eingeteilt');
  });
  it('verbirgt technische Check-Meldungen', () => {
    const e = new ApiFehler({ code: '23514', message: 'new row for relation "dienste" violates check constraint "dienste_check"' });
    expect(fehlerText(e)).toBe('Die Angaben sind nicht gültig. Bitte prüfen.');
  });
  it('kennt doppelte und noch verwendete Einträge', () => {
    expect(fehlerText(new ApiFehler({ code: '23505', message: 'x' }))).toBe('Das gibt es schon.');
    expect(fehlerText(new ApiFehler({ code: '23503', message: 'x' }))).toMatch(/noch verwendet/);
  });
  it('meldet Verbindungsprobleme und fällt sonst auf den Standard zurück', () => {
    expect(fehlerText(new Error('Failed to fetch'))).toMatch(/Keine Verbindung/);
    expect(fehlerText(new Error('irgendwas'), 'Standard')).toBe('Standard');
    expect(fehlerText('kein Fehlerobjekt')).toMatch(/nicht geklappt/);
  });
});
