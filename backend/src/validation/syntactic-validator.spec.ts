import { SyntacticValidator } from './syntactic-validator';

describe('SyntacticValidator', () => {
  let validator: SyntacticValidator;

  beforeEach(() => {
    validator = new SyntacticValidator();
  });

  it('returns warning for empty files', () => {
    const result = validator.validate({ originalName: 'empty.csv' } as any, Buffer.alloc(0));

    expect(result).toEqual({
      valid: true,
      issues: [{ severity: 'warning', message: 'File is empty' }],
    });
  });

  it('validates JSON content', () => {
    expect(validator.validate({ originalName: 'data.json' } as any, Buffer.from('{"a":1}')).valid).toBe(true);

    const invalid = validator.validate({ originalName: 'bad.json' } as any, Buffer.from('{"a":'));
    expect(invalid.valid).toBe(false);
    expect(invalid.issues[0].message).toContain('Invalid JSON');
  });

  it('validates XML heuristics', () => {
    const notXml = validator.validate({ originalName: 'a.xml' } as any, Buffer.from('plain text'));
    expect(notXml.valid).toBe(false);
    expect(notXml.issues).toContainEqual({
      severity: 'error',
      message: 'File does not appear to be valid XML',
    });

    const unbalanced = validator.validate({ originalName: 'b.xml' } as any, Buffer.from('<root><child></root>'));
    expect(unbalanced.valid).toBe(true);
    expect(unbalanced.issues).toContainEqual({
      severity: 'warning',
      message: 'XML tags may not be balanced',
    });
  });

  it('validates CSV column consistency', () => {
    const csv = 'item;est\nA;1\nB;2;extra\n';
    const result = validator.validate({ originalName: 'scores.csv' } as any, Buffer.from(csv));

    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual({
      severity: 'warning',
      message: 'Row 3 has 3 columns, expected 2',
    });
  });

  it('returns info for unknown extensions', () => {
    const result = validator.validate({ originalName: 'notes.txt' } as any, Buffer.from('hello'));

    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual({
      severity: 'info',
      message: 'No specific validator for .txt files',
    });
  });
});
