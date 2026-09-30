# KiJuB-Kompass – Produktbild (Phase 0)

Stand: 2026-09-30 · Status: **Entwurf zur Abstimmung**

## 1. Was ist der Kompass?

Der KiJuB-Kompass ist das **interne Organisations-Werkzeug des Kinder- und Jugendbüros (KiJuB)** für
Ferienfreizeiten und Kinder-/Jugendtreffs. Er ersetzt Zettel, Mail-Ketten und einzelne Excel-Listen durch eine
gemeinsame App, die auf dem Handy genauso funktioniert wie am Schreibtisch.

Die Vorgängerversion („KiJuB Marktplatz") war ein öffentlicher Programmkatalog, an den über Monate
Planung, Personal, Dienstpläne und Nachweise angebaut wurden. Der Katalog ist im Kompass nur noch **ein Modul**.

**Zielgruppe:** ausschließlich KiJuB-intern (Entscheidung vom 2026-09-30) – ein Träger, ein Team, kein Mandantenbetrieb.

## 2. Kernaufgaben (Jobs to be done)

| Wer | Will… |
|---|---|
| Koordination | Freizeiten und Treffs anlegen, Personal zuordnen, Bewerbungen entscheiden, den Überblick über Absprachen, Lebensmittel und Dienste behalten, alle erreichen (Push). |
| Freizeitleitung | Wochenprogramm der Freizeit planen, Hinweise ans Team und Absprachen mit der Koordination führen, Lebensmittel verwalten, das Team sehen. |
| Treffleitung | Wochenprogramm und Dienstplan des Treffs führen, Wunschdienste entscheiden, Urlaub/Krank/Feiertage pflegen, Nachweise der Teilzeitkräfte prüfen. |
| TeamerIn / BetreuerIn | Sehen, wo und wann sie eingesetzt sind, Programmpunkte eintragen, Hinweise bestätigen, sich bewerben, Dienste wünschen, Stunden nachweisen, Regeln (Teamermappe) nachlesen. |

## 3. Domänen (Module)

1. **Personal & Zugang** – Personen, Kategorien, Zugang/Login, Bewerbungen
2. **Freizeiten** – Stammdaten, Orte, Wochenplan, Hinweise/Absprachen, Lebensmittel
3. **Treffs** – Stammdaten, Wochenprogramm, Absprachen
4. **Dienstplan & Nachweise** – Dienste, Wunschdienste, Sonderdienste, Abwesenheiten, Feiertage, Stunden, Nachweis der Teilzeitkräfte
5. **Mappen & Lernen** – Teamermappe, Treffmappe, Formulare, Quiz
6. **Katalog** – Programmpunkte, Bewertungen, Vorschläge
7. **Mitteilungen** – Push, manuelle Nachrichten
8. **Betrieb** – Backup, Datenpflege, Impressum/Datenschutz

## 4. Leitplanken für den Neubau

- **Kostenlos bleiben.** Supabase Free + statisches Hosting (Cloudflare Pages / GitHub Pages). Keine Dienste, die eine Kreditkarte erzwingen.
- **Echte Anmeldung für alle.** Der Altbestand arbeitete mit 8-stelligen Codes ohne Login, deren Gültigkeit der Browser selbst mitschickte.
  Im Neubau hat jede Person ein Konto (Mail + Passwort; die Koordination richtet den Zugang ein, kein Mail-Versand nötig). Rechte entscheidet die Datenbank (Row Level Security), nicht der Client.
- **Mobile first, installierbar (PWA).** Die meisten Nutzenden sind unterwegs auf dem Handy.
- **Daten ordentlich modellieren.** Keine Arrays in Dokumenten mehr, die per Transaktion umgeschrieben werden (Notizen, Lebensmittel, Abwesenheiten …), sondern Tabellen mit Bezügen.
- **Nichts lokal verstecken, was zählt.** Der Nachweis der Teilzeitkräfte lag nur im `localStorage` eines Geräts – im Neubau liegt er in der Datenbank.
- **Datenschutz (DSGVO):** Gespeichert werden Beschäftigtendaten (Name, Mail, Telefon, Ernährung, Allergien/Notizen, Stunden). **Keine Kinderdaten** – auch die Formulare (Anwesenheit, Unfall …) sind Vordrucke zum Ausfüllen/PDF-Export und speichern nichts dauerhaft über die Person hinaus. EU-Region (Frankfurt) wählen, Auftragsverarbeitung abschließen.
- **Wachstum begrenzen.** Neue Funktionen müssen einer Domäne oben zugeordnet sein und eine Rolle aus `RECHTE.md` bedienen – sonst kommen sie in den „Ideen"-Speicher, nicht in die App.

## 5. Nicht-Ziele (vorerst)

- Keine Teilnehmenden-/Kinderverwaltung, keine Anmeldung von Familien, keine Bezahlung.
- Kein Mandantenbetrieb für andere Träger.
- Keine native Store-App (PWA reicht; später prüfbar).
- Kein öffentlich erreichbarer Bereich (außer Impressum/Datenschutz).

## 6. Offene Fragen an Sebastian

Siehe Abschnitt „Offene Entscheidungen" in [FEATURES.md](FEATURES.md) – dort mit Empfehlung je Punkt.
