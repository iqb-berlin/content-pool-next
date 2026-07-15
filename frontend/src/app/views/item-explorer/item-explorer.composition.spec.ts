/// <reference types="vite/client" />

import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, provideZonelessChangeDetection } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PendingPersonalSessionStorageService } from '../../core/services/pending-personal-session-storage.service';
import { BreadcrumbComponent } from '../../shared/components/breadcrumb.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { SplitPaneComponent } from '../../shared/components/split-pane.component';
import codingDialogTemplate from './components/coding-dialog/item-explorer-coding-dialog.component.html?raw';
import collectionsTemplate from './components/collections/item-explorer-collections.component.html?raw';
import columnManagerTemplate from './components/column-manager-dialog/item-explorer-column-manager-dialog.component.html?raw';
import draftDialogsTemplate from './components/draft-dialogs/item-explorer-draft-dialogs.component.html?raw';
import headerTemplate from './components/header/item-explorer-header.component.html?raw';
import historyDialogTemplate from './components/history-dialog/item-explorer-history-dialog.component.html?raw';
import metadataDrawerTemplate from './components/metadata-drawer/item-explorer-metadata-drawer.component.html?raw';
import previewTemplate from './components/preview/item-explorer-preview.component.html?raw';
import responseStateDialogsTemplate from './components/response-state-dialogs/item-explorer-response-state-dialogs.component.html?raw';
import tableTemplate from './components/table/item-explorer-table.component.html?raw';
import uploadDialogsTemplate from './components/upload-dialogs/item-explorer-upload-dialogs.component.html?raw';
import shellTemplate from './item-explorer.component.html?raw';
import { ItemExplorerFacade } from './item-explorer.facade';

@Component({
  selector: 'app-item-explorer-header',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  template: headerTemplate,
})
class ItemExplorerHeaderTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).headerViewModel;
}

@Component({
  selector: 'app-item-explorer-collections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: collectionsTemplate,
})
class ItemExplorerCollectionsTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).collectionsViewModel;
}

@Component({
  selector: 'app-item-explorer-table',
  standalone: true,
  imports: [CommonModule, FormsModule, ItemExplorerCollectionsTemplateHarness],
  template: tableTemplate,
})
class ItemExplorerTableTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).tableViewModel;

  onTableKeydown(event: KeyboardEvent): void {
    this.vm.onTableKeydown(event);
  }
}

@Component({
  selector: 'app-item-explorer-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: previewTemplate,
})
class ItemExplorerPreviewTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).previewViewModel;
}

@Component({
  selector: 'app-item-explorer-coding-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: codingDialogTemplate,
})
class ItemExplorerCodingDialogTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).codingDialogViewModel;
}

@Component({
  selector: 'app-item-explorer-metadata-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: metadataDrawerTemplate,
})
class ItemExplorerMetadataDrawerTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).metadataDrawerViewModel;
}

@Component({
  selector: 'app-item-explorer-upload-dialogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: uploadDialogsTemplate,
})
class ItemExplorerUploadDialogsTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).uploadDialogsViewModel;
}

@Component({
  selector: 'app-item-explorer-column-manager-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: columnManagerTemplate,
})
class ItemExplorerColumnManagerDialogTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).columnManagerDialogViewModel;
}

@Component({
  selector: 'app-item-explorer-response-state-dialogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: responseStateDialogsTemplate,
})
class ItemExplorerResponseStateDialogsTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).responseStateDialogsViewModel;
}

@Component({
  selector: 'app-item-explorer-history-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: historyDialogTemplate,
})
class ItemExplorerHistoryDialogTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).historyDialogViewModel;
}

@Component({
  selector: 'app-item-explorer-draft-dialogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: draftDialogsTemplate,
})
class ItemExplorerDraftDialogsTemplateHarness {
  readonly vm = inject(ItemExplorerFacade).draftDialogsViewModel;
}

@Component({
  selector: 'app-item-explorer-template-harness',
  standalone: true,
  imports: [
    BreadcrumbComponent,
    SplitPaneComponent,
    ItemExplorerHeaderTemplateHarness,
    ItemExplorerTableTemplateHarness,
    ItemExplorerPreviewTemplateHarness,
    ItemExplorerCodingDialogTemplateHarness,
    ItemExplorerMetadataDrawerTemplateHarness,
    ItemExplorerUploadDialogsTemplateHarness,
    ItemExplorerColumnManagerDialogTemplateHarness,
    ItemExplorerResponseStateDialogsTemplateHarness,
    ItemExplorerHistoryDialogTemplateHarness,
    ItemExplorerDraftDialogsTemplateHarness,
  ],
  template: shellTemplate,
})
class ItemExplorerShellTemplateHarness implements OnInit {
  private readonly facade = inject(ItemExplorerFacade);
  private readonly route = inject(ActivatedRoute);

  get isFullscreenActive(): boolean {
    return this.facade.isFullscreen;
  }

  get breadcrumbs() {
    return this.facade.breadcrumbs;
  }

  ngOnInit(): void {
    this.facade.init(this.route.snapshot.paramMap.get('acpId') || '');
  }
}

function createFacade(): ItemExplorerFacade {
  return new ItemExplorerFacade(
    {} as any,
    { bypassSecurityTrustHtml: (html: string) => html } as any,
    {} as any,
    {
      hasAcpRole: () => false,
      isAdmin: false,
      isLoggedIn: false,
      currentUser$: { subscribe: () => ({ unsubscribe: vi.fn() }) },
      getToken: () => null,
    } as any,
    new PendingPersonalSessionStorageService(),
  );
}

describe('ItemExplorer production template composition', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders every production feature template against the same route-local facade', async () => {
    const facade = createFacade();
    const init = vi.spyOn(facade, 'init').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      imports: [ItemExplorerShellTemplateHarness],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ItemExplorerFacade, useValue: facade },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'acp-42' } } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ItemExplorerShellTemplateHarness);
    fixture.detectChanges();

    for (const selector of [
      'app-item-explorer-header',
      'app-item-explorer-table',
      'app-item-explorer-preview',
      'app-item-explorer-coding-dialog',
      'app-item-explorer-metadata-drawer',
      'app-item-explorer-upload-dialogs',
      'app-item-explorer-column-manager-dialog',
      'app-item-explorer-response-state-dialogs',
      'app-item-explorer-history-dialog',
      'app-item-explorer-draft-dialogs',
    ]) {
      expect(fixture.nativeElement.querySelector(selector), selector).not.toBeNull();
    }
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Item-Explorer');
    expect(fixture.nativeElement.querySelector('.table-toolbar .filter-input')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Item auswählen');

    const table = fixture.debugElement.query(
      (node) => node.componentInstance instanceof ItemExplorerTableTemplateHarness,
    ).componentInstance as ItemExplorerTableTemplateHarness;
    const preview = fixture.debugElement.query(
      (node) => node.componentInstance instanceof ItemExplorerPreviewTemplateHarness,
    ).componentInstance as ItemExplorerPreviewTemplateHarness;
    expect(table.vm).toBe(facade.tableViewModel);
    expect(preview.vm).toBe(facade.previewViewModel);
    expect(init).toHaveBeenCalledWith('acp-42');
  }, 15_000);
});
