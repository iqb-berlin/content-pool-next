# REQ-Beispiel Sichere Snapshot-Wiederherstellung

## Metadaten

* Status: `Ready`
* Ansprechpartner Fachseite: Projektmanagement ContentPool
* Ansprechpartner Entwicklung: ACP / Snapshot-Team
* Zugehoeriges Issue: `Beispiel: [Anforderung] Sichere Snapshot-Wiederherstellung fuer ACPs`
* Prioritaet: `hoch`
* Zieltermin / Meilenstein: naechster Release-Zyklus

## Kontext / Problem

Die Snapshot-Wiederherstellung ist in ContentPool eine sensible Operation, weil sie den aktuellen ACP-Index auf einen frueheren Stand zuruecksetzt.
Aktuell erfolgt die Aktion mit einem einfachen Bestaetigungsdialog und ohne fachliche Begruendung.
Der unmittelbar vorherige Stand wird nicht automatisch als Sicherheits-Snapshot gesichert.

Dadurch entstehen zwei Risiken:

* versehentliche Restore-Aktionen sind zu leicht ausloesbar
* der aktuelle Stand kann vor einer Wiederherstellung verloren gehen

## Zielbild

Eine Snapshot-Wiederherstellung soll bewusst, nachvollziehbar und rueckverfolgbar sein.
Vor jeder Wiederherstellung wird der aktuelle ACP-Zustand automatisch als Sicherheits-Snapshot gespeichert.
Die ausloesende Person muss im UI eine Begruendung eingeben.

## Nutzerrollen

* ACP-Manager

## Scope

### Muss-Anforderungen

* [ ] Eine Wiederherstellung kann nur ueber einen dedizierten Dialog gestartet werden.
* [ ] Der Dialog zeigt mindestens Zielversion und Warnhinweis an.
* [ ] Die ausloesende Person muss eine Begruendung eingeben.
* [ ] Vor dem Restore wird automatisch ein Sicherheits-Snapshot des aktuellen ACP-Zustands erzeugt.
* [ ] Nach erfolgreicher Wiederherstellung wird die erzeugte Sicherheitsversion im UI genannt.

### Soll-Anforderungen

* [ ] Automatisch erzeugte Sicherheits-Snapshots erhalten einen klar erkennbaren Changelog-Text.
* [ ] Die Snapshot-Liste kann spaeter automatisch erzeugte Sicherheits-Snapshots visuell hervorheben.

### Nicht-Ziele / Abgrenzung

* Kein Restore einzelner Dateien oder einzelner Bereiche des ACP-Index
* Keine Aenderung am grundsaetzlichen Snapshot-Datenmodell ausserhalb des benoetigten Request-Flows
* Keine neue Audit-Tabelle
* Keine Erweiterung auf oeffentliche Views oder API-Konsumenten

## Gewuenschter Ablauf

1. Ein ACP-Manager klickt in der Snapshot-Liste auf `Wiederherstellen`.
2. Statt eines einfachen Browser-Dialogs oeffnet sich ein Formular-Dialog.
3. Der Dialog zeigt:
   Zielversion,
   Warnhinweis zur Ruecksetzung,
   Pflichtfeld fuer Begruendung.
4. Beim Bestaetigen validiert das UI, dass eine Begruendung vorhanden ist.
5. Das Backend erzeugt zuerst einen Sicherheits-Snapshot des aktuellen ACP-Stands.
6. Anschliessend stellt das Backend den gewaehlten Snapshot wieder her.
7. Das UI zeigt nach Erfolg eine Rueckmeldung mit Verweis auf den erzeugten Sicherheits-Snapshot.
8. Die Snapshot-Liste wird aktualisiert.

## Fachliche Regeln

* Die Begruendung ist Pflicht.
* Leere oder rein aus Leerzeichen bestehende Eingaben sind unzulaessig.
* Der Sicherheits-Snapshot wird immer vor dem eigentlichen Restore erzeugt.
* Der Sicherheits-Snapshot muss eindeutig erkennen lassen, dass er automatisch vor einer Wiederherstellung erzeugt wurde.
* Schlaegt die Erzeugung des Sicherheits-Snapshots fehl, darf kein Restore erfolgen.
* Schlaegt das Restore fehl, bleibt der Sicherheits-Snapshot dennoch erhalten.

## Daten / Schnittstellen / Auswirkungen

* Frontend:
  Snapshot-Liste ersetzt `confirm(...)` durch einen Formular-Dialog mit Pflichtfeld fuer Begruendung.
* Backend:
  Restore-Endpunkt akzeptiert zusaetzlich einen Request-Body mit Begruendung.
* Datenmodell:
  Kein zwingender Schema-Umbau erforderlich, wenn die Begruendung im Changelog des Sicherheits-Snapshots abgelegt wird.
* API / externe Systeme:
  Der interne Restore-Aufruf aendert sein Request-Format.
  Externe API-Konsumenten sind fuer dieses Beispiel nicht im Scope.
* Authentifizierung / Autorisierung:
  Bestehende Zugriffsbeschraenkungen fuer das Management bleiben unveraendert.

## Akzeptanzkriterien

* [ ] In der Snapshot-Ansicht gibt es vor Restore einen Dialog statt eines simplen Browser-Confirm.
* [ ] Das Restore kann ohne Begruendung nicht abgeschickt werden.
* [ ] Ein erfolgreicher Restore erzeugt zuerst genau einen neuen Sicherheits-Snapshot.
* [ ] Der Sicherheits-Snapshot enthaelt im Changelog einen maschinenlesbaren Hinweis auf das Restore sowie die eingegebene Begruendung.
* [ ] Bei Fehler in der Sicherheits-Snapshot-Erzeugung wird kein Restore ausgefuehrt.
* [ ] Die Snapshot-Liste wird nach erfolgreichem Restore neu geladen.

## Test- und Abnahmehinweise

* ACP mit mindestens drei Snapshot-Versionen verwenden.
* Zieltest 1:
  Restore ohne Begruendung versuchen.
  Erwartung: UI blockiert die Aktion.
* Zieltest 2:
  Restore mit Begruendung ausfuehren.
  Erwartung: Neue Snapshot-Version entsteht vor dem Restore und ist in der Liste sichtbar.
* Zieltest 3:
  Erfolgsmeldung pruefen.
  Erwartung: Hinweis auf Sicherheits-Snapshot vorhanden.
* Zieltest 4:
  Fehlerfall bei Snapshot-Erzeugung simulieren.
  Erwartung: Restore wird nicht ausgefuehrt.

## Abhaengigkeiten / Risiken

* Wenn der bisherige Restore-Endpoint bereits extern genutzt wird, ist die API-Aenderung abzustimmen.
* Die Formulierung des automatischen Changelog-Texts muss stabil genug fuer spaetere Auswertung sein.
* Aktuell wird beim Restore nur der ACP-Index zurueckgesetzt.
  Falls spaeter weitere ACP-Bestandteile einbezogen werden sollen, ist der Scope neu zu pruefen.

## Offene Fragen

* Soll fuer die Begruendung eine Mindestlaenge, z. B. 10 Zeichen, gelten?
* Soll der Sicherheits-Snapshot in der UI besonders gekennzeichnet werden?
* Soll der Erfolgstext nur im Frontend erscheinen oder auch im API-Response explizit mitgegeben werden?
