# Content Pool: Grob- und Feinkonzept inkl. Architekturvarianten

## 1. Ausgangslage (Ist-Stand)
Die Anwendung ist aktuell als Node.js-Server mit statischem Frontend umgesetzt und deckt bereits zentrale Faehigkeiten ab:

- ACP-Registry, Detailansicht, Formular-/JSON-Editor
- Validierung (Schema + semantische Integritaet)
- Versions-Diff, Skalen-Simulation
- Import/Export (single + bundle)
- Rollen-/Workflowfunktionen (Review, Status, Release)
- Audit-Logging
- Repositories fuer Filesystem und PostgreSQL

Technischer Kern:

- API + UI-Auslieferung in `server.js`
- Fachmodule in `lib/*` (Validator, Diff, Scale, Merge, AuthZ, Signing)
- Persistenz ueber Repository-Abstraktion (`createRepository`)
- PostgreSQL mit Migrationen (`migrations/001_init.sql`, `migrations/002_workflow.sql`)

## 2. Grobkonzept

### 2.1 Zielbild
Der Content Pool ist die zentrale Arbeits- und Freigabeplattform fuer ACP-Artefakte entlang des Lebenszyklus:

1. Erfassen und Bearbeiten
2. Validieren und Reviewen
3. Versionieren und Vergleichen
4. Freigeben und revisionssicher protokollieren
5. Exportieren zur Weiterverwendung in Folgeprozessen

### 2.2 Fachlicher Scope
In Scope:

- ACP-Objektverwaltung (packageId + version)
- Konsistenz- und Regelpruefungen
- Workflow inkl. Rollen und Review-Tasks
- Release mit Signatur und Audit
- Datenportabilitaet (Import/Export)

Out of Scope (vorerst):

- Vollwertiges IAM/SSO
- Kollaboratives Echtzeit-Editing
- Externe Workflow-Engine
- Asynchrone Grossverarbeitung mit Queue/Worker

### 2.3 Nutzergruppen

- `viewer`: Lesen
- `reviewer`: Review-Queue bearbeiten
- `maintainer`: Inhalte anlegen/aendern
- `publisher`: Freigaben/Release
- `admin`: technische und fachliche Vollrechte

### 2.4 Kernprozesse

1. Erfassen: ACP neu anlegen oder Version klonen
2. Pruefen: Validierung mit strukturiertem Issue-Output
3. Abstimmen: Review-Task erzeugen und durch Status bewegen
4. Freigeben: Statuswechsel + signiertes Release-Event
5. Nachvollziehen: Audit-Log, Release-Historie, Diff zwischen Versionen

### 2.5 Nichtfunktionale Ziele

- Nachvollziehbarkeit: vollstaendige Audit-Trail-Abdeckung fuer mutierende Aktionen
- Verlaesslichkeit: reproduzierbare Validierung und deterministisches Diff
- Sicherheit: Trennung von Rollen, manipulationssicherer Release-Nachweis
- Betriebsfaehigkeit: Healthchecks, Migrationen, sauberer Shutdown
- Erweiterbarkeit: Fachlogik als klar getrennte Module

## 3. Feinkonzept

### 3.1 Fachliche Bausteine (Domain-Zuschnitt)
Empfohlene fachliche Module:

1. `Catalog` (ACP-Registrierung, Versionierung, Clone)
2. `Quality` (Schema-/Integritaetsvalidierung, Fehlerkatalog)
3. `Workflow` (Statusmaschine, Reviews, Freigaben)
4. `Release` (Signatur, Release-Events, Nachweis)
5. `Interchange` (Import/Export, Merge-Strategien)
6. `Analytics` (Diff, Scale-Simulation, Reporting)

Der aktuelle Code bildet diese Bausteine bereits teilweise ab, sollte aber strikter entlang der Module im API-Layer entkoppelt werden.

### 3.2 Ziel-Datenmodell
Persistenzobjekte:

