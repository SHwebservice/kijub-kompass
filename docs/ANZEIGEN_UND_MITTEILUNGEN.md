# Anzeigen und Mitteilungen je Rolle

Festgelegt am 2026-09-30 mit der Fachseite. Die Umsetzung steht in `src/heute/kacheln.ts` (Anzeigen) und in der Datenbankfunktion `fn_push_vorbereiten` (Mitteilungen, Migrationen 0015 bis 0018).

Rollen: **Koordination**, **Freizeitleitung**, **TeamerIn**, **Treffleitung**, **BetreuerIn** (Team im Treff, z. B. TZK, FSJ), **Bewerbende** (TeamerIn ohne Zuordnung). Eine Person kann mehrere Rollen haben, dann gilt die Summe.

## 1. Anzeigen auf der Startseite („Heute“)

| Bereich | Koordination | Freizeitleitung | TeamerIn | Treffleitung | BetreuerIn | Bewerbende |
|---|---|---|---|---|---|---|
| Kacheln Freizeiten (Wochenplan, Hinweise, Team) | alle aktuellen | eigene | eigene | – | – | – |
| Kachel Lebensmittel | ja, Zahl knapper Artikel | ja, mit Zahl | – | – | – | – |
| Kacheln Treffs (Tagesprotokoll, Notizen, Dienstplan, Absprachen, Team) | alle | – | – | eigene | eigene | – |
| Nachweis | Zahl eingereichter | – | – | Zahl eingereichter | nur TZK, ohne Zahl | – |
| Dienstwünsche, Monatsplan, Abwesenheit & Feiertage | ja | – | – | ja | – | – |
| Verwaltung (Bewerbungen, Personen, Planung, Inhalte …) | ja, mit Zahlen | – | – | – | – | – |
| Karte „Heute“ (Tagesprogramm, Dienste) | ja | ja | ja | ja | ja | – |
| „Das wartet auf dich“ (Hinweise/Absprachen bestätigen) | ja | ja | Hinweise | ja | ja | – |
| Karte „Tagesprotokoll fehlt“ (Treff heute geöffnet, nichts geschrieben) | ja | – | – | ja | ja | – |
| Leitungs-Karte (knappe Lebensmittel, nicht gesehene Hinweise) | ja | ja | – | – | – | – |
| Treffleitungs-Karte (offene Dienstwünsche) | ja | – | – | ja | – | – |
| Koordinations-Karte (Bewerbungen, Vorschläge, Freizeit ohne Leitung) | ja | – | – | – | – | – |
| Freizeiten zum Bewerben | – | – | wenn bewerbend | – | – | ja |

*Die Spalte „Koordination“ gilt seit Migration 0018 je Bereich (Abschnitt 3): Freizeiten, Lebensmittel und Bewerbungen für die Freizeitenkoordination, Treffs, Protokolle und Nachweise für die Treffkoordination.*

Tagesprotokolle darf die Koordination **lesen und bearbeiten**; sie bekommt dazu aber **keine Mitteilungen** (weder wenn eines geschrieben wurde, noch wenn eines fehlt).

## 2. Mitteilungen (Web-Push)

Es gibt keine Einstellung je Mitteilungsart und keine Ruhezeiten: Jede Person schaltet Mitteilungen nur je Gerät ein oder aus.

| Auslöser | Empfänger | Seit |
|---|---|---|
| Neuer Hinweis in einer Freizeit | Team der Freizeit | 0015 |
| Neue Absprache (Freizeit) | Leitung der Freizeit und Freizeitenkoordination | 0015, 0018 |
| Neue Absprache (Treff) | Team des Treffs | 0015 |
| Dienstplan geändert | nur die betroffenen Personen | 0015 |
| Kommentar im Dienstplan | Team des Treffs | 0015 |
| Neuer Dienstwunsch | Treffleitung | 0015 |
| Antwort auf einen Dienstwunsch | die Person | 0015 |
| Neue Bewerbung | Freizeitenkoordination | 0015, 0018 |
| Neuer Katalog-Vorschlag | beide Koordinationen | 0015 |
| Manuelle Mitteilung | von der Koordination gewählte Gruppe | 0015 |
| **Tagesprotokoll fehlt** (abends, 15 Minuten bis 3 Stunden nach Ende der Öffnungszeit, einmal je Treff und Tag, nicht an Feiertagen) | **Treffleitung und die heute im Dienstplan Eingeteilten** – nicht die Koordination | 0016 |
| **Bewerbung angenommen** | die Person, die sich beworben hat (eine Absage löst keine Mitteilung aus) | 0017 |
| **Nachweis eingereicht** | Treffleitung des Treffs (ohne Treffleitung: Treffkoordination) | 0017, 0018 |
| **Lebensmittel knapp oder leer** (nach einer Verbrauchsbuchung; je Artikel und Stand einmal in 24 Stunden) | Freizeitenkoordination, die nachkauft (nicht die buchende Person selbst) | 0017, 0018 |

**Bewusst ohne Mitteilung:** Tagesprotokoll geschrieben oder mit Vorkommnis; Bewerbung abgelehnt; Änderungen am Wochenplan; neue Notizen; Nachweis freigegeben.

## 3. Die Koordination ist in zwei Bereiche getrennt (Migration 0018)

Freizeitenkoordination und Treffkoordination; eine Person kann beides sein. Was wer sieht und bekommt:

| | Freizeitenkoordination | Treffkoordination |
|---|---|---|
| Kacheln und Karten | Freizeiten, Lebensmittel, Bewerbungen, Saison-Überblick, „Freizeit ohne Leitung“ | Treffs, Tagesprotokolle, Nachweise, Dienstwünsche, „Tagesprotokoll fehlt“ |
| Verwaltung (Kacheln/„Mehr“) | Bewerbungen, Neue Freizeit, KiJuKo-Import | Neuer Treff |
| Gemeinsame Verwaltung | Personen, Orte, Katalog (Vorschläge, Import), Quiz-Fragen, Mitteilung senden | dasselbe |
| Mitteilungen | neue Bewerbung, Absprache in einer Freizeit, Lebensmittel knapp/leer | Nachweis eingereicht (wenn ein Treff keine Treffleitung hat) |
| Mitteilung senden an … | alle, Koordination, Leitungen, TeamerInnen/BetreuerInnen, **eine Freizeit** | alle, Koordination, Leitungen, TeamerInnen/BetreuerInnen, **einen Treff** |
| Protokolle | – | lesen und bearbeiten (keine Mitteilung) |

Neue Katalog-Vorschläge gehen an **beide** (gemeinsamer Katalog). Die Erinnerung „Tagesprotokoll fehlt“ geht weiterhin nur an Treffleitung und Eingeteilte.
