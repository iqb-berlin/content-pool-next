import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { FilesComponent } from './files.component';
import { AcpFile } from '../../core/models/api.models';

function createFile(overrides: Partial<AcpFile>): AcpFile {
  return {
    id: 'file-1',
    acpId: 'acp-1',
    filePath: '/tmp/file-1',
    originalName: 'default.txt',
    fileSize: 123,
    uploadedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('FilesComponent filtering', () => {
  const seedFiles: AcpFile[] = [
    createFile({
      id: 'f-xml-ok',
      originalName: 'Unit_A.XML',
      fileType: 'application/xml',
      validationResult: {
        valid: true,
        issues: [],
        timestamp: '2026-04-01T00:00:00.000Z',
      },
    }),
    createFile({
      id: 'f-json-error',
      originalName: 'metadata.json',
      fileType: 'application/json',
      validationResult: {
        valid: false,
        issues: [
          {
            severity: 'error',
            message: 'schema mismatch',
          },
        ],
        timestamp: '2026-04-01T00:00:00.000Z',
      },
    }),
    createFile({
      id: 'f-no-type-unchecked',
      originalName: 'readme.txt',
      fileType: '',
    }),
  ];

  let api: {
    getFiles: ReturnType<typeof vi.fn>;
  };

  let route: {
    parent: {
      snapshot: {
        paramMap: {
          get: ReturnType<typeof vi.fn>;
        };
      };
    };
  };

  let component: FilesComponent;

  beforeEach(() => {
    api = {
      getFiles: vi.fn().mockReturnValue(of(seedFiles)),
    };

    route = {
      parent: {
        snapshot: {
          paramMap: {
            get: vi.fn().mockReturnValue('acp-1'),
          },
        },
      },
    };

    component = new FilesComponent(route as any, api as any);
    component.files = [...seedFiles];
    component.applyFilters();
  });

  it('loads files on init and applies default filters', () => {
    component.ngOnInit();

    expect(api.getFiles).toHaveBeenCalledWith('acp-1');
    expect(component.filteredFiles).toHaveLength(3);
  });

  it('filters by filename search case-insensitively', () => {
    component.searchQuery = 'unit_a';
    component.applyFilters();

    expect(component.filteredFiles.map((file) => file.id)).toEqual(['f-xml-ok']);
  });

  it('filters by file type', () => {
    component.selectedFileType = 'application/json';
    component.applyFilters();

    expect(component.filteredFiles.map((file) => file.id)).toEqual(['f-json-error']);
  });

  it('filters by files without type', () => {
    expect(component.hasFilesWithoutType).toBe(true);

    component.selectedFileType = component.FILE_TYPE_FILTER_NONE;
    component.applyFilters();

    expect(component.filteredFiles.map((file) => file.id)).toEqual(['f-no-type-unchecked']);
  });

  it('filters by validation state', () => {
    component.selectedValidationFilter = 'unchecked';
    component.applyFilters();

    expect(component.filteredFiles.map((file) => file.id)).toEqual(['f-no-type-unchecked']);
  });

  it('combines search and validation filter', () => {
    component.searchQuery = 'meta';
    component.selectedValidationFilter = 'error';
    component.applyFilters();

    expect(component.filteredFiles.map((file) => file.id)).toEqual(['f-json-error']);
  });

  it('resets active filters', () => {
    component.searchQuery = 'meta';
    component.selectedFileType = 'application/json';
    component.selectedValidationFilter = 'error';
    component.applyFilters();

    expect(component.hasActiveFilters()).toBe(true);
    expect(component.filteredFiles).toHaveLength(1);

    component.resetFilters();

    expect(component.searchQuery).toBe('');
    expect(component.selectedFileType).toBe(component.FILE_TYPE_FILTER_ALL);
    expect(component.selectedValidationFilter).toBe('all');
    expect(component.filteredFiles).toHaveLength(3);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('keeps active filters when the file list is reloaded', () => {
    component.searchQuery = 'meta';
    component.applyFilters();
    expect(component.filteredFiles.map((file) => file.id)).toEqual(['f-json-error']);

    api.getFiles.mockReturnValue(
      of([
        ...seedFiles,
        createFile({
          id: 'f-json-meta-2',
          originalName: 'meta-report.json',
          fileType: 'application/json',
        }),
      ]),
    );

    component.load();

    expect(component.filteredFiles.map((file) => file.id)).toEqual([
      'f-json-error',
      'f-json-meta-2',
    ]);
  });

  it('keeps delete-all scope on full dataset even with active filters', () => {
    component.searchQuery = 'meta';
    component.applyFilters();
    expect(component.filteredFiles).toHaveLength(1);
    expect(component.files).toHaveLength(3);

    component.openDeleteAllFilesDialog();

    expect(component.deleteDialogDetails[0]).toContain('3 Datei(en)');
  });
});
