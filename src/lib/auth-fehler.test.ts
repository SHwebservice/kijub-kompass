import { describe, it, expect } from 'vitest';
import { authFehlerText, passwortProblem, MIN_PASSWORT } from './auth-fehler';

describe('authFehlerText', () => {
  it('falsche Zugangsdaten: ein Text für unbekannte Adresse und falsches Passwort', () => {
    expect(authFehlerText('Invalid login credentials')).toMatch(/Mail-Adresse oder Passwort stimmt nicht/);
  });
  it('Ratenbegrenzung', () => {
    expect(authFehlerText('For security purposes, you can only request this after 27 seconds')).toMatch(/Zu viele/);
    expect(authFehlerText('Request rate limit reached')).toMatch(/Zu viele/);
  });
  it('gleiches Passwort und schwaches Passwort', () => {
    expect(authFehlerText('New password should be different from the old password.')).toMatch(/unterscheiden/);
    expect(authFehlerText('Password should be at least 10 characters')).toMatch(/zu schwach/);
  });
  it('fällt auf einen allgemeinen Text zurück und zeigt keine Technikdetails', () => {
    expect(authFehlerText('boom: stack trace xyz')).toBe('Anmeldung nicht möglich. Bitte erneut versuchen.');
  });
});

describe('passwortProblem', () => {
  it('verlangt die Mindestlänge', () => {
    expect(passwortProblem('x'.repeat(MIN_PASSWORT - 1), 'x'.repeat(MIN_PASSWORT - 1))).toMatch(/mindestens/);
    expect(passwortProblem('x'.repeat(MIN_PASSWORT), 'x'.repeat(MIN_PASSWORT))).toBeNull();
  });
  it('verlangt übereinstimmende Wiederholung', () => {
    expect(passwortProblem('x'.repeat(12), 'y'.repeat(12))).toMatch(/stimmen nicht überein/);
  });
});
