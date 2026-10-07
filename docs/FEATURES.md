# Feature-Liste (Phase 1)

Quelle: Durchsicht von `kijub-marktplatz` (Stand 2026-09-30). Jede Zeile nennt, was der Altcode tut, und
eine **Entscheidung für den Neubau**:

- **Behalten** – 1:1 fachlich übernehmen
- **Neu** – Funktion bleibt, Umsetzung ändert sich (Begründung in der Spalte)
- **Streichen** – entfällt
- **Offen** – braucht Entscheidung (siehe Schluss)

Begriffe: *Koordination* = Admin (Firebase-Auth-Konto ohne Mitarbeitenden-Verknüpfung). *Leitung* = Freizeitleitung.
Quellen-Kürzel: `mt` = mitarbeitende.js, `fz` = freizeiten-zugaenge.js, `tf` = treffs.js, `dn` = dienstplan-nachweis.js,
`ta` = treff-abwesenheiten.js, `tm` = teamermappe.js, `tfm` = treffmappe.js, `kat` = katalog*.js, `bk` = backup-import.js,
`push` = install-push.js + functions/index.js, `rules` = firestore.rules.

> Hinweis zur Belastbarkeit: Personal, Freizeiten, Treffs, Dienstplan, Nachweis, Abwesenheiten, Mappen, Push-Functions
> und Rechte wurden im Detail gelesen. Katalog-Filter/-Darstellung, der persönliche Planer (`helpers-planner.js`),
> CSS und Quiz-Oberfläche wurden nur überblickt. Wo das relevant ist, steht es in der Zeile.

---

## A. Zugang & Anmeldung

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| A1 | Mitarbeitende bekommen einen 8-stelligen Code (Alphabet ohne 0/O/1/I) und einen Link `?zugang=CODE`; der Code wird im `localStorage` gemerkt (mehrere Codes pro Gerät möglich). Kein Passwort. | `fz` | **Neu** → Anmeldung mit Mail + Passwort. Die Koordination richtet den Zugang in der App ein und gibt das Startpasswort persönlich weiter; Pflicht zur Änderung beim ersten Anmelden (Entscheidung 2026-09-30: kein Mail-Versand, da Supabase Free nur an Teammitglieder sendet). Keine Codes im Browser. |
| A2 | Koordination meldet sich mit Firebase-Mail+Passwort an. | `auth-overlays` | **Behalten** (Rolle `koordination`). |
| A3 | Hauptamtliche können zusätzlich ein Mail+Passwort-Login „einrichten" (zweite Firebase-App-Instanz, Verknüpfung `mitarbeitendeAuth/{uid}`; Reset nur manuell in der Console). | `mt` | **Streichen** – ersetzt durch A1 für alle. |
| A4 | Legacy-Zugänge (`zugaenge`, befristet, Label statt Person) für bereits verschickte Links. | `mt`, `fz`, `rules` | **Streichen** (keine Altlasten, Neustart). |
| A5 | „Mein Bereich": Code eingeben, Code entfernen, Info-Tooltip. | `fz` | **Streichen** (Login statt Code). |
| A6 | Zuletzt geöffnete Ansicht wird gemerkt und beim Start wiederhergestellt. | `helpers-planner` | **Behalten** (Komfort, nur lokal). |
| A7 | Export der Zugangscodes als JSON für die Offline-Software „KiJuKo2.1" (Platzhalter `{Code}`/`{Zugangslink}` in Mail-Vorlagen). | `mt` | **Streichen** (Entscheidung 2026-09-30: Codes entfallen). Folge: KiJuKo-Mailvorlagen mit `{Code}`/`{Zugangslink}` müssen auf den App-Link umgestellt werden (Änderung in KiJuKo, nicht im Kompass). |
| A8 | Mail an einzelne Person bzw. **Serienmail** per `mailto:`-Warteschlange (ein Fenster pro Person), filterbar nach Ferienzeitraum (Ostern/Sommer/Herbst). | `mt` | **Neu** → Die Serienmail-Warteschlange entfällt vorerst (Zugänge werden persönlich übergeben); ein mailto-Text mit App-Adresse und Mail-Adresse (ohne Passwort) kann später ergänzt werden. |

