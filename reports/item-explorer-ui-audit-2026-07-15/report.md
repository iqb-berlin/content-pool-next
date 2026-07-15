# Item-Explorer UI-Audit – 15.07.2026

## Executive Summary

Der Item-Explorer wurde in Chromium funktional, visuell, responsiv, rollenbezogen und mit einer Pairwise-Feature-Matrix geprüft. Zentrale Pfade wurden zusätzlich in Firefox und WebKit ausgeführt. Die Frontend-Baseline ist stabil: 413/413 Tests, Lint und Production-Build sind grün; der zuvor sichtbare HMR-Compile-Overlay war nach dem sauberen Frontend-Neustart verschwunden.

Die Kernabläufe Laden, Filtern, normale Sortierung, Auswahl, Draft Save/Discard, persönliche Daten, Kollektionen, Upload, Historie, Dialoge, Vollbild, Rollen und Cross-Browser-Smokes funktionieren. Es wurden sieben relevante Befunde bestätigt:

| Priorität | Anzahl | Kurzbewertung |
|---|---:|---|
| P1 | 1 | ACP-Löschung hinterlässt einen Item-Response-State; explizites Cleanup war erforderlich. |
| P2 | 4 | Draft-Konflikt unsichtbar, Sticky-Header nicht klickbar, Mobile-Kernbedienung defekt, unbenannte Selects. |
| P3 | 2 | Kontrastverstöße sowie fehlender Frame-Titel/nicht fokussierbarer Scrollbereich. |
| P4 | 0 | Keine isolierten kosmetischen P4-Befunde. |

Einige besonders daten- oder playerabhängige Varianten konnten ohne zusätzliche Produkt-Testhooks nicht vollständig über die sichtbare UI erzeugt werden. Sie sind in der [Abdeckungsmatrix](matrix.md) nachvollziehbar als `BLOCKED` ausgewiesen. Es wurden keine Produktdateien geändert und keine Fehler behoben.

## Testumgebung und Baseline

- Ziel: `http://localhost:4201`
- Datum/Zeitzone: 15.07.2026, Europe/Berlin
- Browser: Chromium; zusätzliche Smokes in Firefox 148.0.2 und WebKit 26.4
- Viewports: 1440×900, 768×1024 und 390×844
- Temporäres QA-ACP: leerer Zustand, danach 15 geklonte Quelldateien, 21 Basiszeilen und zwei importierte Teilbewertungszeilen
- Identitäten: APP_ADMIN, zwei ACP_MANAGER, READ_ONLY, Credential und anonym
- Ausgangsdaten „Deutsch“ wurden ausschließlich lesend als Quelle verwendet.
- Preflight: 33 Testdateien, 413/413 Tests `PASS`; Lint `PASS`; Production-Build `PASS`
- HMR-Overlay: nach sauberem Frontend-Neustart nicht mehr vorhanden

## Befunde

### F-01 – P1 – ACP-Löschung hinterlässt Item-Response-State

Nach dem erfolgreichen Löschen von Credential, QA-ACP und drei QA-Benutzern über die bestehenden APIs waren ACP, Dateien, Rollen, Explorer-State, Historie, Präferenzen und Benutzer aus der Datenbank entfernt. In `item_response_states` blieb jedoch genau eine Zeile mit der gelöschten ACP-ID bestehen. Erst ein expliziter Aufruf des bestehenden Response-State-DELETE entfernte diese Zeile.

Erwartet: Das Löschen eines ACP entfernt sämtliche zugehörigen Response-States atomar oder verhindert die ACP-Löschung mit einer verständlichen Fehlermeldung.

Ist: ACP-DELETE antwortet 200, während Response-Daten verwaist zurückbleiben. Das ist ein Datenlebenszyklus- und potenzielles Datenschutzproblem.

Cleanup-Nachweis: Nach dem expliziten DELETE liefern alle geprüften QA-Tabellen einschließlich `item_response_states` den Zähler 0.

### F-02 – P2 – Optimistic-Lock-Konflikt verschwindet nach Reload

Reproduktion:

1. Zwei ACP_MANAGER öffnen denselben veröffentlichten Stand.
2. Manager B erzeugt einen Draft-Patch.
3. Manager A sendet aus der veralteten Version einen weiteren Patch.
4. Der Patch von Manager A erhält HTTP 409.
5. Der automatische State-Reload wird ausgeführt.

Erwartet: Eine dauerhaft sichtbare Konfliktmeldung informiert über den Reload und den verworfenen lokalen Patch.

Ist: Nach dem Reload sind keine `.alert`-Elemente und kein Konflikttext im DOM vorhanden. Netzwerkstatus `[409]`, sichtbare Alerts `[]`.

Evidenz: [Screenshot nach 409](screenshots/targeted-draft-409-after-reload.png)

### F-03 – P2 – Sticky Item-ID-Header nach horizontalem Scrollen nicht bedienbar

