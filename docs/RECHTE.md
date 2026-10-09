# Rechte-Matrix (Phase 1)

Grundlage für die Row-Level-Security-Regeln (Supabase/Postgres). Sie leitet sich aus `firestore.rules` und der
Client-Logik des Altcodes ab. Abweichungen vom Altverhalten sind mit **Δ** markiert und begründet.

## 1. Rollen

Rollen sind **kontextabhängig**: dieselbe Person kann in einer Freizeit Leitung, in einer anderen TeamerIn und in einem
Treff BetreuerIn sein.

| Rolle | Wie sie entsteht | Kurzbeschreibung |
|---|---|---|
| **Freizeitenkoordination** | Flag `ist_freizeitkoordination` am Personenprofil (seit Migration 0018) | Verwaltet alle Freizeiten, Bewerbungen, Lebensmittel, KiJuKo-Import. |
| **Treffkoordination** | Flag `ist_treffkoordination` am Personenprofil (seit Migration 0018) | Verwaltet alle Treffs, Dienstplan, Nachweise, Tagesprotokolle. |
| **Koordination** (gemeinsam) | eines der beiden Flags (abgeleitet als `ist_koordination`) | Gemeinsame Verwaltung: Personen, Orte, Katalog, Quiz, Mappen, Einstellungen, manuelle Mitteilungen. |
| **Leitung** | `freizeit_team.rolle = 'leitung'` | Freizeitleitung der jeweiligen Freizeit. |
| **TeamerIn** | `freizeit_team.rolle = 'teamer'` | Teammitglied der jeweiligen Freizeit. |
| **Treffleitung** | `treff_team.rolle = 'treffleitung'` | Leitung des jeweiligen Treffs. |
| **BetreuerIn** | `treff_team.rolle = 'betreuerin'` | Teammitglied des jeweiligen Treffs. |
| **Bewerbende** | Person der Kategorie TeamerIn/Senior/FSJ/TZK/Praktikum (nicht Hauptamtliche\*r), aktiv | Darf kommende Freizeiten ansehen und sich bewerben – auch ohne Zuordnung. |
| **Angemeldet** | Jede aktive Person mit Konto | Basisrechte (Katalog lesen, Mappe lesen, eigenes Profil). |

Kategorie → Standardrolle bei Zuordnung (vorbelegt, von der Koordination änderbar, siehe FEATURES O2):

| Kategorie | Freizeit-Standard | Treff-Standard | Treffs zulässig |
|---|---|---|---|
| TeamerIn, Senior-TeamerIn, Praktikum bezahlt | teamer | – | nein |
| FSJ, TZK, Praktikum unbezahlt | teamer | betreuerin | ja |
| Hauptamtliche\*r | leitung | treffleitung | ja |

**Koordination in zwei Bereichen (Migration 0018).** Eine Person kann Freizeitenkoordination, Treffkoordination oder beides sein; bestehende Koordinationen haben beide Bereiche erhalten.
Wo in den Tabellen unten „Koordination“ steht, gilt:

| Bereich | Wer | Tabellen und Funktionen |
|---|---|---|
| Freizeiten | Freizeitenkoordination | Freizeiten, Team, Slots/Wochenplan, Hinweise und Absprachen der Freizeiten (samt Kommentaren), Lebensmittel, Verpflegung/Material, Bewerbungen (entscheiden), KiJuKo-Import, Kontaktdaten der Freizeit-Teams |
| Treffs | Treffkoordination | Treffs, Team, Öffnungszeiten, Wochenprogramm, Dienste, Wünsche, Kommentare, Abwesenheiten, Feiertage, Nachweise (freigeben), Schließzeiten, Tagesprotokolle, Notizen, Treff-Absprachen, Treffmappe, Kontaktdaten der Treff-Teams |
| Gemeinsam | jede der beiden | Personen (anlegen, ändern, Zugang, Koordination vergeben), Orte, Tags, Einstellungen, Katalog (Programmpunkte, Vorschläge), Quiz-Fragen, Mappen-Inhalte, manuelle Mitteilungen an alle/Koordination/Kategorien; an eine **Freizeit** nur die Freizeitenkoordination, an einen **Treff** nur die Treffkoordination |

