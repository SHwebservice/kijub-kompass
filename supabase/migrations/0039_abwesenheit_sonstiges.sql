-- KiJuB-Kompass · 0039: Abwesenheit „Sonstiges“ (neben Urlaub und krank)
--
-- Für Abwesenheiten wie Fortbildung, Dienstreise oder Sonderurlaub. Was genau, steht in der Notiz.
-- Im Stundennachweis erscheint die Zeile als „Sonstiges – <Notiz>“ (wie Urlaub mit den üblichen Stunden der Öffnungszeit).
-- Bisher setzte fn_nachweis_befuellen jeden Typ außer Urlaub als „Krank“ – das wird hier korrigiert.

alter type abwesenheit_typ add value if not exists 'sonstiges';

do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fn_nachweis_befuellen' loop
    def := pg_get_functiondef(r.oid);
    if position($t$case a.typ when 'urlaub' then 'Urlaub' else 'Krank' end$t$ in def) = 0 then
      raise exception 'fn_nachweis_befuellen hat nicht den erwarteten Aufbau';
    end if;
    execute replace(def, $t$case a.typ when 'urlaub' then 'Urlaub' else 'Krank' end$t$,
                         $t$case a.typ::text when 'urlaub' then 'Urlaub' when 'krank' then 'Krank' else 'Sonstiges' end$t$);
  end loop;
end $$;
