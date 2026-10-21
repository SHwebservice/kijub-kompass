-- KiJuB-Kompass · 0038: Wochenprogramm als Freitext je Treff
--
-- Statt eines Programmpunkts je Öffnungstag (treff_plan_eintraege) trägt die Treffleitung das feste, jede Woche wiederkehrende
-- Programm als einen Freitext ein (treffs.wochenprogramm). Treffleitung und Treffkoordination ändern ihn mit fn_wochenprogramm_setzen.
-- Bisherige Einträge werden einmalig in den Freitext übernommen („Dienstag: Spielenachmittag – Notiz“). Die alte Tabelle bleibt
-- unverändert stehen, wird von der App aber nicht mehr benutzt.

alter table treffs add column wochenprogramm text check (wochenprogramm is null or length(wochenprogramm) <= 4000);

update treffs t set wochenprogramm = x.text
from (
  select e.treff_id,
         string_agg(
           (array['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'])[e.wochentag] || ': '
             || coalesce(a.name, e.freitext, '')
             || coalesce(' – ' || nullif(trim(e.notiz), ''), ''),
           E'\n' order by e.wochentag) as text
  from treff_plan_eintraege e
  left join angebote a on a.id = e.angebot_id
  group by e.treff_id
) x
where x.treff_id = t.id and t.wochenprogramm is null;

create function fn_wochenprogramm_setzen(p_treff uuid, p_text text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (ist_treffkoord() or ist_treffleitung(p_treff)) then
    raise exception 'Nur Treffleitung und Treffkoordination dürfen das Wochenprogramm ändern' using errcode = '42501';
  end if;
  update treffs set wochenprogramm = nullif(trim(p_text), '') where id = p_treff;
end $$;
revoke execute on function fn_wochenprogramm_setzen(uuid, text) from public, anon;
grant execute on function fn_wochenprogramm_setzen(uuid, text) to authenticated;