Normale Item-ID-Sortierung in beiden Richtungen funktioniert. Nach horizontalem Scrollen bis zum Tabellenende bleibt der Sticky-Header sichtbar, ist aber nicht mehr per Pointer klickbar. Andere Spaltenköpfe wie „Kompetenzstufe“, „Position im Booklet“, „Itemzeit“ oder „Trennschärfe“ fangen die Pointer-Events ab.

Erwartet: Sticky-Spalte und Sticky-Header bleiben vollständig sichtbar und interaktiv.

Ist: Playwright kann den sichtbaren Header auch nach wiederholten stabilen Klickversuchen nicht auslösen; wechselnde nicht-sticky `<th>`-Elemente intercepten das Event.

Evidenz: [Sticky-Header nach Horizontal-Scroll](screenshots/followup-sticky-item-id-sortierung-nach-horizontal-scroll.png)

### F-04 – P2 – Mobile Ansicht verhindert Kernbedienung

Bei 390×844 beträgt die Body-Breite 444 px bei 390 px Viewport. Header, Nutzername und Aktionsleiste brechen stark um. Die Shell ist nur 327 px breit, während das Split-Pane Mindestbreiten von 350 px links und 400 px rechts erzwingt. Tabelle und Vorschau werden dadurch zu schmalen, abgeschnittenen Bereichen.

Erwartet: Aktionen und Itemauswahl bleiben ohne Überlagerung erreichbar; die Vorschau wird sinnvoll unterhalb oder in einem umschaltbaren Bereich angeordnet.

Ist: Der normale Pointer-Klick auf die erste sichtbare Item-ID wird von `main`, Vorschau oder Collection-Summary abgefangen; `.item-nav` erscheint nicht. Die mobile Kernaktion „Item auswählen“ ist damit nicht zuverlässig nutzbar.

Evidenz: [Mobile Gesamtansicht](screenshots/responsive-mobile.png), [fehlgeschlagene mobile Auswahl](screenshots/residual-mobile-selection.png)

### F-05 – P2 – Kern-Selects besitzen keinen zugänglichen Namen

Axe 4.12.1 meldet `select-name` mit Impact `critical`: sechs Nodes auf Desktop und fünf auf Mobile. Betroffen sind unter anderem Ziel-/Paging-Auswahl, Tag-Auswahl und persönliche Kategorieauswahl.

Erwartet: Jedes Select besitzt ein korrekt zugeordnetes Label oder einen nichtleeren zugänglichen Namen.

Ist: Mehrere Kernsteuerungen sind für Screenreader nicht eindeutig identifizierbar.

Evidenz: [A11y Desktop](screenshots/a11y-desktop.png), [A11y Mobile](screenshots/a11y-mobile.png)

### F-06 – P3 – Unzureichende Farbkontraste

Axe meldet `color-contrast` mit Impact `serious`: 30 Nodes im Desktop-Explorer, 25 bei geöffnetem Kodierungsdialog und 13 in der mobilen Ansicht. Beispiele sind Logo-/Headertexte, Breadcrumbs, Logout sowie sekundäre Status- und Hilfstexte. Ein Teil liegt in der globalen Shell, ist aber auf der Item-Explorer-Route sichtbar.

Erwartet: WCAG-AA-Kontrast für Text und aktive Bedienelemente.

Ist: Gemessene Kontrastverhältnisse liegen teilweise zwischen 1,06:1 und 3,02:1 statt der erforderlichen 4,5:1.

### F-07 – P3 – Player-Frame ohne Titel und Mobile-Scrollbereich nicht fokussierbar

Axe meldet im geöffneten Kodierungsdialog ein `iframe` ohne `title`, `aria-label` oder gültiges `aria-labelledby` (`frame-title`, serious). Auf Mobile ist `.preview-panel` ein scrollbarer Bereich ohne fokussierbaren Inhalt bzw. eigene Fokussierbarkeit (`scrollable-region-focusable`, serious).

Erwartet: Iframes werden semantisch benannt; scrollbare Regionen sind per Tastatur erreichbar.

## Bestätigte Kernabläufe

- Rollen: APP_ADMIN und ACP_MANAGER erhalten Editor-/Diagnoseaktionen; READ_ONLY und Credential erhalten persönliche Funktionen ohne Schreibaktionen; anonym erhält keine persönlichen oder Editoraktionen.
- Tabelle: leerer und gefüllter Zustand, globale und spaltenbezogene Filter, numerische Bereiche, normale Sortierung, Auswahlstabilität, Ausschlüsse, Tags, Teilbewertungszeilen, manuelle Reihenfolge und Neunummerierung.
- Tastatur: `/`, Pfeile, Pos1/Ende, PageUp/PageDown, Cmd/Ctrl+Pfeil für manuelle Reihenfolge und Escape für Dialoge/Drawer.
- Draft: Dirty/Saving/Clean, Publish, Discard, READ-ONLY-Vorschau und Debounce; der Konfliktpfad ist als F-02 defekt.
- Persönliche Daten: Kategorie/Tags/Notiz, Autosave, injizierter HTTP-500-Fehler mit Retry sowie persönlicher XLSX- und Manager-Gesamtexport.
- Kollektionen: Anlegen, Aktivieren, Umbenennen, Teilzeile hinzufügen/entfernen, Summen, Leeren, Löschen und CSV-Export.
- Player/Vorschau: Auswahl, sichtbarer Player bzw. erklärter Missing-Player-Zustand, sechs Paging-Modi, Metadaten/Kodierung und Response-State-Dialoge.
- Itemparameter: ungültiger Header, Wide-CSV, Dezimalpunkt und -komma, Teilbewertung, Uploadbericht, Publish, Difficulty-only und Bereinigung/Discard.
- Feature-Matrix: acht Pairwise-Profile plus Vollprofil; Difficulty-only wurde nach Import mit genau zwei Teilzeilen und Zielbadges erneut bestätigt.
- Fehlerpfade: Itemliste HTTP 500 + Recovery, persönlicher Autosave HTTP 500 + Retry und echter Draft-409-Konflikt.
- Cross-Browser: Firefox und WebKit bestehen Laden, Auswahl/Preview, Filter/Sortierung, Dialog/Escape, Draft Save/Discard, persönlicher XLSX-Download und Kollektion.