Die letzte aktive Person je Bereich ist geschützt: sie lässt sich weder löschen noch deaktivieren noch herabstufen.
Wer Koordination vergeben darf: jede der beiden Koordinationen (gemeinsame Personenverwaltung) – die Bereiche trennen die Zuständigkeit, nicht gegenseitiges Misstrauen.

Deaktivierte Personen (`aktiv = false`) haben **keine** Rechte außer „Anmeldung verweigert".

Legende: **L** lesen · **E** erstellen · **Ä** ändern · **X** löschen · **—** kein Zugriff · „eig." = nur eigene Zeilen · „Team" = nur für Freizeiten/Treffs, in denen die Person zugeordnet ist.

## 2. Matrix

### Personal

| Ressource | Koordination | Leitung | TeamerIn | Treffleitung | BetreuerIn | Bewerbende/Angemeldet |
|---|---|---|---|---|---|---|
| Personenprofil (Stamm, Kategorie, aktiv, TZK-Felder) | L E Ä X | — | — | — | — | eig.: L |
| Eigene Kontaktdaten (Telefon, Ernährung, Allergien/Notiz) | alle | eig. Ä | eig. Ä | eig. Ä | eig. Ä | eig. Ä · **Δ** Altcode erlaubte keine Selbstpflege |
| Team-Liste (Name, Rolle) | L | L (Team) | L (Team) | L (Treff) | L (Treff) | — |
| Team-Liste-Kontaktdaten (Mail, Telefon, Ernährung, Notiz, TZK) | L | L (Team) | — | L (Treff) | — | — |
| Zuordnung Freizeit/Treff (Team-Mitgliedschaft) | L E Ä X | — | — | — | — | — |
| Zugang einrichten / Passwort zurücksetzen / Zugang entziehen / Person endgültig löschen | E Ä X |
| Letzte aktive Koordination löschen, deaktivieren, herabstufen | für niemanden möglich (Datenbank-Schutz) | — | — | — | — | — |

### Freizeiten

