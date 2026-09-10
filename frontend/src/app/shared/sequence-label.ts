export function sequenceLabel(sequence: any): string {
  const name = textValue(sequence?.name);
  if (name) return name;

  const instrumentName = textValue(sequence?.instrumentName);
  if (instrumentName) return instrumentName;

  return sequence?.id || '';
}

function textValue(value: any): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const de = value.find((entry: any) => entry && entry.lang === 'de');
    if (de?.value) return String(de.value);
    const first = value.find((entry: any) => entry && entry.value);
    if (first?.value) return String(first.value);
    return '';
  }
  if (value && typeof value === 'object') {
    if (typeof value.de === 'string') return value.de;
    if (typeof value.value === 'string') return value.value;
  }
  return '';
}
