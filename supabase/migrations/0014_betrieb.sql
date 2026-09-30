-- KiJuB-Kompass · 0014 Betrieb: Lebenszeichen für die Datenbank
--
-- Kostenlose Supabase-Projekte werden nach einer Woche ohne Zugriffe pausiert. Ein geplanter Aufruf (GitHub Actions,
-- siehe .github/workflows/keepalive.yml) ruft diese Funktion auf: Sie berührt die Datenbank, gibt aber nur „ok“ zurück –
-- keine Daten, keine Uhrzeit, kein Hinweis auf Inhalte. Sie ist die einzige Funktion, die ohne Anmeldung ausführbar ist.
create function fn_ping() returns text
language sql stable as $$ select 'ok'::text $$;

grant execute on function fn_ping() to anon, authenticated;

-- Aufräumen: Die Schutzfunktion aus 0009 (nur als Trigger gedacht, nicht direkt aufrufbar) war noch für „public“ ausführbar.
-- Damit ist fn_ping die einzige Funktion, die ohne Anmeldung ausgeführt werden darf.
revoke execute on function fn_letzte_koordination_schuetzen() from public, anon;
