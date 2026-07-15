# Item-Explorer UI-Audit – Wiederholungsprüfung

Datum: 15.07.2026
Ziel: `http://localhost:4201`
Stand: Branch `item-parameters-and-collections`, Commit `77fb177`, einschließlich der zum Prüfzeitpunkt vorhandenen lokalen Änderungen
Werkzeuge: Playwright 1.59.1, Chromium als Vollprüfung, Firefox und WebKit als Cross-Browser-Smoke

## Executive Summary

Die Wiederholungsprüfung umfasst 84 kanonische Browserfälle: **78 PASS**, **4 FAIL** und **2 BLOCKED**. Frontend- und Backend-Tests, Lint und Production-Build waren vor der UI-Prüfung grün. Der Frontend-Container wurde neu gestartet; das zuvor beobachtete Compile-Overlay trat nicht mehr auf.

Die Kernfunktionen des Item-Explorers sind stabil: Laden, Filtern, Sortieren, Auswahl, Tastaturnavigation, Draft-Speichern/Verwerfen, persönliche Daten, Kollektionen, Upload, Neunummerierung, Rollen/Perspektiven, Dialoge, responsive Layouts und die acht Läufe der Pairwise-Feature-Matrix bestanden. Drei Befundgruppen bleiben offen:

1. **P2 – Kollektion-Konfliktmeldung verschwindet:** Ein echter bzw. synthetisch reproduzierbarer `PATCH 409` löst den Reload aus, danach ist aber keine sichtbare Konfliktmeldung vorhanden.
2. **P2 – Lokaler registrierter Login in Firefox und WebKit:** Gültige lokale ACP-Manager-Anmeldungen enden in beiden Browsern auf `/access?reason=login_required...`; Chromium funktioniert. Der OIDC-App-Admin-Smoke besteht dagegen in allen drei Engines.
3. **P3 – Drei WCAG-AA-Kontrastverstöße:** „Werte bereinigen“, „Unverändert“ und „Kein Player-Ziel“ unterschreiten jeweils 4,5:1.

Zwei Player-Fälle sind blockiert, weil die 15 unverändert kopierten Quelldateien keine vollständige, im Iframe lauffähige Player-Fixture enthalten. Die sechs Paging-Modi, Zielauflösung/Override, Navigation und Response-State-Aktionen wurden dennoch geprüft.

Die vollständige Fallmatrix steht in [matrix.md](matrix.md).

## Befunde

### IE-RERUN-01 – P2 – Kollektion zeigt Versionskonflikt nach Reload nicht an

**Profil:** ACP_MANAGER, Chromium, 1440×900, Kollektionen aktiviert
**Reproduktion:**

1. Kollektion anlegen und aktivieren.
2. Eine Änderung mit veralteter Version senden, sodass `PATCH .../items/collections/:id` mit `409` antwortet.
3. Automatischen Reload der Kollektionen abwarten.

**Erwartet:** Eine verständliche, sichtbare Konfliktmeldung bleibt nach dem Reload stehen.
**Ist:** Der Reload erfolgt, die UI enthält danach keine sichtbare `.collection-error`-Meldung. Der Anwender erkennt nicht, weshalb seine Änderung verworfen bzw. neu geladen wurde.
**Evidenz:** [Screenshot](screenshots/rerun-collection-conflict-missing-message.png)

### IE-RERUN-02 – P2 – Lokaler Login scheitert in Firefox und WebKit

**Profil:** registrierter lokaler ACP_MANAGER, Firefox und WebKit, Desktop
**Reproduktion:**

1. Lokale Login-Seite mit Item-Explorer als `next`-Ziel öffnen.
2. Gültige Zugangsdaten eines dem QA-ACP zugeordneten Managers eingeben.
3. Weiterleitung beobachten.