- `acp_entries(package_id, version, status, acp_index, valid, issue_count, summary, timestamps)`
- `acp_review_tasks(..., priority, status, assignee_role, notes, timestamps)`
- `acp_release_events(..., release_target, payload_hash, signature, ts)`
- `acp_audit_log(entry, ts)`

Ergaenzung fuer naechste Ausbaustufe:

- optionale Tabellen fuer voraggregierte Reports (z. B. `acp_validation_reports`)
- technische Idempotenzmarker fuer Import-Batches
- Konfigurations-/Policytabelle fuer workflow- und release-spezifische Regeln

### 3.3 API-Feinkonzept
API in drei Schichten strukturieren:

1. `Transport`: HTTP-Handling, Request-Parsing, Response-Mapping
2. `Application`: Use Cases (SaveAcp, TransitionStatus, CreateReview, ReleaseAcp)
3. `Domain`: reine Fachlogik + Regeln

Empfohlene API-Gruppen:

- `/api/catalog/*`: list, detail, save, clone
- `/api/quality/*`: validate, integrity-report, error-codes
- `/api/workflow/*`: reviews, transition, release-targets
- `/api/release/*`: create release, list release-events
- `/api/interchange/*`: import/export/bundle
- `/api/analytics/*`: diff, scale-simulate

### 3.4 Workflow-Feinkonzept
Statusmaschine fuer ACP:

- `IN_DEVELOPMENT`
- `RELEASED_CONFIDENTIAL`
- `RELEASED_PUBLIC`
- `DISCONTINUED`

Regeln:

- Transitionen nur gemaess Matrix
- kritische Transitionen nur fuer `publisher`/`admin`
- Release nur bei gueltigem ACP und erfolgreicher Signatur

Review-Flow:

- `OPEN -> IN_PROGRESS -> DONE`
- optional Ruecksprungregel (`IN_PROGRESS -> OPEN`) fuer Rework
- Notizen als append-only Eintraege

### 3.5 Validierungs- und Qualitaetskonzept

1. Schicht 1: JSON-Schema-Validierung (AJV)
2. Schicht 2: Semantische Integritaet (Referenzen, Zyklen, Scale-Regeln)
3. Schicht 3 (neu empfohlen): Workflow-Regeln (release readiness checks)

Ausgabe:

- einheitliche Fehlercodes
- Zuordnung zu Objektarten (package, part, unit, module, instrument, scale)
- Maschinenlesbares Reporting fuer UI und spaetere CI-Pruefungen

### 3.6 Sicherheitskonzept
Ist:

- Rollensteuerung ueber `x-role` Header (funktional fuer Demo/Betrieb intern)

Empfohlen (Produktionsziel):

- vorgelagertes AuthN (OIDC/Keycloak/Azure AD)
- Mapping Claims -> interne Rollen
- serverseitige Autorisierung unveraendert als zweite Schutzschicht
- Rotation von `CONTENT_POOL_RELEASE_SIGNING_SECRET` via Secret-Store
- optional asymmetrische Signatur (private/public key) statt shared secret

### 3.7 Betriebskonzept

- Laufzeit: Containerisiert (App + PostgreSQL)
- Health: `/healthz` inkl. Repo-Status
- Migrationen: automatisch beim Start, versioniert
- Logging: strukturierte JSON-Logs mit Korrelations-ID (neu)
- Backups: taegliche DB-Sicherung, Restore-Tests mindestens monatlich

### 3.8 Testkonzept

- Unit-Tests fuer fachliche Kernmodule (`semantic-integrity`, `scale-engine`, `acp-diff`)
- API-Integrationstests fuer kritische Fluesse (save/clone/transition/release/import)
- End-to-End-Smoke mit Referenzdatensaetzen
- Regressionstests fuer Fehlercode-Katalog

## 4. Moegliche Architekturvarianten

### Variante A: Weiterentwickelter modularer Monolith (nahe Ist-Stand)

- Ein Deployable
- klare interne Modulgrenzen (Catalog, Quality, Workflow, Release, Interchange, Analytics)
- gemeinsame PostgreSQL-Datenbank

