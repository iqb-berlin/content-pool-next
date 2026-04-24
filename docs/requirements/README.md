# Anforderungen

Dieses Verzeichnis ist die fachliche Schnittstelle zwischen Projektmanagement und Entwicklung in ContentPool.

## Ziel

Fachliche Anforderungen sollen hier so beschrieben werden, dass sie:

* fachlich eindeutig,
* fuer die Entwicklung umsetzbar,
* und fuer Review und Abnahme pruefbar sind.

## Wann reicht ein GitHub-Issue?

Ein reines Issue reicht, wenn die Anforderung klein ist und ohne weitere Zerlegung beschrieben werden kann.

Empfohlenes Template:

* `.github/ISSUE_TEMPLATE/anforderung-aus-fachsicht.md`

## Wann zusaetzlich eine REQ-Datei?

Eine Datei unter `docs/requirements/` sollte zusaetzlich angelegt werden, wenn mindestens einer der folgenden Punkte zutrifft:

* mehrere Nutzerrollen oder Zugriffspfade betroffen sind
* Frontend und Backend angepasst werden muessen
* fachliche Regeln fuer ACPs, Dateien, Snapshots oder Zugriffsmodelle geklaert werden muessen
* externe Systeme ueber die API betroffen sind
* die Abnahme ohne schriftliche Kriterien schwierig waere

## Benennung

Empfohlenes Schema:

* `REQ-001-kurztitel.md`
* `REQ-002-snapshot-restore.md`
* `REQ-003-index-export.md`

Die Nummer muss nicht lueckenlos sein, sollte aber eindeutig bleiben.

## Mindestinhalt

Jede REQ-Datei sollte enthalten:

* Kontext / Problem
* Zielbild
* Scope mit Muss-, Soll-Anforderungen und Nicht-Zielen
* fachliche Regeln
* Akzeptanzkriterien
* offene Fragen

## Vorlage

Als Startpunkt dient:

* `docs/requirements/REQ-template.md`

## Beispiele

Ein kompletter Beispielablauf liegt unter `docs/requirements/examples/`:

* `01-fachanforderung-sichere-snapshot-wiederherstellung.md`
* `02-req-sichere-snapshot-wiederherstellung.md`
* `03-entwicklungsissue-sichere-snapshot-wiederherstellung.md`
