-- KiJuB-Kompass · 0041: Mitteilung „Ersatz gesucht“
--
-- Fällt jemand aus (Urlaub, krank, Sonstiges), nimmt die Treffleitung die Person im Dienstplan aus ihren Diensten heraus und sucht Ersatz.
-- Mit der Art 'ersatz_gesucht' (ref = Treff, extra.datum) fragt sie die Personen des Treffs, die an dem Tag frei sind:
-- aktiv, nicht eingeteilt, nicht abwesend und ohne „kann nicht“. Wer einspringen kann, wünscht sich den Dienst im Dienstplan.
-- Nur Treffleitung und Treffkoordination; nur für Öffnungstage ab heute.
--
-- Wie 0037: fn_push_vorbereiten wird umbenannt und umhüllt (wiederholbar). Wird 0037 danach noch einmal eingespielt, ersetzt es diese
-- Hülle (es erkennt sie am Verweis auf fn_push_vorbereiten_vor_0037 unten und benennt nichts um – so entsteht keine Schleife);
-- dann 0041 erneut einspielen.

do $do$
begin
  if exists (select 1 from pg_proc where proname = 'fn_push_vorbereiten' and pronamespace = 'public'::regnamespace
             and prosrc not like '%fn_push_vorbereiten_vor_0041%') then
    drop function if exists fn_push_vorbereiten_vor_0041(text, uuid, jsonb);
    alter function fn_push_vorbereiten(text, uuid, jsonb) rename to fn_push_vorbereiten_vor_0041;
  end if;
end $do$;
revoke execute on function fn_push_vorbereiten_vor_0041(text, uuid, jsonb) from public, anon, authenticated;

create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare t treffs; oz treff_oeffnungszeiten; v_datum date; ich uuid := meine_person_id();
  heute date := (now() at time zone 'Europe/Berlin')::date;
  tage text[] := array['Mo','Di','Mi','Do','Fr','Sa','So'];
begin
  -- Kette: diese Hülle → fn_push_vorbereiten_vor_0041 → … → fn_push_vorbereiten_vor_0037 → Basis
  if p_art = 'ersatz_gesucht' then
    v_datum := (p_extra ->> 'datum')::date;
    select * into t from treffs where id = p_ref;
    if t.id is null or v_datum is null or v_datum < heute or not (ist_treffkoord() or ist_treffleitung(t.id)) then
      raise exception 'Mitteilung nicht zulässig' using errcode = '42501';
    end if;
    select * into oz from treff_oeffnungszeiten where treff_id = t.id and wochentag = extract(isodow from v_datum);
    if oz.treff_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(
        select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
         where tm.treff_id = t.id and p.aktiv and tm.person_id <> ich
           and not exists (select 1 from dienst_zuteilungen z join dienste d on d.id = z.dienst_id
                            where d.treff_id = t.id and d.datum = v_datum and not d.ist_sonder and z.person_id = tm.person_id)
           and not exists (select 1 from abwesenheiten a where a.person_id = tm.person_id and a.datum = v_datum)
           and not exists (select 1 from dienst_verhinderungen v where v.treff_id = t.id and v.person_id = tm.person_id and v.datum = v_datum))),
      'titel', 'Ersatz gesucht · ' || t.name,
      'text', 'Wer kann am ' || tage[extract(isodow from v_datum)::int] || ' ' || to_char(v_datum, 'DD.MM.') || ' (' || to_char(oz.von, 'HH24:MI') || '–' || to_char(oz.bis, 'HH24:MI')
              || ' Uhr) einspringen? Wünsch dir den Dienst im Dienstplan.',
      'url', '/treffs/' || t.id || '/dienstplan?datum=' || to_char(v_datum, 'YYYY-MM-DD'));
  end if;
  return fn_push_vorbereiten_vor_0041(p_art, p_ref, p_extra);
end $fn$;
revoke execute on function fn_push_vorbereiten(text, uuid, jsonb) from public, anon;
grant execute on function fn_push_vorbereiten(text, uuid, jsonb) to authenticated;
