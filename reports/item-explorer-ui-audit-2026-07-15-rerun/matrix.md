# Item-Explorer UI-Audit – Abdeckungsmatrix

## Ergebnisübersicht

| Bereich | PASS | FAIL | BLOCKED | Evidenz / Bemerkung |
|---|---:|---:|---:|---|
| Leerzustand und Shell | 4 | 0 | 0 | [Leerzustand](screenshots/rerun-empty-manager.png) |
| Chromium-Kernmatrix | 28 | 1 | 0 | [Desktop](screenshots/rerun-manager-desktop-final.png), FAIL: Kontrast |
| Rollen und Perspektiven | 5 | 0 | 0 | Admin, Manager, READ_ONLY, Credential, anonym |
| Responsive | 8 | 0 | 0 | [Desktop](screenshots/rerun-responsive-desktop.png), [Tablet](screenshots/rerun-responsive-tablet.png), [Mobile](screenshots/rerun-responsive-mobile.png) |
| Feature-Pairwise | 9 | 0 | 0 | [L8-Endzustand](screenshots/rerun-feature-pairwise-final.png) |
| Fehlerzustände | 5 | 1 | 0 | FAIL: Collection-409 ohne Meldung |
| Itemparameter-Uploads | 4 | 0 | 0 | [Konfliktfall](screenshots/rerun-upload-conflict.png) |
| Firefox/WebKit OIDC-Smoke | 10 | 0 | 0 | [Firefox](screenshots/rerun-cross-browser-firefox.png), [WebKit](screenshots/rerun-cross-browser-webkit.png) |
| Firefox/WebKit lokaler Login | 0 | 2 | 0 | Je Engine ein reproduzierbarer Fehler |
| Ergänzende Player-/Tabellenaktionen | 4 | 0 | 2 | [Aktionen](screenshots/rerun-actions-recheck.png), zwei Player-Fixture-Blocker |
| Cleanup-Probe | 1 | 0 | 0 | ACP, State und Orphans jeweils 0 |
| **Gesamt** | **78** | **4** | **2** | **84 Fälle** |

## Detaillierte Matrix

