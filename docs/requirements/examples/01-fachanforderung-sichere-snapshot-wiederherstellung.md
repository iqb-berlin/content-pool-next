# Beispiel: Fachanforderung

## Titel

`[Anforderung] Sichere Snapshot-Wiederherstellung fuer ACPs`

## Ziel / Nutzen

Als ACP-Manager moechte ich Snapshots nur mit einer bewussten Bestaetigung und einer Begruendung wiederherstellen koennen, damit versehentliche Wiederherstellungen vermieden werden und die Aktion fachlich nachvollziehbar bleibt.

## Betroffene Nutzerrolle

* ACP-Manager

## Ist-Situation

Snapshots koennen aktuell direkt aus der Snapshot-Liste wiederhergestellt werden.
Die Aktion wird nur ueber einen einfachen Browser-Dialog bestaetigt.
Es gibt keine Pflicht zur Begruendung, und der aktuelle Stand des ACP wird vor der Wiederherstellung nicht automatisch als Sicherheitsstand gesichert.

## Gewuenschter Ablauf

1. Ein ACP-Manager waehlt in der Snapshot-Liste eine vorhandene Version zur Wiederherstellung aus.
2. Vor der Ausfuehrung erscheint ein Dialog mit Hinweis, welche Version wiederhergestellt werden soll.
3. Der ACP-Manager muss eine kurze Begruendung fuer die Wiederherstellung eingeben.
4. Vor der eigentlichen Wiederherstellung legt das System automatisch einen Sicherheits-Snapshot des aktuellen ACP-Stands an.
5. Danach wird die gewaehlte Snapshot-Version wiederhergestellt.
6. Der ACP-Manager erhaelt eine Rueckmeldung, dass die Wiederherstellung erfolgreich war und welcher Sicherheits-Snapshot dabei erzeugt wurde.

## Fachlicher Scope

* [ ] Wiederherstellung nur nach expliziter Bestaetigung im UI
* [ ] Begruendung fuer die Wiederherstellung ist Pflicht
* [ ] Automatischer Sicherheits-Snapshot vor jeder Wiederherstellung
* [ ] Erfolgsmeldung mit Hinweis auf die erzeugte Sicherheitsversion

## Optionaler Scope

* [ ] Anzeige der Begruendung direkt in der Snapshot-Liste
* [ ] Eigene Kennzeichnung automatisch erzeugter Sicherheits-Snapshots

## Nicht-Ziele / Abgrenzung

* Keine Wiederherstellung einzelner Dateien
* Kein partielles Restore einzelner Teile des ACP-Index
* Keine neue Rechte- oder Rollensystematik
* Kein Undo-Button ueber den Sicherheits-Snapshot hinaus

## Betroffene Bereiche

* Snapshots / Restore / Diff
* ACP-Verwaltung

## Akzeptanzkriterien

* [ ] Ein Restore kann nicht mehr direkt ohne Eingabe einer Begruendung gestartet werden.
* [ ] Vor jedem Restore wird automatisch ein Sicherheits-Snapshot des aktuellen ACP-Stands angelegt.
* [ ] Nach erfolgreichem Restore wird die Nummer oder Kennung des Sicherheits-Snapshots angezeigt.
* [ ] Die bestehende Snapshot-Erstellung fuer manuelle Snapshots bleibt unveraendert nutzbar.

## Beispiele / Referenzen

Fachlicher Anlass:
Bei versehentlichen Wiederherstellungen darf der unmittelbar vorherige Stand nicht verloren gehen.

## Prioritaet / Termin

* Prioritaet: `hoch`
* Gewuenschter Termin / Meilenstein: naechster Release-Zyklus
* Abhaengigkeiten: keine externen Abhaengigkeiten

## Offene Fragen

* Wie lang muss die Mindestbegruendung sein?
* Soll der Sicherheits-Snapshot in der Liste sichtbar speziell markiert werden?
* Reicht eine Erfolgsmeldung im UI, oder wird zusaetzlich ein separates Ereignisprotokoll benoetigt?

## Ergaenzende Spezifikation

Fuer die Umsetzung wird zusaetzlich die Datei `02-req-sichere-snapshot-wiederherstellung.md` verwendet.
