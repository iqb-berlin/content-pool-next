# Kommentarsicht und Review-Gruppen (#64, #161)

## Gemeinsamer Entwurf

Die Umsetzung baut auf dem Kommentarlebenszyklus aus #63 und den ACP-Grants aus
#60 auf. Zuerst werden Konfiguration, Sichtbarkeitsprüfung und Aktualisierung
vereinheitlicht (#64); darauf setzen Gruppenverwaltung und die feste Zuordnung
von Threads auf (#161). Beide Teile verwenden denselben Prüfpfad für Booklets,
Units, Items und Kodierung.

`review:manage` konfiguriert den Review und sieht sämtliche Kommentare, auch bei
deaktiviertem Review. `review:participate` erlaubt eigene Kommentare und Antworten,
solange der Review aktiv ist. Die bestehenden Ziel-Features gelten weiterhin.
Management vergibt kein Recht, fremde Kommentare zu bearbeiten.

| Modus   | Teilnehmende                                                                      | Review-Verantwortliche |
| ------- | --------------------------------------------------------------------------------- | ---------------------- |
| PRIVATE | eigene Kommentare                                                                 | alle Kommentare        |
| SHARED  | alle Kommentare                                                                   | alle Kommentare        |
| GROUP   | Kommentare ihrer aktiven Gruppen; Bestandskommentare nach bisheriger Sichtbarkeit | alle Kommentare        |

Die ACP-weite Regel wird zur Anfragezeit angewandt. Ein Wechsel auf SHARED teilt
auch bereits vorhandene Gruppenkommentare. Die Oberfläche warnt ausdrücklich;
die API verlangt `confirmExistingComments: true` und die aktuelle `configVersion`.
Eine veraltete Konfiguration erhält HTTP 409. Ein Moduswechsel schreibt keine
Kommentare um und dupliziert oder löscht sie nicht.

## Festgelegte Gruppenregeln

- Gruppen sind ACP-spezifisch und unabhängig von Rollen und Zugangsrechten.
- Mehrfachmitgliedschaften sind erlaubt. Mitglieder referenzieren stabile
  Nutzer- oder Credential-IDs, keine wiederverwendbaren Nutzernamen.
  Beim Speichern der Gruppen werden bestehende Verweise auf inzwischen entfernte
  ACP-Mitglieder bereinigt. Neue ungültige Zuweisungen werden weiterhin abgewiesen.
- Ein neuer Hauptkommentar im Gruppenmodus gehört genau einer aktiven Gruppe.
  Bei einer einzigen Teilnehmer-Mitgliedschaft erfolgt die Auswahl automatisch.
  Bei mehreren Mitgliedschaften und für Verantwortliche ist die Auswahl explizit.
- Antworten erben die Gruppe des Threads. Ein abweichendes `groupId` wird
  zurückgewiesen. Auch Verantwortliche können keine Antwort unbemerkt verschieben.
- Gruppen werden archiviert. Kommentare und Mitgliedschaften bleiben gespeichert;
  archivierte Gruppen sind nur noch für Verantwortliche sichtbar und nehmen keine
  neuen Hauptkommentare oder Antworten an.
- Nach einem Gruppenwechsel erhält ein Teilnehmer keinen Zugriff mehr auf die
  Kommentare der alten Gruppe, auch wenn er sie selbst verfasst hat. Kommentare
  werden dabei nicht verschoben. Management behält den Überblick.
- Beim Einstieg in GROUP behalten Kommentare ohne Gruppe die vorherige private
  oder geteilte Sichtbarkeit. Es gibt keine automatische Zuordnung zu Gruppen.
- Gruppenübergreifende Hauptkommentare, managerinterne Threads und die nachträgliche
  Neuzuordnung bestehender Threads gehören nicht zu dieser Ausbaustufe.

## Persistenz und konkurrierende Änderungen

`acp_access_configs` enthält die versionierte Gruppenliste als JSONB-Aggregat
(`review_groups`), `review_config_version` und die interne monotone
`review_revision`. Maximal 100 Gruppen mit jeweils 2.000 Mitgliedschaften werden
akzeptiert. `comments.group_id` hält die unveränderliche Thread-Zuordnung.

Konfigurations- und Kommentaränderungen sperren zuerst dieselbe ACP-Konfiguration
innerhalb ihrer Transaktion. Dadurch wird eine Mitgliedschaft nicht zwischen
Schreibberechtigungsprüfung und Speicherung geändert. Ein PostgreSQL-Trigger
zählt Kommentaränderungen innerhalb derselben Transaktion in der Revision mit.
Die Gruppenverwaltung prüft Mitgliedschaften gegen die tatsächlichen ACP-Zugänge.
Andere Feature-Einstellungen können Review-Modus und Aktivierung nicht überschreiben.

Die interne ACP-Revision wird Teilnehmenden **nicht** offengelegt: Änderungen
fremder Gruppen dürfen nicht einmal über Versionswerte erkennbar sein. Der
öffentlich verwendete ETag ist deshalb ein SHA-256-Fingerabdruck ausschließlich
des sichtbaren Snapshots einschließlich sichtbarer Gruppenbezeichnungen.
Unveränderte Antworten auf `If-None-Match` liefern HTTP 304. Dieser sichtbare
Fingerabdruck ersetzt die in #64 ursprünglich vorgeschlagene öffentliche monotone
ACP-Revision, um die strengere Isolationsanforderung aus #161 zu erfüllen.

Ein Vote-Modul besteht derzeit nicht. Künftige Votes müssen dieselbe Sichtbarkeit
und Transaktionsgrenze sowie den Revisionsmechanismus verwenden.

## Oberfläche, API und Exporte

Im Review-Einstieg werden Aktivierung, Sichtbarkeit und Gruppen gemeinsam
versioniert gespeichert. Mitglieder erscheinen als Nutzerkonto oder ACP-Zugang.
Verantwortliche filtern die Gesamtübersicht nach Gruppe. Die Übersicht scrollt
unabhängig vom restlichen Einstieg.

Offene Kommentaransichten und die Übersicht laden alle acht Sekunden neu.
Thread-Anfragen verwenden ETags. Entwürfe für Hauptkommentare, Antworten und
Bearbeitungen bleiben unabhängig vom synchronisierten Snapshot erhalten.
Sitzungswechsel verwerfen private Entwürfe wie bisher. Verliert ein offener
Entwurf seine Gruppe, bleibt der Text erhalten und verlangt eine erneute explizite
Gruppenwahl. Bearbeitungsentwürfe zu nicht mehr zugänglichen Kommentaren bleiben
zum Kopieren erhalten, ohne den alten Kommentar erneut in die Übersicht einzufügen.

- `GET/PUT /view/acp/:acpId/review/config`: Management-Konfiguration.
- `GET /view/acp/:acpId/review/members`: verfügbare ACP-Mitglieder, nur Management.
- `GET /acp/:acpId/review/comments`: sichtbarer Ziel-Snapshot und ETag.
- `GET /acp/:acpId/review/comments/visible`: sichtbare Gesamtübersicht.
- `GET /acp/:acpId/review/comments/export/visible.xlsx`: sichtbare Kommentare,
  einschließlich Autor, Gruppen-ID, Ziel, Zeitstempeln und Thread-Zuordnung.
- Bestehende persönliche CSV-/XLSX-Exporte bleiben persönliche Exporte und
  berücksichtigen zusätzlich Gruppenentzug. Management-Gesamtexporte enthalten
  alle Kommentare einschließlich der Gruppen-ID.
  Erlaubte Thread-Referenzen bleiben auch erhalten, wenn der Ursprungskommentar
  nicht als Exportzeile enthalten ist (fremder Autor im persönlichen Export oder
  gelöschter Ursprungskommentar). Seine Inhalte werden dabei nicht ergänzt;
  die Freigabe neutraler Referenzen entspricht der Kommentaransicht.
- Unsichtbare Kommentar-IDs liefern bei Antworten, Bearbeiten und Löschen dieselbe
  404-Antwort wie nicht vorhandene IDs. Anzahlen und ETags enthalten keine
  Aktivität fremder Gruppen.

## Migration und Prüfung

Migration `1789400000000-ReviewVisibilityGroups` ergänzt Gruppenfelder und Trigger.
Bestehende Kommentartexte, IDs und Zielzuordnungen bleiben erhalten. Der Rollback
wird verweigert, sobald Gruppen oder Gruppenkommentare existieren, weil das Entfernen der
Zuordnung deren Sichtbarkeit verändern würde. Vor einem Release wie üblich eine
Datenbanksicherung und Migrationsprobe durchführen.

`backend/test/review-groups.e2e-spec.ts` prüft die API mit echten Grants,
PostgreSQL, Migration, Konfigurationskonflikten, beiden Identitätsarten, allen vier
Zieltypen, ETags, Exportsichtbarkeit und Gruppenwechseln. Inhaltskataloge werden in
diesem API-Test durch kleine deterministische Fixtures ersetzt. Ausschließlich
gegen eine isolierte Testdatenbank ausführen; die Migrationsprobe verwendet ein
eigenes temporäres Schema und prüft auch das Zurückrollen einer Transaktion. Browserprüfungen ergänzen den tatsächlichen UI- und Pollingpfad.