## Downloads

Alle persistenten Downloads liegen unter `downloads/` und wurden geprüft:

- drei persönliche XLSX-Exporte: MIME/Dateityp „Microsoft Excel 2007+“, gültige OOXML-ZIP-Struktur, erwartete Spalten einschließlich Unit-ID, Item-ID, Markierung/Farbe, Notiz und Kompetenzstufe
- Manager-Gesamtdaten-CSV: UTF-8 mit BOM, 18 erwartete Spalten und synthetische QA-Notiz
- Historien-CSV: erwartete Header, 22 Zeilen
- Kollektion-CSV: erwartete Header und genau eine synthetische Datenzeile pro Export

## Console und Netzwerk

- Öffentliche Baseline: keine Console-Errors, Page-Errors oder Request-Failures
- Firefox/WebKit-Smokes: keine unerwarteten Page-Errors oder Request-Failures
- Erwartete Testinjektionen: HTTP 500 für Itemliste und persönlichen Autosave
- Reproduzierter Produktfehler: HTTP 409 für veralteten Draft-Patch; sichtbare Fehlermeldung fehlt
- Frühere Fehlerbilder durch einen offen gebliebenen Testdialog bzw. zu frühe Assertions wurden mit isolierten Seiten erneut geprüft und nicht als Produktbefunde gewertet.

## Responsive und Browser

| Browser | Viewport | Ergebnis |
|---|---|---|
| Chromium | 1440×900 | PASS |
| Chromium | 768×1024 | PASS; Aktionsleiste bricht um, bleibt erreichbar |
| Chromium | 390×844 | FAIL; horizontaler Overflow, stark gequetschtes Split-Pane, Pointer-Auswahl nicht zuverlässig möglich |
| Firefox | 1440×900 | PASS für zentrale Smoke-Pfade |
| WebKit | 1440×900 | PASS für zentrale Smoke-Pfade |

## Nicht vollständig prüfbare Fälle

Die folgenden Fälle sind in der Matrix als `BLOCKED` dokumentiert und wurden nicht als PASS gewertet:

- vollständige Tab-Reihenfolge und Fokuswiederherstellung über jede Overlay-Kombination
- Leaving-Guard mit allen drei Entscheidungen in einer isolierten UI-Sequenz; die Guard-/Facade-Regressionstests sind grün, die zusätzliche Browsersequenz wurde durch persistierte Filter-/Perspektivzustände instabil
- persönlicher Sitzungswechsel mit noch laufendem Autosave und Collection-Versionskonflikt
- alle Player-Zielvarianten und kontrollierte `postMessage`-Payloads ohne dedizierte Player-Testfixture
- seltene Itemparameter-Kombinationen wie widersprüchliche Doppelwerte und unbekannte Items in jeder Ausprägung
- künstlich veraltete/abgebrochene Requests sowie 401/403/500 für jede einzelne Sub-API

## Cleanup

- Credential-DELETE: HTTP 200
- QA-ACP-DELETE: HTTP 200
- drei User-DELETEs: jeweils HTTP 200
- zunächst verbliebener Response-State: expliziter Response-State-DELETE HTTP 200; als F-01 dokumentiert
- abschließende Read-only-Datenbankprüfung: ACP, Access Config, Credential, Dateien, Jobs, Explorer-State, Explorer-Historie, Präferenzen, Nummerierung, Rollen, Snapshots, Kommentare, Response-States und QA-Benutzer jeweils 0
- temporäre Browserzustände, Zugangsdaten, QA-Archive, CSV-Testdateien und Playwright-Skripte wurden nach Berichtserstellung entfernt
- vorhandene Verzeichnisse unter `reports/` blieben unangetastet

## Abnahmefazit

Die geprüften Desktop-Kernabläufe und die Cross-Browser-Smokes sind stabil. Vor einer Freigabe als vollständig robust sollten mindestens F-01 bis F-05 behoben und regressionsgetestet werden. Das Audit ist nachvollziehbar abgeschlossen; nicht erzeugbare Varianten sind explizit als blockiert ausgewiesen statt als bestanden angenommen.
