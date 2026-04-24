# Beispiel: Entwickler-Issue

## Titel

`Snapshot-Restore absichern: Pflichtbegruendung und Sicherheits-Snapshot`

## Bezug zur Anforderung

* Zugehoeriges Anforderungs-Issue:
  `Beispiel: [Anforderung] Sichere Snapshot-Wiederherstellung fuer ACPs`
* Zugehoerige REQ-Datei:
  `docs/requirements/examples/02-req-sichere-snapshot-wiederherstellung.md`

## Beschreibung

Die fachliche Anforderung ist geklaert.
Beim Restore eines Snapshots soll der aktuelle ACP-Stand zuerst automatisch gesichert werden.
Ausserdem soll der Restore im UI nicht mehr ueber `confirm(...)`, sondern ueber einen Dialog mit Pflichtbegruendung erfolgen.

## Loesungsansatz

Backend:

* Neuen `RestoreSnapshotDto` mit Feld `reason` einfuehren.
* Restore-Endpunkt auf Request-Body erweitern.
* In `SnapshotsService.restore(...)` zuerst Sicherheits-Snapshot erzeugen und danach Restore ausfuehren.
* API-Response um Informationen zum erzeugten Sicherheits-Snapshot erweitern oder alternativ im Frontend nach Reload aus der Liste ableiten.

Frontend:

* In der Snapshot-Ansicht den bestehenden Browser-Confirm durch einen Dialog ersetzen.
* Eingabe `reason` als Pflichtfeld behandeln.
* Erfolgsmeldung mit Hinweis auf den erzeugten Sicherheits-Snapshot anzeigen.
* Nach erfolgreichem Restore die Snapshot-Liste neu laden.

## Betroffene Bereiche

* Frontend
* Backend
* API / DTOs
* Snapshots
* Dokumentation

## Betroffene Dateien

Voraussichtlich:

* `backend/src/snapshots/snapshots.controller.ts`
* `backend/src/snapshots/snapshots.service.ts`
* `backend/src/snapshots/snapshots.service.spec.ts`
* `backend/src/acp/dto/acp.dto.ts`
* `frontend/src/app/core/services/api.service.ts`
* `frontend/src/app/acp-manager/snapshots/snapshots.component.ts`
* `frontend/src/app/core/models/api.models.ts`

## Akzeptanzkriterien

* [ ] Restore-Endpunkt akzeptiert eine Begruendung im Request-Body.
* [ ] `SnapshotsService` erzeugt vor Restore einen Sicherheits-Snapshot.
* [ ] Schlaegt der Sicherheits-Snapshot fehl, wird nicht wiederhergestellt.
* [ ] Frontend verwendet einen Dialog mit Pflichtfeld statt `confirm(...)`.
* [ ] Nach erfolgreichem Restore wird die Liste aktualisiert und eine Erfolgsmeldung angezeigt.
* [ ] Backend-Tests fuer den neuen Restore-Ablauf sind vorhanden.

## Offene Punkte

* Ob die Erfolgsmeldung die Sicherheitsversion direkt aus dem Backend-Response oder aus dem anschliessenden Reload ableitet.
* Ob fuer `reason` nur `required` oder zusaetzlich `minLength` gilt.

## Testhinweise

* Backend-Unit-Tests fuer:
  Sicherheits-Snapshot wird vor Restore erzeugt,
  Restore bricht bei Snapshot-Fehler ab.
* Frontend manuell pruefen:
  Dialogvalidation,
  Erfolgsfall,
  Fehlerfall.
