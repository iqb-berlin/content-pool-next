export interface UploadedBooklet {
  id: string;
  label: string;
  definitionId: string;
}

/** Register uploaded definitions without replacing manually configured instruments. */
export function registerBooklets(
  parts: any[],
  uploads: UploadedBooklet[],
  warnings: Set<string>,
): void {
  const entries = () =>
    parts.flatMap((part) =>
      (Array.isArray(part.instruments) ? part.instruments : []).flatMap(
        (instrument: any) =>
          Array.isArray(instrument.testcenterBooklet)
            ? instrument.testcenterBooklet
            : [],
      ),
    );
  for (const upload of uploads) {
    if (uploads.filter((entry) => entry.id === upload.id).length > 1) {
      warnings.add(
        `Booklet-ID ${upload.id} ist in mehreren Dateien enthalten; ${upload.definitionId} wurde nicht automatisch verknüpft.`,
      );
      continue;
    }
    const current = entries();
    const byFile = current.filter(
      (entry: any) => entry.definitionId === upload.definitionId,
    );
    const byId = current.filter((entry: any) => entry.id === upload.id);
    const canReconnect =
      byId.length === 1 && !byId[0].definitionId && byFile.length === 0;
    const conflictingId = current.some(
      (entry: any) =>
        entry.id === upload.id &&
        entry.definitionId !== upload.definitionId &&
        !canReconnect,
    );
    if (
      conflictingId ||
      byFile.some((entry: any) => entry.id && entry.id !== upload.id)
    ) {
      warnings.add(
        `Booklet-ID-Konflikt bei ${upload.definitionId} (${upload.id}); bestehende Verknüpfungen bleiben erhalten.`,
      );
      continue;
    }
    if (canReconnect) {
      byId[0].definitionId = upload.definitionId;
      if (!byId[0].name) byId[0].name = upload.label;
      continue;
    }
    if (byFile.length) {
      for (const entry of byFile) {
        entry.id = upload.id;
        if (!entry.name) entry.name = upload.label;
      }
      continue;
    }
    const part = parts[0];
    if (!Array.isArray(part.instruments)) part.instruments = [];
    // A dedicated instrument per new booklet avoids extending an unrelated instrument.
    const ids = new Set(part.instruments.map((entry: any) => entry.id));
    const baseId = `booklet-${upload.id}`;
    let instrumentId = baseId;
    for (let suffix = 2; ids.has(instrumentId); suffix++)
      instrumentId = `${baseId}-${suffix}`;
    part.instruments.push({
      id: instrumentId,
      name: upload.label,
      testcenterBooklet: [
        {
          id: upload.id,
          name: upload.label,
          definitionId: upload.definitionId,
        },
      ],
    });
  }
}