**Erwartet:** Der Item-Explorer wird mit Manager-Rechten geöffnet.
**Ist:** Beide Browser landen reproduzierbar auf `/access?reason=login_required&next=...`. Derselbe lokale Zugang funktioniert in Chromium. Die OIDC-Anmeldung als App-Admin funktioniert in Firefox und WebKit, wodurch ein genereller Engine- oder Backend-Ausfall ausgeschlossen ist.
**Evidenz:** [Firefox](screenshots/rerun-cross-browser-firefox-error.png), [WebKit](screenshots/rerun-cross-browser-webkit-error.png)

### IE-RERUN-03 – P3 – Drei verbleibende Farbkontraste verfehlen WCAG AA

**Profil:** ACP_MANAGER, Chromium, 1440×900, geschlossene Overlays
**Prüfung:** Axe WCAG 2 A/AA
**Erwartet:** Mindestens 4,5:1 bei normal großer Schrift.
**Ist:**

| Element | Vordergrund / Hintergrund | Verhältnis |
|---|---|---:|
| Button „Werte bereinigen“ | `#e74c3c` / `#f5f7fa` | 3,55:1 |
| Status „Unverändert“ | `#1e8449` / `#e5f5ec` | 4,17:1 |
| Badge „Kein Player-Ziel“ | `#9c640c` / `#fdf1de` | 4,43:1 |

**Evidenz:** [Desktop-Zustand](screenshots/rerun-targeted-manager.png)

## Bestandene Funktionsbereiche

- Shell/Breadcrumb, Leerzustand, Ladeindikator, Split-Pane-Resize und Fullscreen-API inklusive `fullscreenchange`.
- Globale und spaltenbezogene Filter, numerische Bereiche, beide Sortierrichtungen, Sticky-Spalte, Horizontal-Scroll, stabile Auswahl, Ausschlüsse, Tags, manuelle Reihenfolge und Neunummerierung.
- `/`, Pfeile, Pos1/Ende, PageUp/PageDown, Fokuswechsel sowie Escape für Kodierungsdialog, Metadaten-Drawer und Spaltenverwaltung.
- Draft-Debounce, Dirty-/Saving-Zustände, Publish-Vorschau, Verwerfen und echter Zwei-Manager-Draft-Konflikt mit sichtbarer Meldung.
- APP_ADMIN, ACP_MANAGER, READ_ONLY, Credential und anonymer Zugriff; direkte Draft-Mutation als READ_ONLY wurde mit `403` abgewiesen.
- Persönliche Kategorie, Markierung, Notiz, Filter, Autosave, Retry nach `500`, XLSX-Eigenexport und Manager-Gesamtexport.
- Kollektion anlegen, auswählen, Zeile hinzufügen, Details, umbenennen, exportieren, leeren/löschen; Zeit-/Summenanzeige mit dem vorhandenen Datenbestand.
- Player-Zielnavigation, unbekanntes manuelles Ziel, Reset, sechs Paging-Modi sowie Response-State-Rohdaten, Löschen und Validierungsfehler beim leeren Speichern.
- Kodierschema, Suche/Sortierung, Metadaten, Spaltenverwaltung, Historie und CSV-Export.
- Itemparameter: valide Wide-CSV, Dezimalkomma, wiederholte Booklet-Positionen, unbekanntes Item als Teilerfolg, ungültiger Header und widersprüchliche Wiederholungswerte.
- Fehlersimulationen für Itemliste, Draft, persönliche Daten, Vorschau und Exporte; Recovery und verständliche Meldungen waren konsistent, mit Ausnahme von IE-RERUN-01.
- Responsive Ansichten 1440×900, 768×1024 und 390×844 ohne Seitenoverflow oder unerreichbare Kernaktionen.
- Pairwise-Matrix mit sieben Flags und acht Läufen. Alle 21 Faktorpaare enthalten sämtliche vier Zweierausprägungen; zusätzlich lief die kritische „alles aktiviert“-Kombination.

## Cross-Browser