| Ressource | Koordination | Leitung | TeamerIn | Treffleitung | BetreuerIn | Bewerbende/Angemeldet |
|---|---|---|---|---|---|---|
| Freizeit-Stammdaten (seit 0026 mit Farbe) | L E Ä X | L (Team) | L (Team) | — | — | L (Name, Zeitraum, Ort, Alter, max. Teiln. – für Bewerbung) |
| Checkliste der Vorbereitung: Stand und eigene Punkte (Migration 0029) | L E Ä X | L E Ä X (eigene Freizeit) | — | — | — | — |
| Checkliste: Termin eintragen (legt Hinweis bzw. Absprache an), Themen abhaken (Migration 0031) | ja | ja (eigene Freizeit) | — | — | — | — |
| Materialliste der Freizeit: schreiben, abgeben (Migration 0032) | L E Ä X | L E Ä X, abgeben (eigene Freizeit) | — | — | — | — |
| Freizeit-Typ (Migration 0032) | L E Ä X | L | L | — | — | — |
| Standard-Checkliste (Vorlage) | L E Ä X (Freizeitenkoordination) | L | L | L | L | — |
| Orte | L E Ä X | L | L | L | L | L · **Δ** Altcode: öffentlich lesbar |
| Slots (Reihenfolge/Abend) | alle | Ä | L | — | — | — |
| Wochenplan-Einträge (Katalog-Verweis) | alle | L E Ä X | L E Ä X (Team) · **Δ** ggf. nur eigene ändern/löschen, siehe Hinweis | — | — | — |
| Wochenplan-Eintrag als **Freitext** | alle | E Ä | — | — | — | — |
| Hinweise (für alle im Team) | L E Ä X | L E Ä X | L | — | — | — |
| Hinweis bestätigen („gesehen") | — | — | E (nur eigene Bestätigung) | — | — | — |
| Absprachen (Leitung ↔ Koordination) | L E Ä X | L E Ä X | — · **Δ** Altcode: Lesezugriff war technisch offen, nur UI versteckte sie | — | — | — |
| Absprache bestätigen/kommentieren | alle | E (eig.) Ä/X (eig. Kommentar) | — | — | — | — |
| Lebensmittel Eingang/Verbrauch (am Ort) | L E Ä X | L E Ä X (Orte der eigenen Freizeit) | — | — | — | — |
| Lebensmittel-Eingang **aus KiJuKo** (Lieferung, `kijuko_id`; Migration 0034) | L (Ä/X nur der Import) | L (Orte der eigenen Freizeit) | — | — | — | — |
| Verpflegung, Gerichte, Sonderkost aus KiJuKo (nur lesbar; Migration 0033) | L | L (eigene Freizeit) | L nur Küchenteam der Freizeit | — | — | — |
| Lieferungen aus KiJuKo (nur lesbar; Migration 0034) | L | L (eigene Freizeit) | L nur Küchenteam der Freizeit | — | — | — |
| Materialbedarf aus KiJuKo (nur lesbar) | L | L (eigene Freizeit) | — | — | — | — |
| Kennzeichen „Küchenteam“ in der Team-Liste (setzt nur der Import; Migration 0033) | L | L (Team) | L (Team) | — | — | — |
| Bewerbung (seit 0030 nur, solange die Freizeit „Bewerbungen möglich“ hat) | L Ä (annehmen/ablehnen) X | — | — | — | — | Bewerbende: E (eig.), X (eig., solange offen), L (eig.) |
| Bewerbung für eine Ferienzeit (Migration 0030) | L, zuordnen, als erledigt markieren, X | — | — | — | — | Bewerbende: E (eig., dieses/nächstes Jahr), Ä und X (eig., solange offen), L (eig.) |
| Bewerbungsfrist (Einstellung) | L Ä (nur Freizeitenkoordination) | L | L | L | L | L |

> Hinweis Wochenplan: Der Altcode erlaubt jedem Teammitglied, alle Einträge zu ändern. Vorschlag für den Neubau:
> TeamerInnen ändern/löschen **eigene** Einträge; Leitung und Koordination alle. (O-Entscheidung bei Bedarf.)

### Treffs

| Ressource | Koordination | Leitung | TeamerIn | Treffleitung | BetreuerIn | Sonstige |
|---|---|---|---|---|---|---|
| Treff-Stammdaten, Öffnungszeiten | L E Ä X | — | — | L (Treff) | L (Treff) | — · **Δ** Altcode: öffentlich lesbar |
| Wochenprogramm (Tag → Programm) | alle | — | — | L E Ä X | L E Ä X | — |
| Absprachen | L E Ä X | — | — | L E Ä X | L, bestätigen | — |
| Teamprotokolle (Teambesprechung, Information, Sonstiges; Migration 0035) | L E Ä X (Treffkoordination) | — | — | L E Ä X (eigener Treff) | L, „gelesen“ (eigener Treff) | — |
| Protokoll-Vorlagen je Wochentag (Migration 0028) | L E Ä X (Treffkoordination) | — | — | L E Ä X (eigener Treff) | L (eigener Treff) | — |
| Tagesprotokoll (Anzahl m/w/d, Verlauf, Vorkommnisse) | L E Ä (alle) · X | — | — | L E Ä (alle im Treff) · X (Treffleitung) | L E Ä (alle im Treff) | — · **neu**, nur Zahlen, keine Namen von Kindern |
| Notizen und Listen (To-do, Einkauf, Fragen) | L E Ä X | — | — | L E Ä X | L E Ä X (alle im Treff) | — · **neu** |
| Dienste/Zuteilung (regulär + Sonder) | L E Ä X | — | — | L E Ä X | L | — · **Δ** Altcode: Dienstplan öffentlich lesbar |
| Monatsmuster anwenden | alle | — | — | ja | — | — |
| Monat einteilen und in der Tabelle einteilen: Personen je Tag hinzufügen/entfernen (Migration 0024) | alle | — | — | ja (nur Personen aus dem Team des Treffs) | — | — |
| Wunschdienst | L | — | — | L, **beantworten** (bestätigen/ablehnen) | E/X (eig. Wunsch), L | — |
| Mehrere Wünsche auf einmal bestätigen (Migration 0025) | alle | — | — | ja (nur Dienste des eigenen Treffs) | — | — |
| Dienstplan-Kommentare | alle | — | — | L E X | L E (eig.) X (eig.) | — |
| Abwesenheiten (Urlaub/Krank) | L E Ä X | — | — | L E Ä X (Personen des Treffs) | L (eig.) | — |
| Feiertage (schließen seit 0027 den Treff wie eine Schließzeit) | L E Ä X | — | — | L (Treff) E Ä X (eigener Treff) | L | — |
| Schließzeiten des Treffs (Migration 0026) | L E Ä X (Treffkoordination) | — | — | L E Ä X (eigener Treff) | L | — · an Schließtagen kein regulärer Dienst (weder einteilen noch wünschen), kein Protokoll nötig |
| Nachweis Teilzeitkräfte (Entwurf) | L Ä X | — | — | L (Treff) | eig.: L E Ä X | — · **Δ** lag nur lokal im Browser |
| Nachweis für andere erstellen lassen (Migration 0022) | — | — | — | Treff (alle TZK oder eine Person) | — | — |
| Überschneidung zweier Freizeiten akzeptieren / zurücknehmen (Migration 0023) | Freizeitenkoordination | — | — | — | — | — |
| Nachweis einreichen | — | — | — | — | eig. | — |
| Nachweis freigeben/ablehnen | alle | — | — | Treff | — | — |
| Statistik Dienste/Stunden | L | — | — | L (Treff) | L (eig.) | — |

### Mappen, Lernen, Katalog

| Ressource | Koordination | Leitung | TeamerIn | Treffleitung | BetreuerIn | Bewerbende/Angemeldet |
|---|---|---|---|---|---|---|
| Teamermappe (Inhalt) | L Ä | L | L | L | L | L |
| Treffmappe (Inhalt) | L Ä | — | — | L | L nur Kategorie TZK | — |
| Formular-Beispiele | L Ä | L | L | L | L | L |
| Formular-Entwürfe | — | eig. | eig. | eig. | eig. | eig. |
| Quiz-Fragen | L E Ä X | L | L | L | L | L |
| Quiz-Ergebnis | L (alle) | eig. | eig. | eig. | eig. | eig. |
| Katalog-Programmpunkte | L E Ä X | L | L | L | L | L · **Δ** vorher öffentlich |
| Vorschlag einreichen | L Ä (vor Übernahme) X, übernehmen/ablehnen | E, L eig. | E, L eig. | E, L eig. | E, L eig. | E, L eig.  *(Altcode: nur TeamerIn/Leitung – Treff-Rollen ergänzt, Entscheidung O-Bedarf)* |
| Bewertung | alle | eig. E Ä | eig. E Ä | eig. E Ä | eig. E Ä | eig. E Ä · **Δ** vorher anonym je Gerät |
| Kommentar zum Programmpunkt | L X | L E, X eig. | L E, X eig. | L E, X eig. | L E, X eig. | L E, X eig. |
| Favoriten | — | eig. | eig. | eig. | eig. | eig. |

### Mitteilungen & Betrieb

| Ressource | Koordination | Alle übrigen Rollen |
|---|---|---|
| Push-Abo (Endgerät) | eig. | eig. |
| Manueller Push | E (an Freizeit/Treff/Kategorie/Koordination/alle) | — |
| Empfängervorschau | L | — |
| Mitteilungen bei Bewerbung angenommen, Nachweis eingereicht, Lebensmittel knapp/leer | erhält: Lebensmittel, Nachweis (falls keine Treffleitung) | erhält: Bewerbende die Annahme, Treffleitung den Nachweis · Details: `docs/ANZEIGEN_UND_MITTEILUNGEN.md` |
| Einstellungen (Bewerbungsfrist, Ferienwochen …) | L Ä | L |
| Backups/Export | ja | — |

## 3. Querschnittsregeln

1. **Kein anonymer Zugriff** (außer Impressum/Datenschutz).
2. **Jede Schreibaktion trägt `erstellt_von`/`geaendert_von`** (Person-ID) – ersetzt `lastZugangCode`/`lastMitarbeiterCode`.
3. **Deaktivieren sperrt sofort** (Login und alle Policies prüfen `aktiv`).
4. **Policies stehen in SQL-Migrationen** und werden mit pgTAP-Tests geprüft (Positiv- und Negativfälle je Rolle).
5. **Zeilen- statt Feldrechte:** Wo Altcode Feldlisten per `hasOnly([...])` erzwang (z. B. Gast darf nur `planung`, `notizen` …), wird das durch getrennte Tabellen mit eigenen Policies abgebildet.
6. **Altlast entfällt:** Code-Kenntnis gibt keine Rechte mehr. Der „bekannte Sicherheits-Tradeoff" am Ende von `firestore.rules` ist im Neubau kein Thema.