## B. Personal

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| B1 | Stammdaten je Person: Vorname, Nachname, Mail (Pflicht), Telefon, Ernährung (Mischkost/Vegetarisch/Vegan), „Allergien/besondere Fähigkeiten" (Freitext), aktiv/deaktiviert. | `mt` | **Behalten**. |
| B2 | 7 Kategorien: TeamerIn, Senior-TeamerIn, FSJ, TZK, Praktikum bezahlt, Praktikum unbezahlt, Hauptamtliche\*r. Kategorie bestimmt **abgeleitet** die Rolle: Hauptamtliche\*r ⇒ Leitung, alle anderen ⇒ TeamerIn. | `mt`, `rules` | **Neu** → Rolle je Einsatz wird **gespeichert** (Standard aus Kategorie vorbelegt), damit Ausnahmen möglich sind. Siehe O2. |
| B3 | TZK-Zusatzfelder: Regeltage, Max.-Stunden/Monat. | `mt` | **Behalten** (werden in Team-Ansicht und Dienstplan sichtbar). |
| B4 | Zuordnung zu Freizeiten (Rolle `teamer`/`leitung`) und zu Treffs (`treffleitung`/`betreuerin`). Treffs nur für TZK, FSJ, Praktikum unbezahlt, Hauptamtliche\*r. | `mt`, `fz` | **Behalten** (als Zuordnungs-Tabellen statt Map-Feldern). |
| B5 | Liste mit Suche (Name/Mail/Code), Filtern (Rolle, aktiv/inaktiv, „ohne Freizeit", Freizeit), A–Z-Sprung, Schnell-Statuswechsel per Dropdown. | `mt` | **Behalten**. |
| B6 | Duplikate finden und zusammenführen (gleicher Name, „reichster" Datensatz gewinnt, Felder werden ergänzt). | `mt` | **Streichen** – Eindeutigkeit über Mail-Adresse als Datenbank-Regel. Import-Duplikate werden beim Import abgefangen. |
| B7 | Team-Liste einer Freizeit/eines Treffs (Name, Mail, Telefon, Ernährung, Notizen, TZK-Angaben). Wird als **Kopie** im Freizeit-/Treff-Dokument gepflegt, damit Leitungen sie sehen, ohne die Personal-Sammlung lesen zu dürfen. | `fz`, `mt`, `tf` | **Neu** → eine Sicht (View) mit Zeilenrechten statt Kopie. Mail/Telefon/Ernährung sichtbar für Leitung ihres Einsatzes und Koordination, nicht für TeamerInnen untereinander (heute: siehe O3). |
| B8 | Koordination kann Personen aus dem Team entfernen/hinzufügen (Suche, max. 15 Treffer, nur aktive, Treffs nur zulässige Kategorien). | `fz` | **Behalten**. |
| B9 | **Bewerbung:** TeamerIn sieht alle kommenden Freizeiten (Start ≥ heute + 7 Tage, noch nicht zugeteilt/beworben), bewirbt sich mit optionaler Notiz, kann bis zur Entscheidung zurückziehen. Koordination nimmt an (⇒ Zuordnung als TeamerIn) oder lehnt ab. Badge mit Anzahl offener Bewerbungen. | `fz`, `mt`, `core` | **Behalten**. Frist „7 Tage" wird konfigurierbar (Einstellung). |
| B10 | Backup-Import aus „KiJuKo" (Electron-Verwaltungssoftware): Projekte → Freizeiten, Orte, Staff → Personen, Zuteilungen, Leitungen aus „Hauptamtliche". Vorschau vor Import, Übersprungenes wird gelistet. | `bk` | **Behalten und erweitern** (Entscheidung 2026-09-30: KiJuKo bleibt im Einsatz, Import bleibt dauerhaft). Wird **wiederholbar** (Abgleich statt Neuanlage). Details in [IMPORT.md](IMPORT.md). |

## C. Freizeiten

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| C1 | Stammdaten: Name, Ferienzeitraum (Ostern/Sommer/Herbst) + Ferienwoche (Ostern 2, Sommer 6, Herbst 2 Wochen), Ort, Adresse, Start/Ende, Arbeitsbeginn/-ende, Alter von/bis, max. Teilnehmende, Leitungsname/-mail, Tags. | `fz` | **Behalten**. `leitungName/-mail` werden aus der Zuordnung abgeleitet statt doppelt getippt. |
| C2 | 6 Freizeit-Tags: Gelbes T-Shirt, Großfreizeit, Themenfreizeit, Schwimmen/Wasser, Übernachtung/Mehrtägig, Küche – steuern u. a., welche Teamermappe-Kacheln hervorgehoben werden. | `tm` | **Behalten** (Tags als Tabelle, erweiterbar durch Koordination). |
| C3 | Orte als Stammdaten (Name, Adresse); mehrere Freizeiten können einen Ort teilen; Adresse der Freizeit wird vom Ort übernommen und ist dann schreibgeschützt; Ort kann nur gelöscht werden, wenn keine Freizeit ihn nutzt. | `fz` | **Behalten** (Fremdschlüssel erzwingt das). |
| C4 | Wochenplan: Tage werden aus Start/Ende erzeugt (Format „Mo 20.7."); Slots standardmäßig Vormittag/Nachmittag, optional „Abend"; Slot-Reihenfolge ändert nur die Leitung. | `fz`, `helpers-planner` | **Neu** → Tage aus echtem Datum berechnet (keine Strings mit Punkten, die in Feldpfaden Probleme machten); Slots als Tabelle. |
| C5 | Je Tag×Slot **mehrere** Einträge (kein „Ausbuchen"): Katalog-Programmpunkt *oder* Freitext (Freitext nur Leitung/Koordination), Notiz, „eingetragen von" (Vorname). Anzeige: Kategoriefarbe, ab 3 Einträgen „+n weitere". | `fz` | **Behalten**. „eingetragen von" wird eine Personenreferenz. |
| C6 | **Hinweise** (für alle sichtbar, inkl. TeamerInnen; gelten für die ganze Freizeit oder einen Tag). TeamerInnen können per Daumen „gesehen" bestätigen; Leitung sieht nur Anzahl/Namen. | `fz` | **Behalten**. Bestätigung per Person-ID statt Vorname. |
| C7 | **Absprachen** (nur Leitung + Koordination; gesamt oder je Tag). Leitung/Koordination bestätigen per Daumen, kommentieren (bearbeiten/löschen). „KO bestätigt"/„Leitung bestätigt". | `fz` | **Behalten**. |
| C8 | Dashboard „Mein Bereich": laufende/bald startende Freizeiten (≤ 7 Tage), offene Hinweise/Absprachen, kommende Freizeiten zum Bewerben, jüngste Absprachen, knappe Lebensmittel. | `fz` | **Neu** → eine Startseite „Heute" (siehe Abschnitt H). |
| C9 | Vergangene Freizeiten der Leitung wandern in ein einklappbares Archiv. | `fz` | **Behalten**. |
| C10 | Farbkennzeichnung je Freizeit (abgeleitet aus ID). | `fz` | **Behalten** (aus ID abgeleitet oder wählbar). |
| C11 | **Lebensmittel-Inventar** nur für Leitung/Koordination: Eingänge (Name, Menge, Einheit, Datum), Verbrauch (je Tag), Restbestand, Warnung „bald leer" (≤ 25 % von erhalten) / „leer", Hochrechnung „reicht voraussichtlich nicht" (Ø Verbrauch × Resttage). Bestand liegt **am Ort**, so dass aufeinanderfolgende Freizeiten am selben Ort den Bestand fortführen. | `fz` | **Behalten**. Freizeit ohne Ort: Ort ist künftig Pflicht für das Lebensmittel-Modul (Vereinfachung, O4). |
| C12 | Koordinations-Dashboard: Bewerbungen, Vorschläge, Notizen/Nachrichten (mit „gelesen"-Markierung), Lebensmittel-Übersicht, aktuelle Freizeiten, Saison-Gruppierung. | `fz` | **Neu** → siehe Abschnitt H. |
| C13 | Gruppierung nach Ferienzeitraum/-woche mit Farbpunkt; Sortierung nach Start, dann Name. | `fz` | **Behalten**. |
| C14 | Freizeit löschen räumt Zuordnungen auf. | `fz` | **Behalten** (Kaskade in der Datenbank). |
| C15 | Live-Synchronisierung: Änderungen anderer erscheinen sofort. | `fz` | **Behalten** (Supabase Realtime). |

## D. Treffs

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| D1 | Stammdaten: Name, Ort (ein Ort gehört höchstens einem Treff), Adresse, Öffnungstage (Mo–So), **Öffnungszeit je Tag als Freitext** („15:00–19:00 Uhr"). | `tf` | **Neu** → Öffnungszeit strukturiert (von/bis), weil Stunden daraus berechnet werden. |
| D2 | Wochenprogramm: **ein** Programmpunkt pro Öffnungstag (Katalog oder Freitext), Notiz; wiederkehrend (nicht datiert). | `tf` | **Behalten**. |
| D3 | Absprachen (nur Treffleitung legt an; BetreuerInnen bestätigen), optional an ein Datum gekoppelt (Badge im Dienstplan). Keine Hinweise-vs.-Absprachen-Trennung. Absprachen-Bereich startet eingeklappt. | `tf` | **Behalten**. |
| D4 | „Neu seit letztem Besuch" (Punkt am Reiter Dienstplan / bei Absprachen) – rein lokal per Zeitstempel. | `tf` | **Neu** → serverseitiger „gelesen bis"-Stand je Person (funktioniert geräteübergreifend). |
| D5 | „Heute-Fokus" und Sticky-Anzeige des Dienstplans. | `tf` | **Behalten** (Startseite „Heute"). |
| D6 | Treff-Team (Treffleitung/BetreuerIn). | `tf`, `mt` | **Behalten**. |
| D7 | Treff löschen entfernt Zuordnungen, **lässt aber den Dienstplan (Subcollection) zurück** (bekannte Lücke). | `tf` | **Behalten** als Kaskade – Lücke entfällt. |

## E. Dienstplan & Nachweise (Treffs)

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| E1 | Dienstplan **je ISO-Kalenderwoche** (`2026-W08`): Wochenansicht mit Karte je Öffnungstag (Datum, Öffnungszeit, zugeteilte Personen als Farb-Chips, Feiertags- und Absprachen-Badge, „Abwesend: …"). Woche blättern/„Heute". Wochendokument entsteht erst, wenn die Treffleitung zuteilt. | `tf` | **Neu** → Dienste als Zeilen je Datum (kein Wochendokument). |
| E2 | Zuteilen (nur Treffleitung/Koordination): Personalliste, Treffleitung zuerst; zeigt Abwesende. | `tf` | **Behalten**. |
| E3 | **Wunschdienste:** BetreuerIn wünscht einen Tag (zurücknehmbar), Treffleitung bestätigt/lehnt ab, Antwort wird der Person angezeigt („Wunsch bestätigt/abgelehnt"). Push an Treffleitung bzw. an die Person. | `tf`, `push` | **Behalten**. |
| E4 | **Sonderdienste** („außerordentlicher Dienst"): Datum, Zeit, Bezeichnung, Personen; eigener Kartenstil mit Warnfarbe; erscheint auch an Tagen ohne Öffnungstag; wird beim Datumswechsel in die richtige Woche verschoben. | `tf` | **Behalten**. |
| E5 | **Monatsmuster:** je Wochentag Personen wählen → auf alle passenden Tage des Monats anwenden (ersetzt vorhandene Zuteilung dieses Wochentags, Bestätigungsdialog); darunter Kalender zum Nachjustieren einzelner Tage. | `tf` | **Behalten** (Massen-Einfügen). |
| E6 | Kalender- und Agenda-Ansicht für Monat; Wochen- und Monatsansicht umschaltbar. | `tf` | **Behalten**. |
| E7 | **Statistik:** je Person im Monat Anzahl Dienste und Stunden (Stunden aus Öffnungszeit; Sonderdienste aus Zeit). Zeigt auch Personen mit 0 Diensten. | `tf` | **Behalten**. |
| E8 | Dienstplan-Kommentare je Woche (Liste, anlegen/löschen); Push an alle im Treff. | `tf`, `push` | **Behalten**. |
| E9 | **Abwesenheiten** Urlaub/Krank je Person und Tag (Zeitraum wird in Einzeltage aufgelöst; nur Treffleitung/Koordination tragen ein). | `ta` | **Neu** → Abwesenheit gehört zur **Person** (gilt für alle Treffs/Freizeiten), nicht zum Treff. |
| E10 | **Feiertage** je Treff (Datum, Name), im Dienstplan sichtbar, im Nachweis vermerkt. | `ta` | **Neu** → Feiertage zentral pflegbar (gelten für alle Treffs), Einzelfall je Treff möglich. |
| E11 | **Nachweis der Teilzeitkräfte** (digitaler Nachbau von `Nachweis_Teilzeitkraefte.pdf`): je Treff/Monat/Person; Zeilen werden aus Dienstplan (reguläre + Sonderdienste, mit Feiertagsvermerk) und Abwesenheiten (Stunden aus üblicher Öffnungszeit) automatisch befüllt, „Aus Dienstplan aktualisieren"; Zeiten „14:00 - 17:30" berechnen Stunden; Zeilen frei änderbar; Summe; Unterschrift als Text; PDF-Export (A4, `JJ_MM_Nachname_Vorname`). **Gespeichert nur im localStorage des Geräts.** | `dn` | **Neu** → in der Datenbank, mit Status (Entwurf → eingereicht → von Treffleitung freigegeben). PDF-Export behalten. |

## F. Mappen & Lernen

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| F1 | **Teamermappe:** bis zu 10 Kacheln (Titel, Beschreibung, Icon/Farbe aus 10 Vorgaben, Stichpunkte, Freizeit-Tags), 3 Qualitäts-Standards, FAQ (10 Einträge als Start), Notfall-Text mit Nummern; Volltextsuche mit Hervorhebung; Kacheln einklappbar; Kacheln ohne passenden Tag werden für betroffene TeamerInnen **zurückgestuft** (nicht ausgeblendet). Admin bearbeitet im Edit-Modus (hoch/runter, hinzufügen/entfernen, Speichern). | `tm` | **Behalten**. Standardtexte bleiben als Seed-Inhalt. |
| F2 | **Treffmappe:** wie F1, aber ohne Tags und ohne Formulare; Sichtbarkeit: Koordination, Treffleitung, Kategorie TZK. | `tfm` | **Behalten**. Sichtbarkeit künftig serverseitig. |
| F3 | **Formulare** (5 Vordrucke): Anwesenheitsliste, Tagesbericht, Unfallbericht, Bescheinigung Abholen, Stundenmeldung. Jeweils ausfüllbar, als PDF exportierbar, Original-PDF (leer) zum Download, Entwurf lokal gespeichert, „auf Beispiel zurücksetzen". Die **Beispiele** (mit Musternamen) sind von der Koordination bearbeitbar. | `tm` | **Behalten**. Entwürfe optional in der Datenbank (O5). Hinweis: Anwesenheitsliste enthält Kindernamen → nur lokal/PDF, nicht speichern. |
| F4 | **Quiz** (`quiz.html`, eigene Seite): 6 Themen (Aufsicht & Abholung, Datenschutz, Tagesablauf, Kleidung/Verhalten/Regeln, Schwimmen & Wasser, Gesundheit & Auffälligkeiten), Fragen mit mehreren Antworten (Einzel- oder Mehrfachwahl), Erklärung, Fortschrittsbalken, Bestwert lokal; Koordination pflegt Fragen (Fallback-Fragen, wenn Datenbank leer). | `quiz.html` | **Behalten** als Modul „Lernen" in der App (nicht eigene Seite). Bestwerte je Person in DB (O5). Quiz-Oberfläche nur überblickt. |

## G. Katalog (Programmpunkte)

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| G1 | Programmpunkt: Name, Kategorie (Kennenlernspiele, Bewegungsspiele, Wasserspiele, Plan-B-Spiele, Kreativangebote, Highlights), Dauer, Gruppengröße, Alter (Mehrfach: 6–8, 9–12, …), Personalbedarf, Wetter (indoor/outdoor/beides), Raum, Material, Vorbereitung, Umsetzung, Nachbereitung, Autor. | `kat` | **Behalten**. |
| G2 | Filter (Kategorie, Wetter, Alter), Suche (Name, Umsetzung, Material, …), Karten-/Listenansicht, einklappbare Kategorien, Schnellzugriff-Chips. | `kat` | **Behalten**. |
| G3 | Favoriten (nur lokal), Teilen per Link `#id`, Druckansicht. | `kat` | **Neu** → Favoriten je Person in der DB; Teilen/Druck behalten. |
| G4 | „Ähnliche Programmpunkte" per Textvektor (TF-IDF/Kosinus, clientseitig). | `kat` | **Behalten**, später ggf. per Postgres-Volltextsuche. |
| G5 | Bewertungen (1–5 Sterne, **anonym je Gerät**), Kommentare (anonym), Durchschnitt/Anzahl als Badge. | `kat`, `rules` | **Neu** → je Person (eine Bewertung pro Person und Angebot). Kommentare mit Namen, Löschen durch Koordination/Autor. |
| G6 | Vorschläge: TeamerIn/Leitung reicht Programmpunkt ein (Status offen) → Koordination bearbeitet, übernimmt (Kopie in Katalog) oder lehnt ab (bleibt dokumentiert); Badge offene Vorschläge; Push an Koordination. | `kat`, `mt`, `push` | **Behalten**. |
| G7 | Katalog als PDF exportieren (alle/einzelne Einträge); Word-Import (.docx via mammoth) füllt das Formular vor. | `kat-export-import` | **Behalten** (beides selten, aber genutzt). |
| G8 | Persönlicher **Planer**: lokale „Vorlagen" (Pläne mit Tagen/Slots/Abend), Programmpunkte zuweisen, Materialübersicht, Drucken; im Picker „Aus meinen Vorlagen". Lokal (`localStorage`). | `helpers-planner` | **Streichen** (Entscheidung 2026-09-30: Planer wird nicht benötigt). **Favoriten (G3) bleiben.** |
| G9 | Katalog war **öffentlich lesbar** (kein Login). | `rules` | **Neu** → nur für Angemeldete (intern). |

## H. Mitteilungen

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| H1 | Push (FCM, nur Daten-Payload, damit nicht doppelt angezeigt): **neuer Hinweis** (alle der Freizeit) / **neue Absprache** (Leitung der Freizeit + Koordination); **Treff: neue Absprache** (alle), **Dienstplan geändert**, **neuer Kommentar**, **neuer Wunschdienst** (→ Treffleitung), **Wunsch beantwortet** (→ Person); **neue Bewerbung** und **neuer Vorschlag** (→ Koordination). | `push` (Functions) | **Behalten** → Web-Push (VAPID) über Edge Function/DB-Trigger. |
| H2 | Manueller Push der Koordination an: Freizeit (optional nach Rolle), Treff (optional nach Rolle), Kategorie (Leitung/TeamerInnen), Koordination, alle; mit Empfängervorschau. | `push` | **Behalten**. |
| H3 | Aktivierungs-Banner Push und Installations-Banner (Android-Prompt / iOS-Anleitung). Ungültige Tokens werden automatisch entfernt. | `push` | **Behalten**. iOS: Web-Push nur bei installierter Home-Screen-App (wie bisher). |

## I. Betrieb & Sonstiges

| ID | Was der Altcode tut | Quelle | Entscheidung |
|---|---|---|---|
| I1 | Offline-Caching per Service Worker (zugleich Messaging-SW). | `firebase-messaging-sw.js` | **Behalten** (PWA). |
| I2 | Impressum (`impressum.html`). | | **Behalten** + Datenschutzerklärung (neu). **Umgesetzt** (Phase 4): `/impressum` und `/datenschutz`, ohne Anmeldung erreichbar, Texte in `src/pages/recht/`. |
| I3 | Datenpflege-Overlay (Backup-Import / Duplikate / Katalog-Export). | `bk` | **Neu** → Admin-Bereich „Daten": Export (Personen, Freizeiten …), Import nach Bedarf; automatische DB-Backups per GitHub-Action. |
| I4 | Firestore-Rules-Datei musste manuell in die Konsole kopiert werden. | `rules` | **Streichen** – Migrationsdateien im Repo, per CLI ausgerollt. |

---

## Startseite „Heute" (neu, ersetzt die Dashboards C8/C12/D5)

Eine rollenabhängige Startseite statt fünf getrennter Dashboard-Fragmente:

- **Alle:** „Was läuft heute/diese Woche bei mir?" (meine Freizeit/mein Treff, Dienste), ungelesene Hinweise/Absprachen
- **Leitung/Treffleitung zusätzlich:** offene Wunschdienste, knappe Lebensmittel, nicht bestätigte Hinweise im Team
- **TeamerIn ohne Zuordnung:** kommende Freizeiten zum Bewerben
- **Koordination zusätzlich:** offene Bewerbungen, Vorschläge, neue Absprachen-Kommentare, Saison-Überblick

---

## Offene Entscheidungen (mit Empfehlung)

| # | Frage | Empfehlung |
|---|---|---|
| ~~O1~~ | **Entschieden:** KiJuKo2.1 bleibt im Einsatz, der Import bleibt und wird erweitert. | Siehe [IMPORT.md](IMPORT.md). |
| ~~O2~~ | **Entschieden:** Koordination darf die Rolle je Einsatz frei ändern (Kategorie nur als Vorbelegung). | – |
| ~~O3~~ | **Entschieden:** Kontaktdaten/Ernährung/Notizen nur für Leitung (+ Koordination); TeamerInnen sehen Namen und Rollen. | – |
| O4 | Lebensmittel-Bestand nur **am Ort** (Ort wird für das Modul Pflicht)? Heute gibt es zusätzlich den Sonderfall „Freizeit ohne Ort". | Ja, Pflicht-Ort. Einfacher und fachlich sauberer. |
| O5 | Sollen **Formular-Entwürfe** und **Quiz-Bestwerte** je Person gespeichert werden (geräteübergreifend) oder weiter nur lokal? | Quiz: ja (leicht). Formulare: Entwürfe ja, aber Anwesenheitslisten mit Kindernamen nie serverseitig. |
| ~~O6~~ | **Entschieden:** Planer entfällt, Favoriten bleiben. | – |
| O7 | Soll die **Frist 7 Tage** für Bewerbungen fest bleiben? | Einstellung in der App. |
| O8 | **Datenschutz:** Gibt es eine Datenschutzfolgenabschätzung/Verarbeitungsverzeichnis beim Träger? Supabase-Auftragsverarbeitung (EU) muss abgeschlossen werden. | Vor Produktivstart klären, nicht blockierend für den Bau. |

---

## Nachtrag: Personen entfernen (2026-09-30)

| ID | Was | Entscheidung |
|---|---|---|
| B11 | Die Koordination kann Personen **deaktivieren** (sofort gesperrt, Daten bleiben, umkehrbar), ihnen den **Zugang entziehen** (Login weg, Person bleibt) oder sie **endgültig löschen** (Person, Login und alle zugehörigen Daten; verfasste Hinweise/Absprachen bleiben ohne Namen). Vor dem Löschen zeigt die App, was mitgeht, und verlangt den Nachnamen zur Bestätigung. | **Neu, umgesetzt.** Schutz: nicht sich selbst, nie die letzte aktive Koordination (auch nicht per Dashboard/SQL). Hinweis: Zeitnachweise können aufbewahrungspflichtig sein – im Zweifel deaktivieren statt löschen. |

---

## Stand der Umsetzung: Freizeiten (Phase 3b, 2026-09-30)

**Umgesetzt und getestet:** C1 (Stammdaten, Formular für die Koordination), C2 (Schlagworte), C3 (Orte verwalten, nicht löschbar solange verwendet),
C4/C5 (Wochenplan: Tage × Zeitabschnitte, mehrere Einträge je Zelle, Katalog-Punkt oder Freitext der Leitung, Notiz, Abend-Zeitabschnitt, Reihenfolge),
C6/C7 (Hinweise mit „gesehen"-Bestätigung und Stand für die Leitung; Absprachen mit Bestätigung und Kommentaren; je Tag oder für die ganze Freizeit),
C9 (vergangene Freizeiten im eigenen Reiter), C11 (Lebensmittel am Ort mit Ampel und Hochrechnung), C13 (Gruppierung nach Ferienzeit), C14 (Löschen mit Kaskade und Namensbestätigung),
C15 (Live-Aktualisierung über Supabase Realtime), B7/B8 (Team-Ansicht mit rollenabhängigen Kontaktdaten, Zuordnung und Rollen durch die Koordination),
B9 (Bewerbung und Zurückziehen, Entscheidung durch die Koordination), Startseite „Meine Freizeiten", Verpflegung und Material aus KiJuKo (nur lesbar).

**Noch offen (bewusst später):**
- C8/C12 vollständige Startseite „Heute" mit offenen Hinweisen, knappen Lebensmitteln, Koordinations-Überblick (heute nur „Meine Freizeiten").
- C10 Farbe je Freizeit (Logik vorhanden, noch nicht eingebunden).
- „Neu seit letztem Besuch" (D4 bei Treffs) und Hinweis „gelesen" für die Koordination.
- Der **Katalog ist noch leer** (Phase 3, Bereich Katalog): Bis dahin tragen Leitungen im Wochenplan Freitext ein, TeamerInnen sehen einen Hinweis.
- Push-Benachrichtigungen bei neuen Hinweisen/Absprachen (Bereich Mitteilungen).

## Stand der Umsetzung: Treffs (Phase 3c, 2026-09-30)

**Umgesetzt und getestet:** D1 (Stammdaten und strukturierte Öffnungszeiten je Wochentag, Formular für die Koordination, Löschen mit Kaskade und Namensbestätigung),
D2 (Wochenprogramm: ein Programmpunkt je Öffnungstag, Katalog oder Freitext, Notiz), D3 (Absprachen der Treffleitung, optional an einen Tag gekoppelt, von allen im Treff bestätigt),
D6 (Team mit rollenabhängigen Kontaktdaten und TZK-Angaben; Zuordnung und Rollen durch die Koordination, nur zulässige Kategorien), D7 (Kaskade),
E1 (Dienstplan je Kalenderwoche mit Karte je Öffnungstag, Feiertags- und Absprachen-Badge, Abwesenden), E2 (Zuteilen durch Treffleitung/Koordination, Abwesende werden markiert),
E3 (Wunschdienste: wünschen, zurücknehmen, bestätigen = zugleich einteilen, ablehnen, erneut wünschen nach Ablehnung), E4 (Sonderdienste, auch an Schließtagen),
E5 (Monatsmuster mit Rückfrage, wie viele Tage ersetzt werden), E6 (Monatsübersicht als Liste), E7 (Statistik Dienste und Stunden je Person und Monat),
E8 (Wochenkommentare), E9 (Abwesenheiten Urlaub/Krank je Person und Zeitraum, gelten für alle Einsätze), E10 (Feiertage je Treff oder – Koordination – für alle Treffs),
E11 (Nachweis der Teilzeitkräfte in der Datenbank: Zeilen aus Dienstplan und Abwesenheiten vorbefüllt, frei änderbar, Summe, Unterschrift als Text,
Entwurf → eingereicht → freigegeben, PDF über den Druckdialog des Browsers mit Dateiname `JJ_MM_Nachname_Vorname`), Startseite: „Meine Treffs“ und „Meine Dienste“ der nächsten 14 Tage.

**Neu gegenüber dem Altcode (bewusste Entscheidungen):**
- Ein Wunsch für einen Tag ohne Dienst legt den Dienst über eine Datenbankfunktion an (BetreuerInnen dürfen sonst keine Dienste anlegen).
- Zuteilungen sind nur für Personen des Treffs möglich – auch bei direkten Schreibzugriffen (Datenbank-Regel).
- Zeilen des Nachweises, die man ändert, gelten danach als manuell und bleiben beim „Aus Dienstplan aktualisieren“ erhalten (ggf. doppelte Zeilen löschen).
- Den Nachweis führen nur Personen der Kategorie TZK; Treffleitung und Koordination prüfen, geben frei und können zur Überarbeitung zurückgeben.

**Noch offen (bewusst später):**
- Kalenderansicht des Monats (heute: Liste), „Neu seit letztem Besuch“ (D4), Push bei Dienständerungen, neuen Wünschen und Kommentaren (Bereich Mitteilungen).
- Wochenprogramm kann laut Datenbank jede Person des Treffs ändern; die Oberfläche beschränkt es auf Treffleitung und Koordination (bei Bedarf lockern).

## Stand der Umsetzung: Mappen, Formulare und Quiz (Phase 3d, 2026-09-30)

**Umgesetzt und getestet:** F1 (Teamermappe: Themenkacheln mit Symbol, Beschreibung und Punkten, Qualitäts-Kodex, FAQ, Notfall-Box, Volltextsuche mit Hervorhebung,
einklappbare Kacheln, Zurückstufen von Kacheln nach Schlagworten der eigenen Freizeiten, Bearbeiten durch die Koordination mit Reihenfolge, Hinzufügen und Entfernen, höchstens 10 Kacheln),
F2 (Treffmappe: wie die Teamermappe ohne Schlagworte; sichtbar für Koordination, Treffleitung und TZK im Treff – Regel der Datenbank, Seite leitet sonst zur Startseite),
F3 (fünf Formulare: Eingabe, Beispiel mit Musternamen, „Beispiel wiederherstellen“, „Vordruck leeren“, Original-PDF zum Download, Druck als A4-PDF über den Browser;
Entwürfe werden automatisch in der Datenbank gespeichert und sind nur für die Person sichtbar – **außer der Anwesenheitsliste**, die Namen von Kindern enthält und nie gespeichert wird;
die Koordination pflegt die Beispiele für alle), F4 (Quiz zu sechs Themen: Einzel- und Mehrfachauswahl, Erklärung, Fortschritt, Ergebnistext, **Bestwert je Person in der Datenbank**;
Koordination: Fragen anlegen, ändern, löschen, Standardfragen übernehmen, Bestwerte aller Personen ansehen).

**Bewusste Entscheidungen:**
- Die Standardtexte der Mappen und die 35 Standardfragen des alten Quiz liegen im Programm und gelten, solange nichts gespeichert ist; beim ersten Speichern werden sie in die Datenbank übernommen.
- Der Quiz-Bestwert zählt nach Anteil (nicht nach Anzahl), damit eine geänderte Fragenzahl den Vergleich nicht verfälscht.
- Eine geänderte Standardfrage (vor der Übernahme) wird als neue Frage angelegt; Standardfragen lassen sich erst nach der Übernahme löschen.
- Eine Datenbank-Änderung war dafür nicht nötig.

**Hinweis:** Bearbeiten mehrere Personen gleichzeitig Mappe oder Beispiele, gewinnt der zuletzt gespeicherte Stand.

## Stand der Umsetzung: Katalog (Phase 3e, 2026-09-30)

**Umgesetzt und getestet:** G1 (alle Felder eines Programmpunkts), G2 (Suche über Name, Umsetzung, Material, Vorbereitung, Nachbereitung, Raum, Personal, Dauer, Gruppe, Autor und Alter – Umlaute und Groß-/Kleinschreibung egal;
Filter nach Kategorie, Wetter, Alter und Favoriten; einklappbare Kategorien mit Anzahl), G3 (Favoriten je Person in der Datenbank, Teilen per Link, Druck/PDF einzelner Programmpunkte und der gefilterten Liste),
G4 (ähnliche Programmpunkte per Textvergleich im Browser), G5 (Bewertung 1–5 Sterne je Person, Durchschnitt und Anzahl; Kommentare mit Namen, Löschen durch Verfasser und Koordination),
G6 (Vorschläge: alle reichen ein, die Koordination korrigiert, übernimmt oder lehnt ab; Einreichende sehen den Stand ihrer Vorschläge), G7 (Import: Word-Pläne füllen das Formular vor; neu: JSON-Import mit Vorschau und Erkennung von Doppelten),
G9 (nur für Angemeldete). Die Koordination legt Programmpunkte an, ändert und löscht sie.

**Bewusste Entscheidungen:**
- Kommentare zeigen den Namen der Schreibenden, auch wenn man kein Team teilt (eigene Sicht `v_angebot_kommentare`, Migration `0013`; aus dem Profil kommen nur Vor- und Nachname).
- Der Import erkennt die Feldnamen des alten und des neuen Katalogs. Wer den alten Katalog übernehmen will, exportiert die Sammlung `angebote` aus Firestore als JSON und lädt sie unter „Katalog → Importieren“ hoch. Er wird nicht automatisch migriert.
- Die Bibliothek zum Lesen von Word-Dateien (mammoth) wird erst beim ersten Word-Import nachgeladen.
- Wird ein Programmpunkt gelöscht, der in einem Wochenplan (Freizeit oder Treff) steht, bleibt der Eintrag dort mit dem Namen als Freitext erhalten (Migration `0013`).

**Noch offen (bewusst später):** „Teilen“ als fertiger Nachrichtentext, Push bei neuen Vorschlägen an die Koordination (Bereich Mitteilungen), Volltextsuche in der Datenbank statt im Browser (erst bei sehr großem Katalog nötig).

## Stand der Umsetzung: Betrieb (Phase 4, 2026-09-30)

**Umgesetzt und getestet:** Sicherheitsköpfe und Zwischenspeicher für Cloudflare Pages (`public/_headers`, u. a. Content-Security-Policy ohne `unsafe-eval` und ohne fremde Skripte), Prüfung der veröffentlichten Seite (`npm run check:site`),
Lebenszeichen gegen das Pausieren von Supabase (Migration `0014`, `keepalive.yml`), wöchentliche verschlüsselte Datensicherung (`backup.yml`), Fehlerseite statt weißer Seite (`FehlerGrenze`), Versionsanzeige unter „Mehr“,
Impressum und Datenschutzhinweise, Betriebsanleitung mit Checkliste und Wiederherstellung (`docs/BETRIEB.md`).

**Bewusste Entscheidungen:**
- Sicherungen werden immer verschlüsselt (AES-256) und nur so abgelegt; ohne Passwort bricht der Lauf ab, weil Artefakte in öffentlichen Repositories für angemeldete GitHub-Nutzer abrufbar wären.
- Gesichert wird per Session-Pooler-Adresse (GitHub Actions hat nur IPv4; die direkte Datenbankadresse ist IPv6).
- Die Source-Maps werden nicht mehr veröffentlicht.
- Die einzige ohne Anmeldung ausführbare Datenbankfunktion ist `fn_ping` (Test stellt das sicher). Dabei wurde eine Trigger-Funktion aus Migration `0009` nachträglich für „public“ gesperrt.

**Nicht erprobt:** Die Datensicherung und die Wiederherstellung konnten nicht gegen ein echtes Supabase-Projekt laufen (brauchen deine Zugangsdaten); die Schritte sind in `docs/BETRIEB.md` beschrieben und sollten einmal als Probe durchgespielt werden.

**Noch offen:** Mitteilungen per Web-Push, vollständige Startseite „Heute“.

## Stand der Umsetzung: Mitteilungen (Phase 5, 2026-09-30)

**Umgesetzt und getestet:** H1 (Mitteilungen bei neuem Hinweis – an das Team der Freizeit; neuer Absprache – an Leitung und Koordination; Treff-Absprache – an alle im Treff; Dienstplan geändert – an die betroffenen Personen
(auch beim Monatsmuster und bei Sonderdiensten); neuem Dienstplan-Kommentar; neuem Dienstwunsch – an die Treffleitung; beantwortetem Wunsch – an die Person; neuer Bewerbung und neuem Katalog-Vorschlag – an die Koordination),
H2 (manuelle Mitteilung der Koordination an alle, Koordination, alle Leitungen, alle TeamerInnen/BetreuerInnen, eine Freizeit oder einen Treff – jeweils optional nur Leitung bzw. nur TeamerInnen – mit Vorschau, wer erreicht wird und wie viele ein Gerät eingeschaltet haben),
H3 (Einschalten, Testen und Ausschalten je Gerät unter „Mehr“; Hinweis für iPhone/iPad; ungültige Geräte werden automatisch entfernt), Testmitteilung an sich selbst.

**Bewusste Entscheidungen:**
- Empfänger, Text und Zulässigkeit entscheidet die **Datenbank** (nicht die Edge Function und nie die Oberfläche): nur eigene, frische Vorgänge (höchstens 10 Minuten alt), Bremse gegen Wiederholung (2 Minuten) und Massenversand (60 pro Stunde). Die Logik ist mit Datenbank-Tests abgesichert.
- Der Versand nutzt keine Fremdbibliothek, sondern den Web-Push-Standard (RFC 8291/8292) direkt; Verschlüsselung und Anmeldung sind gegen den Testvektor der RFC geprüft.
- Mitteilungen sind „best effort“: Scheitert nur die Mitteilung, bleibt die eigentliche Handlung (Hinweis, Wunsch …) gespeichert und die Bedienung ungestört.
- Wer sich abmeldet, meldet das Gerät für Mitteilungen ab. Wer die Mitteilungen einschaltet, bekommt immer ein frisches Abonnement.
- Keine Einstellung je Mitteilungsart (alles oder nichts je Gerät).

**Nicht erprobt:** Der Versand an echte Push-Dienste (Google, Mozilla, Apple) und die Anzeige auf echten Geräten konnten nicht getestet werden (brauchen die gehostete Seite und eure Schlüssel) – nach dem Einrichten bitte mit *Testmitteilung senden* prüfen, auch auf einem iPhone.

**Noch offen:** „Neu seit letztem Besuch“ (D4) und Ungelesen-Punkte, Einstellung je Mitteilungsart, vollständige Startseite „Heute“.

## Stand der Umsetzung: Startseite „Heute“ (Phase 6, 2026-09-30)

**Umgesetzt und getestet** (ersetzt die Dashboards C8, C12 und D5):
- **Schnellzugriff ganz oben:** Kacheln für alle Funktionen der eigenen Rollen, gruppiert nach „Freizeiten“, „Treffs“, „Wissen & Konto“ und – für die Koordination – „Verwaltung“ (eingeklappt, aufgeklappt sobald etwas offen ist). Kacheln führen direkt in den Reiter (z. B. Wochenplan, Hinweise, Dienstplan); bei mehreren Freizeiten bzw. Treffs klappt eine Auswahl auf. Zahlen an den Kacheln zeigen Offenes (Hinweise, Absprachen, knappe Lebensmittel, Dienstwünsche, Nachweise, Bewerbungen, Vorschläge, Dienste heute). Die Zuordnung Rolle → Kachel steht in `src/heute/kacheln.ts`.
- **Alle:** „Heute“ mit den laufenden Freizeiten samt dem Tagesprogramm aus dem Wochenplan und den Diensten des Tages; „Das wartet auf dich“ mit den Hinweisen (TeamerInnen: „gesehen“) und Absprachen (Leitung, Koordination, Treff-Team), die noch nicht bestätigt sind, je Freizeit bzw. Treff mit Link;
  „Meine Freizeiten“, „Meine Treffs“ und „Meine nächsten Dienste“ (14 Tage); Einladung, Mitteilungen einzuschalten (auf dem iPhone: die App zum Home-Bildschirm hinzufügen), wegklickbar.
- **Leitung:** knappe und leere Lebensmittel an den Orten der aktuellen Freizeiten (mit Link zum Lebensmittel-Reiter) und Hinweise, die noch nicht alle TeamerInnen gesehen haben.
- **Treffleitung:** offene Dienstwünsche je Treff, frühester Wunschtag, Link zum Dienstplan.
- **TeamerIn ohne Einsatz oder mit Lust auf mehr:** die nächsten Freizeiten, für die man sich noch bewerben kann (Vorlauf beachtet), und der Hinweis auf eigene offene Bewerbungen.
- **Koordination:** offene Bewerbungen und Katalog-Vorschläge mit Zahl und Link, Warnung „Freizeit ohne Leitung“, Saison-Überblick der laufenden und der in zwei Wochen beginnenden Freizeiten nach Ferienzeit; außerdem alles Obige für alle aktuellen Freizeiten und Treffs.

**Bewusste Entscheidungen:**
- Jede Karte erscheint nur, wenn es etwas zu zeigen gibt; ein Fehler in einer Karte stört die anderen nicht.
- Was jemand sehen darf, entscheidet wie immer die Datenbank; die Startseite fragt nur nach dem, was zur Rolle gehört.
- Hinweise gelten als „offen“, bis man sie selbst bestätigt hat (statt „neu seit dem letzten Besuch“). Notizen für einen vergangenen Tag erledigen sich von selbst.
- Lebensmittel werden nur für Orte gezeigt, an denen gerade eine Freizeit läuft oder in zwei Wochen beginnt – alte Restbestände früherer Freizeiten stören nicht.

**Noch offen:** „Neu seit letztem Besuch“ (D4) und Kommentare zu Absprachen als Hinweis für die Koordination, Farbe je Freizeit (C10).

## Stand der Umsetzung: Tagesprotokoll und Notizen der Treffs (Phase 7, 2026-09-30)

**Umgesetzt und getestet** (Migration `0016`, neue Reiter im Treff: *Tagesprotokoll* und *Notizen*):
- **Tagesprotokoll** je Treff und Öffnungstag: Anzahl der Kinder nach **m / w / d** (Zähler mit + und −, Gesamtzahl automatisch; nur Zahlen, keine Namen), *Was war los?* und *Besondere Vorkommnisse*.
  Das **ganze Team** (und die Koordination) darf jederzeit lesen und bearbeiten, auch Protokolle anderer; angezeigt wird, wer zuletzt bearbeitet hat. Löschen dürfen nur Treffleitung und Koordination.
  Ein Protokoll gibt es je Treff und Tag nur einmal, nicht für die Zukunft; es lässt sich nachtragen („Anderen Tag nachtragen“). Fehlende Öffnungstage der letzten zwei Wochen werden aufgelistet (Feiertage ausgenommen).
- **Notizen und Listen** je Treff: To-do, Einkauf, offene Frage, Sonstiges. Sie bleiben, bis jemand sie erledigt (Haken; wer und wann wird vermerkt). To-dos und Sonstiges haben optional Fälligkeit (überfällig wird markiert) und Zuständigkeit (nur aus dem Team),
  Einkauf nur Text und Haken, offene Fragen werden mit einer **Antwort** erledigt, die lesbar bleibt. Filter nach Art mit Zahlen, Erledigtes eingeklappt (nach 30 Tagen ausgeblendet). Aus dem Protokoll heraus lässt sich nebenbei eine Notiz anlegen.
- **Auswertung** (Treffleitung, Koordination): Kinder je Monat und Jahr nach m/w/d mit Summe, Durchschnitt je Tag und Anteilen, dazu **CSV-Export** (Excel-tauglich, gegen Formel-Einschleusung geschützt).
- **Startseite:** Kacheln *Tagesprotokoll* (Zahl = Treffs, für die heute geöffnet ist und das Protokoll noch fehlt) und *Notizen* (Zahl offener Einträge), außerdem die Karte *Tagesprotokoll fehlt* mit Link, sobald die Öffnungszeit begonnen hat.
- **Erinnerung per Mitteilung:** abends „Tagesprotokoll fehlt“ an Treffleitung und die heute Eingeteilten, einmal pro Treff und Tag, 15 Minuten bis 3 Stunden nach Ende der Öffnung, nicht an Feiertagen. Ein GitHub-Zeitplan (`erinnerung.yml`) ruft dafür die Edge Function `push-senden` mit einem eigenen Geheimnis
  (`CRON_SECRET`) auf; das Geheimnis erlaubt nur diese Erinnerung. Einrichtung: `docs/BETRIEB.md`, Abschnitt 2c.

**Bewusste Entscheidungen:**
- Keine Altersgruppen (nicht benötigt), keine Namen von Kindern – die Datenbank speichert nur Zahlen und Freitext; unter „Vorkommnisse“ steht der Hinweis, keine Namen einzutragen.
- Vorkommnisse sind für das ganze Team sichtbar, damit Übergaben zwischen Diensten funktionieren.
- Wer zuletzt speichert, gewinnt: Bearbeiten zwei Personen gleichzeitig dasselbe Protokoll, überschreibt die spätere Speicherung die frühere (die Liste aktualisiert sich live, ein geöffnetes Formular nicht).
- Die Regeln (Zukunft verboten, Verfasser nicht fälschbar, „erledigt“ nicht vortäuschbar, Zuständige nur aus dem Team) stehen in der Datenbank, nicht nur in der Oberfläche.

**Noch offen:** Erinnerung auch an Personen, die einen Dienst getauscht haben (derzeit: laut Dienstplan Eingeteilte), Protokoll-Vorlagen je Wochentag, Auswertung über mehrere Treffs zugleich.


## Stand der Umsetzung: Zuordnung von Personen zu Freizeiten und Treffs (Phase 8, 2026-09-30)

**Umgesetzt und getestet** (keine Datenbankänderung; nur die Koordination ordnet zu, wie bisher):
- **Tabelle in „Personen“:** Umschalter *Liste | Zuordnungen*. In der Ansicht *Zuordnungen* ist es dieselbe Personenseite mit derselben Suche, dazu ein Filter nach Kategorie und eine Spalte je Freizeit und je Treff.
  Jede Zelle ist eine Auswahl („–“, TeamerIn, Leitung bzw. BetreuerIn, Treffleitung): ordnet zu, ändert die Rolle oder entfernt. Der Name der Person bleibt beim Querscrollen stehen, die Kopfzeile auch.
  Zeitraum: standardmäßig laufende und kommende Freizeiten, wählbar „Alle aus <Jahr>“. Deaktivierte Personen erscheinen nur auf Wunsch. Abgesagte Freizeiten gibt es nicht als Spalte.
- **Planungshilfen in der Tabelle:** Kopf je Freizeit mit Zeitraum, Zahl Leitung/Team und Warnung „Keine Leitung“; **Überschneidungen** (dieselbe Person in zwei Freizeiten zur selben Zeit) werden an der Person und an den Zellen markiert, beim Zuordnen erscheint ein Hinweis.
  Kategorien, die keinem Treff zugeordnet werden dürfen, sind in den Treff-Spalten gesperrt.
- **Fenster je Person** („Zuordnungen“ in der Liste, Klick auf den Namen in der Tabelle): alle Freizeiten und Treffs der Person als Liste mit Auswahl – gedacht fürs Handy, wo die Tabelle zu breit ist; vergangene Freizeiten auf Wunsch.
- **Mehrere Personen auf einmal im Reiter „Team“** (Freizeit und Treff): durchsuchbare Liste mit Kategorie-Filter und Häkchen, eine Rolle für alle Ausgewählten, „N Personen zuordnen“ (alle oder keine). In der Freizeit steht bei jeder Person, ob sie zur selben Zeit schon woanders eingeteilt ist.
- Änderungen erscheinen sofort und bei anderen live (Realtime), Fehler werden angezeigt, ohne dass die Anzeige falsch wird.

**Noch offen:** Zuordnung durch die Leitung der eigenen Freizeit (bewusst nicht: nur Koordination), Rolle beim Annehmen einer Bewerbung wählen, Warnung beim Entfernen aus einem Treff, wenn noch Dienste eingeteilt sind.

## Stand der Umsetzung: Anzeigen und Mitteilungen je Rolle (Phase 9, 2026-09-30)

Die Festlegung steht in `docs/ANZEIGEN_UND_MITTEILUNGEN.md`. **Neu umgesetzt und getestet** (Migration `0017`):
- **Bewerbung angenommen** → Mitteilung an die Person (Absage ohne Mitteilung).
- **Nachweis eingereicht** → Mitteilung an die Treffleitung des Treffs (ohne Treffleitung an die Koordination). „Freigabe aufheben“ löst nichts aus.
- **Lebensmittel knapp oder leer** → Mitteilung an die Koordination, die nachkauft – nach einer Verbrauchsbuchung, je Artikel und Stand (knapp/leer) höchstens einmal in 24 Stunden, nie an die buchende Person selbst.
- Das Tagesprotokoll löst **keine** Mitteilung an die Koordination aus (weder „geschrieben“ noch „fehlt“); die Erinnerung „Protokoll fehlt“ geht nur an Treffleitung und die heute Eingeteilten.
- Entschieden: keine Einstellung je Mitteilungsart, keine Ruhezeiten.

**Noch offen:** Ob die Koordination fachlich in Freizeiten- und Treff-Koordination getrennt werden soll (technisch bisher eine Rolle).

## Stand der Umsetzung: Koordination getrennt (Phase 10, 2026-09-30)

**Umgesetzt und getestet** (Migration `0018`): Die Koordination besteht aus zwei Bereichen, eine Person kann beide sein – Details und Zuständigkeiten in `docs/RECHTE.md` und `docs/ANZEIGEN_UND_MITTEILUNGEN.md`.
- **Freizeitenkoordination:** Freizeiten, Team, Bewerbungen, Lebensmittel, KiJuKo-Import, Absprachen der Freizeiten. **Treffkoordination:** Treffs, Team, Dienstplan, Nachweise, Tagesprotokolle, Notizen, Treff-Absprachen, Treffmappe.
  **Gemeinsam:** Personen und Zugänge (inkl. Vergabe der Koordination), Orte, Katalog, Quiz, Mappen, manuelle Mitteilungen (an eine Freizeit nur Freizeitenkoordination, an einen Treff nur Treffkoordination).
- Bestehende Koordinationen haben **beide** Bereiche erhalten – nichts ändert sich, bis die Bereiche getrennt vergeben werden. Vergeben wird unter *Personen* → „Zuordnungen“ einer Person (zwei Häkchen); in der Liste zeigen Schilder, wer welchen Bereich hat.
- **Datenbank:** getrennte Hilfsfunktionen, alle Zugriffsregeln, Sichten und Funktionen je Bereich umgestellt (ein Test prüft, dass nur die gemeinsam verwalteten Tabellen und Funktionen „irgendeine Koordination“ behalten haben); die letzte aktive Person **je Bereich** ist geschützt; „ist_koordination“ bleibt als abgeleitete Angabe „irgendein Bereich“ (Altcode, Import und Tests setzen es weiter und meinen dann beide Bereiche).
- **Oberfläche:** Startseite (Kacheln, Karten, Verwaltung), „Mehr“, Seiten- und Schaltflächenrechte, Mitteilungsziele und Navigation richten sich nach dem Bereich; nicht erlaubte Adressen führen zurück zur Startseite bzw. zur Liste.
- **Mitteilungen:** Bewerbung, Absprache (Freizeit) und Lebensmittel gehen an die Freizeitenkoordination, „Nachweis eingereicht“ ohne Treffleitung an die Treffkoordination, Katalog-Vorschläge an beide.

**Bewusst so:** Wer Koordination vergeben darf, ist jede der beiden Koordinationen (gemeinsame Personenverwaltung). Die Bereiche trennen die Zuständigkeit, sichern aber nicht gegeneinander ab.

## Stand der Umsetzung: Verbesserungen an Technik und Bedienung (Phase 11, 2026-10-01)

**Umgesetzt und getestet:**
- **Startseite in einem Aufruf (Migration `0020`):** Statt zehn Einzelabfragen holt die Startseite alles Übrige mit einer Datenbankfunktion (`fn_heute`, läuft mit den Rechten der Person; nur angefragte Teile werden berechnet). Die Datenbankfunktion ist mit Tests je Rolle abgesichert.
- **„Neu seit deinem letzten Besuch“:** siehe `docs/ANZEIGEN_UND_MITTEILUNGEN.md`, Abschnitt 4. Der Besuchsstand liegt je Person in der Datenbank (Tabelle `besuche`), damit er auf allen Geräten gilt.
- **Schnellerer Start:** Seiten werden erst beim Öffnen geladen; das Hauptpaket schrumpfte von 848 kB auf 343 kB (106 kB komprimiert).
- **Fehlermeldungen der App (Migration `0019`):** ohne Personendaten, gezählt, für die Koordination einsehbar (`docs/BETRIEB.md`, Abschnitt 3b).
- **Zeilenenden vereinheitlicht** (`.gitattributes`, `.editorconfig`).
- **Bewerbung mit Rollenwahl** (TeamerIn oder Leitung), **Warnung und Aufräumen beim Entfernen aus einem Treff** (Migration `0021`): Die Rückfrage nennt, in wie vielen künftigen Diensten die Person noch steht; beim Entfernen fallen künftige Dienste und offene Dienstwünsche weg, vergangene Dienste bleiben (Grundlage der Nachweise).
- **Gleichzeitiges Bearbeiten eines Tagesprotokolls:** Hat jemand anderes inzwischen gespeichert, erscheint eine Warnung mit Name und Zeit („Aktuelle Fassung laden“ oder „Meine Fassung trotzdem speichern“); nichts geht mehr still verloren. Zeiten erscheinen in Ortszeit (vorher UTC).
- **Barrierefreiheit:** automatische Prüfung der Hauptseiten mit axe-core (keine Verstöße gegen gängige Regeln), **Farbkontraste** nach WCAG 2.2 für helles und dunkles Farbschema (Text 4,5 : 1, Rahmen von Eingaben und Fokusring 3 : 1 – dafür wurden Rahmen, Hinweistext und Fokusring etwas kräftiger), **Fenster halten den Tastaturfokus** (Tab und Umschalt+Tab bleiben im Fenster).
- **Glas-Oberfläche mit Hell/Dunkel-Umschalter:** Weiche Farbwolken im Hintergrund, durchscheinende Karten, Milchglas nur in Kopf und schwebender Navigation (Lesbarkeit und Geschwindigkeit). Wahl „Wie Gerät / Hell / Dunkel“ unter *Mehr → Darstellung* und als Mond/Sonne-Knopf im Kopf; sie gilt nur im jeweiligen Browser (`src/theme/`, `public/theme-init.js` setzt sie vor dem ersten Zeichnen). Bei „Transparenz reduzieren“ oder hohem Kontrast des Geräts werden die Flächen deckend. Der Kontrasttest rechnet den schlechtesten Fall mit (Text auf Glas auf der stärksten Wolke).
- **Neue Startseite mit Feed und Kachelraster:** Alle sehen den Feed in drei Abschnitten – *Zu erledigen* (Protokoll fehlt, Hinweise und Absprachen zum Bestätigen, knappe Lebensmittel, Dienstwünsche), *Heute* (Dienste, laufende Freizeiten mit Tagesprogramm), *Neu seit deinem letzten Besuch*. Jede Karte ist ein Link zur passenden Seite. Die Koordination sieht darüber zusätzlich das *Kachelraster* mit Zahlen (offene Protokolle, Bewerbungen, Vorschläge, nächste Freizeit, Lebensmittel, Dienstwünsche, Nachweise, Fehlermeldungen); Freizeitenkoordination und Treffkoordination sehen jeweils ihre Kacheln. Der Schnellzugriff steht jetzt unter dem Feed. Der *Saison-Überblick* zeigt oben Zahlen (Freizeiten, laufende, ohne Leitung) und je Ferienzeit Karten mit Datumsfeld, Status (läuft / in N Tagen) und Teamstand. Reine Logik: `src/heute/feed.ts` und `src/heute/bento.ts` (mit Tests); Darstellung: `src/pages/heute/Feed.tsx`, `Bento.tsx`, `src/styles/startseite.css`.
- **Dienstplan: Woche und Monat in einem Reiter:** Ein Umschalter *Woche / Monat* im Reiter „Dienstplan“ (Adresse `?ansicht=monat`); der gewählte Zeitraum bleibt beim Umschalten erhalten, der frühere Reiter „Monat“ leitet dorthin um. Treffleitung und Koordination teilen **auch in der Monatsansicht** ein (Zuteilen je Tag, Sonderdienste, Hinweis auf offene Wünsche); Wünsche beantwortet man weiterhin in der Wochenansicht.
- **Stundennachweise erstellen lassen (Migration `0022`):** Im Reiter „Stundennachweis“ erstellen Treffleitung und Treffkoordination die Nachweise des Monats für alle Teilzeitkräfte auf einmal oder je Person; die Zeilen werden aus Dienstplan und Abwesenheiten befüllt, vorhandene Nachweise bleiben unverändert. Bisher konnte nur die Person selbst ihren Nachweis anlegen.
- **Nachweis als PDF wie im alten Formular:** Der Knopf „Als PDF herunterladen“ erzeugt eine A4-Seite im Aussehen von „Nachweis der Teilzeitkräfte“ (Überschrift, Felder Treff / Monat / Name, Tabelle Datum · Zeiten · Stunden mit Gesamtsumme, Unterschrift unten, Hinweis zum Streichen), Dateiname `JJ_MM_Nachname_Vorname.pdf`. Gerendert mit html2canvas und jsPDF, die erst beim Klick geladen werden (`src/treffs/nachweisPdf.ts`). Das PDF ist ein Bild der Seite, der Text lässt sich darin nicht markieren (wie bisher).
- **Dienstplan: „Wer arbeitet wann“:** Über den Tageskarten (Woche) und der Tagesliste (Monat) zeigt eine **Einsatz-Matrix** Personen mal Tage: ● Dienst, ★ Sonderdienst, U Urlaub, K krank, ? offener Wunsch (nur Treffleitung und Koordination), die eigene Zeile hervorgehoben, rechts die Zahl der Einsatztage, unten die Besetzung je Tag. Öffnungstage ab heute ohne jemanden sind rot markiert und werden oben gemeldet. In der Tagesliste stehen die Personen als Schilder. Logik: `src/treffs/einsatz.ts`.
- **Überschneidungen von Freizeiten ansehen und akzeptieren (Migration `0023`):** Die Warnung „Überschneidung“ in *Personen → Zuordnungen* (Tabelle, Fenster einer Person, Hinweis nach dem Zuordnen) ist anklickbar. Das Fenster zeigt beide Freizeiten mit Link, Zeitraum, Rolle und den gemeinsamen Tagen. Die Freizeitenkoordination kann die Überschneidung mit optionaler Notiz **akzeptieren**: Die Warnung verschwindet (ein neutrales Schild „Überschneidung akzeptiert“ bleibt, dort lässt sich die Akzeptanz mit Wer/Wann/Notiz ansehen und zurücknehmen). Verlässt die Person eine der beiden Freizeiten, entfällt die Akzeptanz; bei erneutem Einteilen wird wieder gewarnt.
- **Dienstplan: Monat einteilen (Migration `0024`):** In der Monatsansicht kreuzen Treffleitung und Treffkoordination **je Person die Wochentage** an, an denen sie im Monat arbeitet (Regeltage und Höchststunden der Teilzeitkraft stehen daneben). Eingeteilt wird immer ein ganzer Monat, nur an Öffnungstagen.
  Eine **Vorschau** zeigt vor dem Speichern die neuen Einteilungen und Tage, was schon eingetragen ist und was wegen Konflikten ausgelassen wird. **Konflikte** (Urlaub, Krankheit, Feiertag) entscheidet die Treffleitung selbst: Ohne Häkchen „trotzdem einteilen“ wird an diesem Tag nicht eingeteilt.
  **Vorhandene Einteilungen bleiben**, weitere Personen kommen dazu (zweite oder dritte Person am selben Tag). Wahlweise ersetzt das Muster die bisherige Einteilung, nur an den Tagen, die es betrifft, und mit Rückfrage. Gespeichert wird in einem Schritt, ganz oder gar nicht (`fn_dienstplan_anwenden`: nur Personen aus dem Team, nur Tage im Monat, fehlender Dienst wird mit der Öffnungszeit angelegt). Die neu Eingeteilten erhalten eine Mitteilung. Logik: `src/treffs/monatsplan.ts`.

**Nicht erprobt:** Echte Hilfsmittel (Screenreader, Zoom), Lesbarkeit auf echten Geräten und Farbwirkung bei Sonnenlicht; die Zeilenenden-Umstellung greift auf anderen Rechnern nach einem frischen `git pull` (bei Bedarf `git rm --cached -r . && git reset --hard`, wenn dort nichts Ungespeichertes liegt).
