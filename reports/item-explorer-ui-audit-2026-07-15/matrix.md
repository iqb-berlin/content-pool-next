# Abdeckungsmatrix

Legende: `PASS` = Erwartung erfüllt, `FAIL` = reproduzierter Produktbefund, `BLOCKED` = nicht zuverlässig über die sichtbare UI erzeugbar bzw. Browsersequenz instabil. Frühere Testtreiber-Artefakte sind nicht enthalten.

| Bereich | Fall | Profil/Rolle | Browser/Viewport | Ergebnis | Bemerkung/Evidenz |
|---|---|---|---|---|---|
| Baseline | Frontend-Tests | Build | CLI | PASS | 413/413 |
| Baseline | Lint | Build | CLI | PASS | keine Fehler |
| Baseline | Production-Build | Build | CLI | PASS | erfolgreich |
| Baseline | Frontend-Neustart/HMR-Overlay | Öffentlich | Chromium 1440×900 | PASS | Overlay verschwunden |
| Datenzustand | Öffentliches „Deutsch“ lesend | anonym | Chromium 1440×900 | PASS | 15 Dateien/21 Explorer-Zeilen |
| Datenzustand | Leeres QA-ACP | APP_ADMIN | Chromium 1440×900 | PASS | leerer Zustand korrekt |
| Datenzustand | Gefülltes QA-ACP | APP_ADMIN | Chromium 1440×900 | PASS | 21 Basis-, später 22 Zeilen |
| Shell | Breadcrumb | ACP_MANAGER | Chromium 1440×900 | PASS | Route und Labels korrekt |
| Shell | Zähler/Status/Disabled/Busy | ACP_MANAGER | Chromium 1440×900 | PASS | Clean/Dirty/Saving beobachtet |
| Shell | Split-Pane Drag | ACP_MANAGER | Chromium 1440×900 | PASS | links 626→766 px |
| Shell | Vollbild Ein/Aus | ACP_MANAGER | Chromium 1440×900 | PASS | Breadcrumb korrekt aus-/eingeblendet |
| Shell | READ-ONLY-Vorschau | ACP_MANAGER | Chromium 1440×900 | PASS | Editoraktionen verborgen |
| Tabelle | Globaler Filter | ACP_MANAGER | Chromium 1440×900 | PASS | 21→11→21 |
| Tabelle | Item-ID-Spaltenfilter | ACP_MANAGER | Chromium 1440×900 | PASS | eindeutiger Treffer |
| Tabelle | Numerischer Min/Max-Filter | ACP_MANAGER | Chromium 1440×900 | PASS | korrekt eingegrenzt |
| Tabelle | Item-ID Sortierung normal | ACP_MANAGER | Chromium 1440×900 | PASS | beide Richtungen |
| Tabelle | Sticky Item-ID nach Horizontal-Scroll | ACP_MANAGER | Chromium 1440×900 | FAIL | F-03 |
| Tabelle | Auswahlstabilität | ACP_MANAGER | Chromium 1440×900 | PASS | Navigation/Fokus stabil |
| Tabelle | Teilbewertungszeilen/Sub-ID-Labels | ACP_MANAGER | Chromium 1440×900 | PASS | Stufe A/B |
| Tabelle | Tags hinzufügen/veröffentlichen | ACP_MANAGER | Chromium 1440×900 | PASS | READ-ONLY sichtbar |
| Tabelle | Ausschließen/anzeigen/verwerfen | ACP_MANAGER | Chromium 1440×900 | PASS | Zustand konsistent |
| Tabelle | Manuelle Reihenfolge per Cmd/Ctrl | ACP_MANAGER | Chromium 1440×900 | PASS | Zeile verschoben |
| Tabelle | Manuelle Reihenfolge per Button | ACP_MANAGER | Chromium 1440×900 | PASS | Zeile verschoben |
| Tabelle | Neunummerierung Cancel/Confirm | ACP_MANAGER | Chromium 1440×900 | PASS | 22 Zeilen |
| Tastatur | `/` Filterfokus | ACP_MANAGER | Chromium 1440×900 | PASS | Fokus im globalen Filter |
| Tastatur | Pfeil hoch/runter | ACP_MANAGER | Chromium 1440×900 | PASS | Auswahl navigiert |
| Tastatur | Pos1/Ende | ACP_MANAGER | Chromium 1440×900 | PASS | Sprung korrekt |
| Tastatur | PageUp/PageDown | ACP_MANAGER | Chromium 1440×900 | PASS | Sprung korrekt |
| Tastatur | Enter/Space für alle interaktiven Zellen | ACP_MANAGER | Chromium | BLOCKED | nicht vollständig isoliert |
| Tastatur | Vollständige Tab-Reihenfolge | alle Rollen | Chromium | BLOCKED | kein vollständiger Fokusgraph |
| Tastatur | Escape Kodierungsdialog | ACP_MANAGER | Chromium | PASS | Overlay geschlossen |
| Tastatur | Escape Metadaten-Drawer | ACP_MANAGER | Chromium | PASS | Drawer geschlossen |
| Tastatur | Escape-Priorität über verschachtelte Overlays | ACP_MANAGER | Chromium | BLOCKED | Einzeloverlays geprüft |
| Draft | Clean/Dirty/Saving | ACP_MANAGER | Chromium | PASS | sichtbare Statuswechsel |
| Draft | Debounce-Patch | ACP_MANAGER | Chromium | PASS | Patch nach Wartefenster |
| Draft | Publish mit Vorschau | ACP_MANAGER | Chromium | PASS | veröffentlicht |
| Draft | Discard | ACP_MANAGER | Chromium | PASS | unverändert wiederhergestellt |
| Draft | Zwei Manager/HTTP 409 | 2× ACP_MANAGER | Chromium | FAIL | F-02, Meldung fehlt |
| Draft | Verlassen „Bleiben“ | ACP_MANAGER | Chromium | BLOCKED | Browsersequenz durch persistierten Zustand instabil; Regressionstest grün |
| Draft | Verlassen „Nicht speichern“ | ACP_MANAGER | Chromium | BLOCKED | Browsersequenz durch persistierten Zustand instabil; Regressionstest grün |
| Draft | Verlassen „Speichern & Weiter“ | ACP_MANAGER | Chromium | BLOCKED | Browsersequenz durch persistierten Zustand instabil; Regressionstest grün |
| Rolle | APP_ADMIN | APP_ADMIN | Chromium 1440×900 | PASS | alle Admin-/Editoraktionen |
| Rolle | ACP_MANAGER | ACP_MANAGER | Chromium 1440×900 | PASS | Editor/Publish/Diagnose |
| Rolle | READ_ONLY | READ_ONLY | Chromium 1440×900 | PASS | keine Schreibaktionen |
| Rolle | Credential | Credential | Chromium 1440×900 | PASS | persönliche Funktionen, kein Editor |
| Rolle | Anonym öffentlich | anonym | Chromium 1440×900 | PASS | keine persönlichen/Editoraktionen |
| Persönlich | Kategorie/Tags/Notiz | ACP_MANAGER | Chromium | PASS | synthetische Daten gespeichert |
| Persönlich | Autosave | ACP_MANAGER | Chromium | PASS | persistiert |
| Persönlich | HTTP 500 + Retry | ACP_MANAGER | Chromium | PASS | Recovery erfolgreich |
| Persönlich | Filter | ACP_MANAGER | Chromium | PASS | persönliche Daten filterbar |
| Persönlich | Eigener XLSX-Export | ACP_MANAGER | Chromium/Firefox/WebKit | PASS | gültiges OOXML |
| Persönlich | Manager-Gesamtexport | ACP_MANAGER | Chromium | PASS | CSV, erwartete QA-Zeile |
| Persönlich | Sitzungswechsel bei laufendem Save | mehrere | Chromium | BLOCKED | kein deterministischer UI-Hook |
| Persönlich | Navigation mit offenem Autosave | ACP_MANAGER | Chromium | BLOCKED | nicht isoliert reproduziert |
| Kollektionen | Leerzustand/Anlegen/Aktivieren | ACP_MANAGER | Chromium | PASS | korrekt |
| Kollektionen | Umbenennen | ACP_MANAGER | Chromium | PASS | „QA Auswahl“ |
| Kollektionen | Teilzeile hinzufügen/entfernen | ACP_MANAGER | Chromium | PASS | 1→0 Items |
| Kollektionen | Zeit/Summe/unvollständig | ACP_MANAGER | Chromium | PASS | Summary sichtbar |
| Kollektionen | Leeren/Löschen | ACP_MANAGER | Chromium | PASS | vollständig entfernt |
| Kollektionen | CSV-Export | ACP_MANAGER | Chromium | PASS | Header + 1 Datenzeile |
| Kollektionen | Versionskonflikt | 2× ACP_MANAGER | Chromium | BLOCKED | kein separater deterministischer UI-Hook |
| Kollektionen | Sitzungswechsel | Manager/Credential | Chromium | BLOCKED | nicht in laufender Mutation isoliert |
| Vorschau | Item auswählen/Player oder erklärter Missing-State | ACP_MANAGER | Chromium | PASS | konsistenter Zustand |
| Vorschau | sechs Paging-Modi | ACP_MANAGER | Chromium | PASS | alle Optionen geschaltet |
| Vorschau | Zielinformationen/Highlight | Featureprofil | Chromium | PASS | Badges bei Difficulty-only |
| Vorschau | manuelles/unbekanntes/überschriebenes Ziel | ACP_MANAGER | Chromium | BLOCKED | keine vollständige Player-Testfixture |
| Vorschau | kontrollierte postMessage-Payloads | ACP_MANAGER | Chromium | BLOCKED | keine dedizierte Player-Testfixture |
| Vorschau | Response-State Save-Dialog | ACP_MANAGER | Chromium | PASS | Empty-State-Hinweis korrekt |
| Vorschau | Response-State Rohdaten/Delete-Dialog | ACP_MANAGER | Chromium | PASS | Dialoge/Escape korrekt |
| Dialog | Kodierung Suche/Sortierung/Escape | ACP_MANAGER | Chromium | PASS | korrekt |
| Dialog | Audio-/Video-Variablen | Featureprofil | Chromium | PASS | Feature aktiviert und Dialog geladen |
| Dialog | Metadaten-Drawer | ACP_MANAGER | Chromium | PASS | öffnen/Escape |
| Dialog | Spaltenverwaltung | ACP_MANAGER | Chromium | PASS | Suche/Abbrechen |
| Dialog | Änderungshistorie | ACP_MANAGER | Chromium | PASS | 21+ Einträge, CSV |
| Upload | Ungültiger Header | ACP_MANAGER | Chromium | PASS | verständliche Fehlermeldung |
| Upload | Wide-CSV Dezimalpunkt/-komma | ACP_MANAGER | Chromium | PASS | 2/2 erfolgreich |
| Upload | Teilbewertung/Sub-ID | ACP_MANAGER | Chromium | PASS | zwei Teilzeilen |
| Upload | Publish/Difficulty-only | ACP_MANAGER | Chromium | PASS | genau zwei Zeilen |
| Upload | Werte bereinigen/Discard | ACP_MANAGER | Chromium | PASS | Draft verworfen |
| Upload | widersprüchliche/leere/unbekannte Werte komplett | ACP_MANAGER | Chromium | BLOCKED | nicht jede seltene Variante einzeln erzeugt |
| Feature | Pairwise Profil 1 | ACP_MANAGER | Chromium | PASS | Tags/AV/CV/Difficulty/Highlight/Target/Personal/Collections aus |
| Feature | Pairwise Profil 2 | ACP_MANAGER | Chromium | PASS | Mehrfachkombination an, Collections aus |
| Feature | Pairwise Profil 3 | ACP_MANAGER | Chromium | PASS | Tags/AV/CV/Collections an |
| Feature | Pairwise Profil 4 | ACP_MANAGER | Chromium | PASS | Difficulty/Highlight/Target/Personal/Collections an |
| Feature | Pairwise Profil 5 | ACP_MANAGER | Chromium | PASS | Tags + Difficulty + Highlight |
| Feature | Pairwise Profil 6 | ACP_MANAGER | Chromium | PASS | AV + Target + Personal |
| Feature | Pairwise Profil 7 | ACP_MANAGER | Chromium | PASS | nach Parameterimport korrigiert bestätigt |
| Feature | Pairwise Profil 8 | ACP_MANAGER | Chromium | PASS | Highlight + Personal |
| Feature | Vollprofil/kritische Mehrfachkombination | ACP_MANAGER | Chromium | PASS | alle Hauptflags gemeinsam |
| Fehler | Itemliste HTTP 500 + Recovery | ACP_MANAGER | Chromium | PASS | verständlicher Fehler, Recovery |
| Fehler | Persönlicher Autosave HTTP 500 + Retry | ACP_MANAGER | Chromium | PASS | Retry erfolgreich |
| Fehler | Draft HTTP 409 | 2× ACP_MANAGER | Chromium | FAIL | F-02 |
| Fehler | 401/403 je Sub-API | Rollenmatrix | Chromium | BLOCKED | Berechtigungs-UI geprüft, nicht jede API künstlich injiziert |
| Fehler | Collection/Preview/Export HTTP 500 | ACP_MANAGER | Chromium | BLOCKED | nicht alle Sub-APIs injiziert |
| Fehler | verzögerte/veraltete/abgebrochene Requests | ACP_MANAGER | Chromium | BLOCKED | keine vollständige deterministische Injection |
| Responsive | Desktop | ACP_MANAGER | Chromium 1440×900 | PASS | kein Body-Overflow |
| Responsive | Tablet | ACP_MANAGER | Chromium 768×1024 | PASS | erreichbar |
| Responsive | Mobile | ACP_MANAGER | Chromium 390×844 | FAIL | F-04 |
| Browser | Firefox Smoke | ACP_MANAGER | Firefox 1440×900 | PASS | Kernpfade + Download |
| Browser | WebKit Smoke | ACP_MANAGER | WebKit 1440×900 | PASS | Kernpfade + Download |
| A11y | Select-Namen | ACP_MANAGER | Chromium/Axe | FAIL | F-05 |
| A11y | Farbkontrast | ACP_MANAGER | Chromium/Axe | FAIL | F-06 |
| A11y | Frame-Titel/Scrollregion | ACP_MANAGER | Chromium/Axe | FAIL | F-07 |
| Cleanup | Credential/ACP/User API-Delete | APP_ADMIN | API | PASS | alle HTTP 200 |
| Cleanup | ACP-Delete entfernt Response-State | APP_ADMIN | API/DB | FAIL | F-01, zunächst 1 Restzeile |
| Cleanup | Explizites Rest-Cleanup + DB-Verifikation | APP_ADMIN | API/DB read-only | PASS | alle geprüften Zähler 0 |