| ID / Gruppe | Profil / Browser | Daten- oder Flagzustand | Erwartung | Ergebnis |
|---|---|---|---|---|
| EMPTY-01..04 | Manager / Chromium | leeres QA-ACP | 0 Zeilen, Shell stabil, kein Overlay | PASS |
| SHELL-01 | Manager / Chromium | 15 Dateien | 21 Explorer-Zeilen | PASS |
| SHELL-02 | Manager / Chromium | voller Bestand | Split-Pane per Pointer veränderbar | PASS |
| SHELL-03 | Manager / Chromium | voller Bestand | Fullscreen-API und Rückkehr per `fullscreenchange` | PASS |
| TABLE-01 | Manager / Chromium | voller Bestand | globaler Filter reduziert und restauriert | PASS |
| TABLE-02 | Manager / Chromium | voller Bestand | Item-ID auf- und absteigend | PASS |
| TABLE-03 | Manager / Chromium | horizontal gescrollt | Sticky-Spalte bleibt oberstes Klickziel | PASS |
| TABLE-04 | Manager / Chromium | nach Sortierung | Auswahl bleibt per Row-Key stabil | PASS |
| TABLE-EXCLUSION | Manager / Chromium | Draft | Ausschluss sichtbar, Show/Discard konsistent | PASS |
| TABLE-RENUMBER | Manager / Chromium | sauberer Draft | Bestätigung, HTTP 201, Erfolgsmeldung | PASS |
| KEY-01..02 | Manager / Chromium | Tabelle fokussiert | `/`, Pfeile, Home/End/PageUp/PageDown | PASS |
| DRAFT-01 | Manager / Chromium | Tag-Änderung | Debounce, PATCH 200, „Ungespeichert“ | PASS |
| DRAFT-02 | Manager / Chromium | Dirty | Vorschau und Publish | PASS |
| DRAFT-03 | Manager / Chromium | manuelle Reihenfolge | Discard stellt Zustand wieder her | PASS |
| ERROR-DRAFT-409 | zwei Manager / Chromium | parallele Draft-Versionen | 409, Reload, sichtbarer Konflikthinweis | PASS |
| VIEW-01 | Manager / Chromium | READ-ONLY-Perspektive | Editoraktionen verborgen | PASS |
| ROLE-ADMIN | APP_ADMIN / Chromium | alle Flags | Editor, Diagnose und persönliche Aktionen | PASS |
| ROLE-MANAGER | ACP_MANAGER / Chromium | alle Flags | Editor und Perspektivwechsel | PASS |
| ROLE-READER | READ_ONLY / Chromium | alle Flags | keine Schreibaktionen; direkter Patch 403 | PASS |
| ROLE-CREDENTIAL | Credential / Chromium | personalisiert | persönliche Daten/Kollektionen, kein Editor | PASS |
| ROLE-ANON | anonym / Chromium | PUBLIC | lesend, unpersonalisiert | PASS |
| PERSONAL-01..04 | Manager / Chromium | Kategorie/Tag/Notiz | Autosave, Filter, XLSX, Gesamtexport | PASS |
| ERROR-PERSONAL-500 | Manager / Chromium | erstes Autosave 500 | sichtbarer Fehler, Retry 200 | PASS |
| ERROR-EXPORT-500 | Manager / Chromium | Export 500 | verständliche Meldung | PASS |
| COLL-01..05 | Manager / Chromium | leer → gefüllt → gelöscht | CRUD, Drawer, Rename, CSV, Delete | PASS |
| ERROR-COLLECTION-409 | Manager / Chromium | veraltete Version | Reload und bleibende Meldung | **FAIL** |
| PREVIEW-01 | Manager / Chromium | ausgewähltes Item | Vorschauzustand und Navigation | PASS |
| PREVIEW-02 | Manager / Chromium | sechs Modi | alle Paging-Modi auswählbar | PASS |
| PLAYER-MANUAL-TARGET | Manager / Chromium | unbekanntes manuelles Ziel | Override und Reset | PASS |
| RESPONSE-STATE | Manager / Chromium | API-Seed | Rohdaten, Delete, leerer Save-Fehler | PASS |
| PLAYER-FRAME | Manager / Chromium | 15 Quelldateien | echtes Iframe lädt | **BLOCKED** |
| PLAYER-MESSAGE-STATE | Manager / Chromium | 15 Quelldateien | echtes `postMessage` persistiert | **BLOCKED** |
| ERROR-PREVIEW-500 | Manager / Chromium | Unit-View 500 | erklärter Vorschaufehler | PASS |
| DIALOG-01..04 | Manager / Chromium | voller Bestand | Kodierung, Metadaten, Spalten, Historie/Escape | PASS |
| UPLOAD-VALID | Manager / Chromium | Wide-CSV, Dezimalkomma, B1/B2 | Erfolg und korrekter Bericht | PASS |
| UPLOAD-PARTIAL | Manager / Chromium | unbekanntes Item | Teilerfolg verständlich | PASS |
| UPLOAD-INVALID-HEADER | Manager / Chromium | falscher Header | HTTP 400, keine Mutation | PASS |
| UPLOAD-CONFLICT | Manager / Chromium | widersprüchliche Werte | HTTP 400, keine Mutation | PASS |
| ERROR-ITEMLIST-500 | Manager / Chromium | erste Itemliste 500 | Fehlerzustand, Recovery auf 21 | PASS |
| A11Y-01 | Manager / Chromium | Overlays geschlossen | keine WCAG-A/AA-Verstöße | **FAIL** – 3 Kontrastknoten |
| RESP-DESKTOP | Manager / Chromium | 1440×900 | kein Overflow, Auswahl erreichbar | PASS |
| RESP-TABLET | Manager / Chromium | 768×1024 | kein Overflow, Auswahl erreichbar | PASS |
| RESP-MOBILE | Manager / Chromium | 390×844 | Spaltenlayout, Dialog lesbar, kein Overflow | PASS |
| FEATURE-L8-1..8 | Manager / Chromium | sieben binäre Flags | jede Zweierwechselwirkung 00/01/10/11 | PASS |
| CROSS-firefox-* | APP_ADMIN / Firefox | voller Bestand | Load, Draft, Personal, Collection, Dialog | PASS (5) |
| CROSS-webkit-* | APP_ADMIN / WebKit | voller Bestand | Load, Draft, Personal, Collection, Dialog | PASS (5) |
| CROSS-firefox-local | ACP_MANAGER / Firefox | lokaler registrierter Login | Explorer öffnet | **FAIL** |
| CROSS-webkit-local | ACP_MANAGER / WebKit | lokaler registrierter Login | Explorer öffnet | **FAIL** |
| CLEANUP-01 | APP_ADMIN / Chromium + DB read-only | Probe-ACP mit Response-State | Cascade ohne Restdaten | PASS |

## Pairwise-Flags

Die acht L8-Läufe variierten:

1. `enableItemListTags`
2. `enablePersonalItemData`
3. `enableItemCollections`
4. `showItemExplorerPlayerTargetInfo`
5. `showOnlyItemsWithEmpiricalDifficulty`
6. `enableItemExplorerConditionalVisibility`
7. `showAudioVideoCodingVariables`

Zusätzlich waren im Vollprofil unter anderem verfügbare Tags, Player-Highlight, Zielinformationen, persönliche Kategorien/Markierungen, Kollektionen, Sub-ID-Beschriftung und Metadatenspalten aktiviert und in den jeweiligen Kernfällen sichtbar bzw. bedienbar.
