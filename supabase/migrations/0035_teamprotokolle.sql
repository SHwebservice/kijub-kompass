-- KiJuB-Kompass · 0035: Teamprotokolle der Treffs (Teambesprechung, Information, Sonstiges)
--
-- Neben dem Tagesprotokoll braucht ein Treff Protokolle zum Nachlesen: eine Teambesprechung, eine wichtige Information, die nicht alle
-- erreicht hat. Treffleitung und Treffkoordination legen sie an und ändern sie; das ganze Team des Treffs liest sie. Wer ein Protokoll
-- öffnet, gilt als „gelesen“ (treff_teamprotokoll_gelesen); die Treffleitung sieht, wer es schon gelesen hat. Bei einem neuen Protokoll
-- bekommt das Team eine Mitteilung (fn_push_vorbereiten, Art 'teamprotokoll').

create table treff_teamprotokolle (
  id             uuid primary key default gen_random_uuid(),
  treff_id       uuid not null references treffs(id) on delete cascade,
  art            text not null default 'teambesprechung' check (art in ('teambesprechung', 'information', 'sonstiges')),
  datum          date not null default current_date,
  titel          text not null check (length(trim(titel)) between 1 and 200),
  text           text not null check (length(trim(text)) between 1 and 20000),
  anwesend       uuid[] not null default '{}',                   -- bei Besprechungen: wer dabei war (aus dem Team des Treffs)
  erstellt_von   uuid references personen(id) on delete set null,
  bearbeitet_von uuid references personen(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index treff_teamprotokolle_treff on treff_teamprotokolle (treff_id, datum desc);

create table treff_teamprotokoll_gelesen (
  protokoll_id uuid not null references treff_teamprotokolle(id) on delete cascade,
  person_id    uuid not null references personen(id) on delete cascade,
  am           timestamptz not null default now(),
  primary key (protokoll_id, person_id)
);

create function fn_teamprotokoll_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from unnest(new.anwesend) a(pid) where not exists (select 1 from treff_team t where t.treff_id = new.treff_id and t.person_id = a.pid)) then
    raise exception 'Anwesend können nur Personen aus dem Team des Treffs sein' using errcode = 'check_violation';
  end if;
  new.anwesend := array(select distinct x from unnest(new.anwesend) x);
  if tg_op = 'INSERT' then
    new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von); new.created_at := now();
  else
    if new.treff_id is distinct from old.treff_id then raise exception 'Ein Protokoll lässt sich nicht in einen anderen Treff verschieben' using errcode = 'check_violation'; end if;
    new.erstellt_von := old.erstellt_von; new.created_at := old.created_at;
  end if;
  new.bearbeitet_von := coalesce(meine_person_id(), new.bearbeitet_von);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function fn_teamprotokoll_pruefen() from public, anon;
create trigger treff_teamprotokolle_pruefen before insert or update on treff_teamprotokolle for each row execute function fn_teamprotokoll_pruefen();

alter table treff_teamprotokolle enable row level security;
alter table treff_teamprotokoll_gelesen enable row level security;
revoke all on treff_teamprotokolle, treff_teamprotokoll_gelesen from anon;
grant select, insert, update, delete on treff_teamprotokolle to authenticated;
grant select, insert, delete on treff_teamprotokoll_gelesen to authenticated;

create policy lesen on treff_teamprotokolle for select to authenticated using (ist_treffkoord() or ist_im_treff(treff_id));
create policy schreiben on treff_teamprotokolle for insert to authenticated with check (ist_treffkoord() or ist_treffleitung(treff_id));
create policy aendern on treff_teamprotokolle for update to authenticated
  using (ist_treffkoord() or ist_treffleitung(treff_id)) with check (ist_treffkoord() or ist_treffleitung(treff_id));
create policy loeschen on treff_teamprotokolle for delete to authenticated using (ist_treffkoord() or ist_treffleitung(treff_id));

-- „Gelesen“: jede Person vermerkt nur sich selbst; sehen darf man es, wenn man das Protokoll sehen darf
create function darf_teamprotokoll_sehen(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_teamprotokolle p where p.id = pid and (ist_treffkoord() or ist_im_treff(p.treff_id)))
$$;
revoke execute on function darf_teamprotokoll_sehen(uuid) from public, anon;
grant execute on function darf_teamprotokoll_sehen(uuid) to authenticated;
create policy lesen on treff_teamprotokoll_gelesen for select to authenticated using (darf_teamprotokoll_sehen(protokoll_id));
create policy vermerken on treff_teamprotokoll_gelesen for insert to authenticated
  with check (person_id = meine_person_id() and darf_teamprotokoll_sehen(protokoll_id));
create policy zuruecknehmen on treff_teamprotokoll_gelesen for delete to authenticated using (person_id = meine_person_id());

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['treff_teamprotokolle', 'treff_teamprotokoll_gelesen'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ===== Mitteilung „Neues Teamprotokoll“ an das Team (ohne die verfassende Person) =====
create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare z bewerbungen_zeitraum; a materialliste_abgabe; f freizeiten; tp treff_teamprotokolle; t treffs; ich uuid := meine_person_id();
begin
  if p_art = 'bewerbung_zeitraum' then
    select * into z from bewerbungen_zeitraum where id = p_ref and person_id = ich and created_at >= now() - interval '10 minutes';
    if z.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv)),
      'titel', 'Neue Bewerbung', 'text', fn_push_name(ich) || ' bewirbt sich für ' || zeitraum_text(z) || '.', 'url', '/bewerbungen');
  elsif p_art = 'materialliste' then
    select * into a from materialliste_abgabe where freizeit_id = p_ref and abgegeben_von = ich and abgegeben_am >= now() - interval '10 minutes';
    if a.freizeit_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = p_ref;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv and id <> ich)),
      'titel', 'Materialliste · ' || f.name, 'text', fn_push_name(ich) || ' hat die Materialliste abgegeben (' ||
        (select count(*) from freizeit_materialliste where freizeit_id = f.id) || ' Positionen).', 'url', '/freizeiten/' || f.id || '/material');
  elsif p_art = 'teamprotokoll' then
    select * into tp from treff_teamprotokolle where id = p_ref and erstellt_von = ich and created_at >= now() - interval '10 minutes';
    if tp.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = tp.treff_id;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                                   where tm.treff_id = t.id and p.aktiv and tm.person_id <> ich)),
      'titel', 'Neues Teamprotokoll · ' || t.name,
      'text', tp.titel || ' (' || to_char(tp.datum, 'DD.MM.YYYY') || ') – bitte lesen.',
      'url', '/treffs/' || t.id || '/teamprotokolle');
  end if;
  return fn_push_vorbereiten_basis(p_art, p_ref, p_extra);
end $$;