Vorteile:

- geringe Komplexitaet
- schnelle Lieferfaehigkeit
- gute Wartbarkeit bei Teamgroesse klein bis mittel

Nachteile:

- begrenzte unabhaengige Skalierung einzelner Lasttreiber
- Risiko wachsender Kopplung ohne harte Architekturdisziplin

### Variante B: Hexagonaler Monolith + asynchroner Worker

- API-Anwendung bleibt ein Deployable
- schwere Jobs (Batch-Import, grosse Reports) ueber Queue + Worker
- Ports/Adapter fuer Storage, Signaturdienst, Event-Publisher

Vorteile:

- deutlich bessere Trennung von Fachlogik und Infrastruktur
- hohe Testbarkeit
- skaliert besser bei Lastspitzen ohne vollen Microservice-Overhead

Nachteile:

- zusaetzliche Betriebsbausteine (Queue, Worker)
- etwas hoehere Einfuehrungskosten als Variante A

### Variante C: Domain-orientierte Microservices

- getrennte Services fuer Catalog/Quality/Workflow/Release
- je Service eigene Datenhaltung oder strikt getrennte Schemas
- Event-basierte Orchestrierung

Vorteile:

- maximale Entkopplung und autonome Skalierung
- klare Teamverantwortung pro Domäne

Nachteile:

- deutlich hoeherer Betriebs- und Governance-Aufwand
- komplexere Fehlerszenarien und Konsistenzmanagement

## 5. Architektur-Empfehlung
Empfohlen wird **Variante B (hexagonaler Monolith + Worker)** als Zielarchitektur in 2 Stufen:

1. Kurzfristig: Variante A sauber modularisieren (innerhalb der bestehenden Codebasis)
2. Mittelfristig: Queue/Worker fuer lange Laeufe und Integrationsaufgaben ergaenzen

Begruendung:

- passt zum aktuellen Reifegrad und bestehenden Code
- minimiert Umstellungsrisiko
- schafft belastbare Basis fuer spaetere Service-Aufteilung, falls noetig

## 6. Zielbild (logisch)

```text
[Browser UI]
    |
    v
[HTTP API / BFF]
    |
    +--> [Catalog Use Cases] ----+
    +--> [Quality Use Cases]     |
    +--> [Workflow Use Cases]    +--> [Repository Port] --> [PostgreSQL]
    +--> [Release Use Cases]     |
    +--> [Analytics Use Cases] --+
    |
    +--> [Audit/Event Port] --> [Audit Log / Event Store]
    +--> [Signing Port] --> [Secret or Key Service]

(optional)
[Queue] <--> [Worker: Batch Import, Heavy Reports]
```

## 7. Inkrementeller Umsetzungsplan

### Inkrement 1 (2-4 Wochen)

- API in fachliche Router + Use Cases schneiden
- konsistente Fehler- und Logging-Struktur
- Testluecken fuer Release/Import schliessen

### Inkrement 2 (2-4 Wochen)

- OIDC-basierte Authentifizierung anbinden
- Rollenmapping + Security-Hardening
- Signatur auf asymmetrisches Verfahren vorbereiten

### Inkrement 3 (3-5 Wochen)

- Queue + Worker fuer Bundle-Import und Reports
- idempotente Batch-Verarbeitung
- Monitoring-Dashboards (Fehlerquote, Latenzen, Throughput)

### Inkrement 4 (optional)

- fachliche Event-Schnittstellen fuer externe Systeme
- gezielte Entkopplung einzelner Domänen in separate Services

## 8. Offene Architekturentscheidungen (ADR-Kandidaten)

1. AuthN/AuthZ-Stack (OIDC-Provider, Rollenmodell, Claim-Struktur)
2. Signaturverfahren (HMAC vs. asymmetrisch)
3. Queue-Technologie (Redis Streams, RabbitMQ, PostgreSQL-basiert)
4. Versionierungsstrategie fuer API (URI vs. Header)
5. Event-Formate fuer externe Integrationen

