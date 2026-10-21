-- KiJuB-Kompass · 0038: Wochenprogramm als Freitext je Öffnungstag
--
-- Das wiederkehrende Wochenprogramm (treff_plan_eintraege, ein Eintrag je Wochentag) ist nur noch ein Freitext, der in der App
-- direkt bei den Öffnungszeiten des Tages steht. Katalog-Programmpunkt und Notiz entfallen: Bestehende Einträge werden einmalig
-- in den Freitext übernommen („Spielenachmittag – Notiz“), die Spalten angebot_id und notiz bleiben leer.
-- Schreiben dürfen nur noch Treffleitung und Treffkoordination (bisher jede Person des Treffs; die App ließ es ohnehin nur die
-- Leitung tun).

update treff_plan_eintraege e
   set freitext   = coalesce(a.name, e.freitext, '') || coalesce(' – ' || nullif(trim(e.notiz), ''), ''),
       angebot_id = null,
       notiz      = null
  from treff_plan_eintraege x
  left join angebote a on a.id = x.angebot_id
 where x.treff_id = e.treff_id and x.wochentag = e.wochentag
   and (e.angebot_id is not null or e.notiz is not null);

delete from treff_plan_eintraege where trim(coalesce(freitext, '')) = '';

alter table treff_plan_eintraege add constraint treff_plan_eintraege_freitext_laenge check (length(freitext) <= 2000);

drop policy schreiben on treff_plan_eintraege;
create policy schreiben on treff_plan_eintraege for all to authenticated
  using (ist_treffkoord() or ist_treffleitung(treff_id))
  with check (ist_treffkoord() or ist_treffleitung(treff_id));