Chromium deckte die vollständige Matrix ab. In Firefox und WebKit bestanden mit OIDC-App-Admin jeweils:

- Laden, Zeilenauswahl, Filter und Sortierung
- Draft-Patch und Discard
- persönliche Daten und XLSX-Download
- Collection-Create/Add/Delete
- Player-Navigation sowie Dialog/Escape

Der separate lokale registrierte Login scheiterte in Firefox und WebKit gemäß IE-RERUN-02.

## Downloads

Die kanonischen Exporte wurden auf Dateiname, Größe, MIME/Container, Header und synthetische Werte geprüft:

- persönlicher XLSX-Export in Chromium, Firefox und WebKit; ZIP-Container jeweils fehlerfrei
- Manager-Gesamtexport als semikolonseparierte CSV mit synthetischer Notiz
- Kollektion als CSV mit korrekter Reihenfolge und persönlicher Anreicherung
- Änderungshistorie als CSV mit Zeit, Nutzer, Aktion, Versionen und Diff

Die Artefakte liegen unter [downloads](downloads/).

## Console und Netzwerk

Es traten keine unerwarteten Page-Errors oder Console-Errors auf. Vier `net::ERR_ABORTED`-Requests im ersten Chromium-Lauf entstanden beim absichtlichen Navigationswechsel und ließen sich in den zielgerichteten Wiederholungen nicht reproduzieren. Die erwarteten `400`, `403`, `409` und `500`-Antworten der Negativtests wurden separat bewertet und nicht als Laufzeitrauschen gezählt.

## Blockierte Fälle

| Fall | Status | Grund |
|---|---|---|
| Echtes Player-Iframe mit dynamischem Titel/Ladezustand | BLOCKED | Keine vollständige Player-Fixture in den 15 unverändert kopierten Quelldateien |
| Echtes Player-`postMessage` bis zur Response-State-Persistenz | BLOCKED | Benötigt dieselbe fehlende Player-Fixture; API-Setup und sichtbare Rohdaten-/Delete-Aktionen bestanden |

## Setup, Migration und Cleanup

Das temporäre QA-ACP wurde gestuft geprüft: leer, 15 Quelldateien/21 Explorer-Zeilen, Feature-Konfiguration, persönliche Daten, Kollektionen, Uploads, Drafts und Response-State. Das bestehende ACP „Deutsch“ wurde ausschließlich lesend als Dateiquelle verwendet.

Beim abschließenden frischen Backend-Neustart zeigte sich, dass sieben im Repository vorhandene Migrationen in der lokalen Entwicklungsdatenbank noch nicht ausgeführt waren. Der Start scheiterte zunächst an der Typabweichung von `item_response_states.acp_id`. Nach Ausführung des offiziellen `migration:run` startete das Backend sauber. Das ist kein zusätzlicher UI-Befund, aber eine notwendige Deployment-/Setup-Voraussetzung für den geprüften Stand.

Der Cleanup wurde danach mit einem eigenen Probe-ACP samt Response-State erneut verifiziert:

- Audit-QA-ACPs: 0
- QA-Benutzer: 0
- Probe-ACP: 0
- Probe-Response-States: 0
- verwaiste Response-States: 0

Tokens, Kennwörter und Authorization-Header wurden weder in diesen Bericht noch in die persistenten Evidenzdateien übernommen. Temporäre Zustandsdateien und Browser-Traces wurden entfernt.

## Technische Vorprüfung

| Prüfung | Ergebnis |
|---|---|
| Backend-Tests | PASS – 45 Suites, 578 Tests |
| Frontend-Tests | PASS – 33 Dateien, 421 Tests |
| Backend-Lint | PASS |
| Frontend-Lint | PASS |
| Backend Production-Build | PASS |
| Frontend Production-Build | PASS |
| Frontend-Neustart / Compile-Overlay | PASS – HTTP 200, kein Overlay |
| Backend-Neustart nach Migration | PASS – Anwendung erfolgreich gestartet |
