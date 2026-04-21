import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { FilesComponent } from './files.component';
import { AcpFile, FilePreviewResponse } from '../../core/models/api.models';

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
    getFilePreview: ReturnType<typeof vi.fn>;
    getFileContentUrl: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
    deleteAllFiles: ReturnType<typeof vi.fn>;
    bulkDeleteFiles: ReturnType<typeof vi.fn>;
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
      getFilePreview: vi.fn().mockReturnValue(
        of({
          fileId: 'f-json-error',
          originalName: 'metadata.json',
          extension: 'json',
          mode: 'text',
          textFormat: 'json',
          textContent: '{"hello":true}',
          truncated: false,
        } satisfies FilePreviewResponse),
      ),
      getFileContentUrl: vi.fn().mockReturnValue('/api/acp/acp-1/files/f-json-error/download'),
      deleteFile: vi.fn().mockReturnValue(of({ message: 'File deleted successfully' })),
      deleteAllFiles: vi.fn().mockReturnValue(of({ message: 'All files deleted successfully' })),
      bulkDeleteFiles: vi.fn().mockReturnValue(of({ message: 'Files deleted successfully' })),
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

  it('selects visible filtered files without dropping existing hidden selection', () => {
    component.toggleFileSelection('f-xml-ok', true);
    component.searchQuery = 'meta';
    component.applyFilters();

    component.selectVisibleFiles();

    expect(Array.from(component.selectedFileIds)).toEqual(['f-xml-ok', 'f-json-error']);
    expect(component.selectedFilesCount).toBe(2);
    expect(component.allVisibleFilesSelected).toBe(true);
  });

  it('opens a dedicated delete dialog for the current selection', () => {
    component.toggleFileSelection('f-json-error', true);
    component.toggleFileSelection('f-no-type-unchecked', true);

    component.openDeleteSelectedFilesDialog();

    expect(component.deleteDialogMode).toBe('selected');
    expect(component.deleteDialogMessage).toContain('2 ausgewählte Datei(en)');
    expect(component.deleteDialogDetails[0]).toContain('2 Datei(en)');
    expect(component.deleteDialogDetails).toContain('metadata.json');
  });

  it('bulk deletes the current selection and clears preview + selection state', () => {
    component.acpId = 'acp-1';
    component.toggleFileSelection('f-json-error', true);
    component.toggleFileSelection('f-no-type-unchecked', true);
    component.openPreview(seedFiles[1]);
    expect(component.selectedPreviewFile?.id).toBe('f-json-error');

    api.getFiles.mockReturnValue(of([seedFiles[0]]));
    component.openDeleteSelectedFilesDialog();
    component.confirmDeleteDialog();

    expect(api.bulkDeleteFiles).toHaveBeenCalledWith('acp-1', [
      'f-json-error',
      'f-no-type-unchecked',
    ]);
    expect(component.selectedPreviewFile).toBeNull();
    expect(component.selectedFilesCount).toBe(0);
    expect(component.files).toEqual([seedFiles[0]]);
  });

  it('loads a preview for the selected file', () => {
    component.acpId = 'acp-1';
    component.openPreview(seedFiles[1]);

    expect(api.getFilePreview).toHaveBeenCalledWith('acp-1', 'f-json-error');
    expect(component.selectedPreviewFile?.id).toBe('f-json-error');
    expect(component.selectedPreview?.textFormat).toBe('json');
    expect(component.previewLoading).toBe(false);
    expect(component.selectedPreviewInlineUrl).toContain('download');
  });

  it('toggles the active preview off when selecting the same file again', () => {
    component.acpId = 'acp-1';
    component.openPreview(seedFiles[1]);
    expect(component.selectedPreviewFile?.id).toBe('f-json-error');

    component.openPreview(seedFiles[1]);

    expect(component.selectedPreviewFile).toBeNull();
    expect(component.selectedPreview).toBeNull();
  });

  it('clears the preview when the selected file disappears on reload', () => {
    component.acpId = 'acp-1';
    component.openPreview(seedFiles[1]);
    expect(component.selectedPreviewFile?.id).toBe('f-json-error');

    api.getFiles.mockReturnValue(of([seedFiles[0]]));
    component.load();

    expect(component.selectedPreviewFile).toBeNull();
    expect(component.selectedPreview).toBeNull();
  });

  it('drops stale file selections when the list is reloaded', () => {
    component.toggleFileSelection('f-json-error', true);
    expect(component.selectedFilesCount).toBe(1);

    api.getFiles.mockReturnValue(of([seedFiles[0]]));
    component.load();

    expect(component.selectedFilesCount).toBe(0);
  });

  it('maps payload-too-large upload errors to a helpful message', () => {
    const message = (component as any).getUploadErrorMessage(
      new HttpErrorResponse({
        status: 413,
        error: 'File too large',
      }),
    );

    expect(message).toBe(
      'Die ausgewählte Datei ist größer als das aktuell erlaubte Upload-Limit des Servers.',
    );
  });
});
