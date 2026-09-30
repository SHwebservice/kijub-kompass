import { describe, it, expect } from 'vitest';
import { authFehlerText } from './auth-fehler';

describe('authFehlerText', () => {
  it('erklärt unbekannte Adressen verständlich', () => {
    expect(authFehlerText('Signups not allowed for otp')).toMatch(/keinen Zugang/);
  });
  it('erkennt abgelaufene und ungültige Codes', () => {
    expect(authFehlerText('Token has expired or is invalid')).toMatch(/ungültig oder abgelaufen/);
  });
  it('erkennt Ratenbegrenzung vor "invalid"', () => {
    expect(authFehlerText('For security purposes, you can only request this after 27 seconds')).toMatch(/Zu viele/);
  });
  it('fällt auf einen allgemeinen Text zurück und zeigt keine Technikdetails', () => {
    expect(authFehlerText('boom: stack trace xyz')).toBe('Anmeldung nicht möglich. Bitte erneut versuchen.');
  });
});
