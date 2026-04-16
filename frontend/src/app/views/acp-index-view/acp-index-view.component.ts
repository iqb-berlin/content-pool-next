import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-acp-index-view',
  standalone: true,
  imports: [RouterLink, CommonModule],
  template: `
    <div class="page-header">
      <h1>ACP-Index</h1>
      <a [routerLink]="['/view', acpId]" class="btn btn-outline">← Zurück</a>
    </div>

    @if (index) {
      <div class="card">
        <div class="toolbar">
          @for (section of sections; track section) {
            <button class="btn btn-sm" [class.btn-primary]="activeSection === section" [class.btn-outline]="activeSection !== section" (click)="activeSection = section">
              {{ section }}
            </button>
          }
        </div>

        @if (activeSection === 'Übersicht') {
          <dl class="meta-grid">
            <dt>Package-ID</dt><dd>{{ index.packageId }}</dd>
            <dt>Version</dt><dd>{{ index.version }}</dd>
            <dt>Status</dt><dd>{{ index.status }}</dd>
            @if (index.name?.length) { <dt>Name</dt><dd>{{ index.name[0]?.value }}</dd> }
            @if (index.description?.length) { <dt>Beschreibung</dt><dd>{{ index.description[0]?.value }}</dd> }
          </dl>
        }

        @if (activeSection === 'Aufgaben') {
          <table class="table">
            <thead><tr><th>ID</th><th>Name</th><th>Items</th></tr></thead>
            <tbody>
              @for (unit of index.units || []; track unit.id) {
                <tr>
                  <td><code>{{ unit.id }}</code></td>
                  <td>{{ unit.name }}</td>
                  <td>{{ unit.items?.length || 0 }}</td>
                </tr>
              }
            </tbody>
          </table>
        }

    @if (activeSection === 'Assessment-Teile') {
          <div class="assessment-parts">
            @for (part of index.assessmentParts || []; track part.id) {
              <div class="part-item card">
                <h4>{{ part.name[0]?.value || part.id }}</h4>
                <div class="instruments">
                  @for (inst of part.instruments || []; track inst.id) {
                    <div class="instrument-box">
                      <h5>{{ inst.name }}</h5>
                      <div class="booklets">
                        @for (book of inst.testcenterBooklet || []; track book.definitionId) {
                          <div class="booklet-link">
                            📖 <strong>Booklet:</strong> {{ book.definitionId }}
                            <div class="modules-list">
                              @for (moduleRef of book.modules || []; track moduleRefTrack(moduleRef, $index)) {
                                @if (moduleRefId(moduleRef); as moduleId) {
                                  <a [routerLink]="['/view', acpId, 'sequence', moduleId]" class="module-tag">
                                    {{ moduleId }}
                                  </a>
                                }
                              }
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }

        @if (activeSection === 'Skalen') {
          <pre class="json-view">{{ index.scales | json }}</pre>
        }

        @if (activeSection === 'Roh-JSON') {
          <pre class="json-view">{{ index | json }}</pre>
        }
      </div>
    }
  `,
  styles: [`
    .meta-grid { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; }
    dt { font-weight: 600; color: var(--color-text-secondary); }
    .assessment-parts { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 12px; }
    .part-item h4 { margin: 0 0 12px; color: var(--color-primary); }
    .instrument-box { margin-bottom: 12px; padding: 12px; background: var(--color-bg); border-radius: var(--radius); }
    .instrument-box h5 { margin: 0 0 8px; font-size: 0.95rem; }
    .booklet-link { font-size: 0.85rem; margin-bottom: 8px; }
    .modules-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .module-tag { display: inline-block; padding: 2px 8px; background: white; border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.8rem; text-decoration: none; color: var(--color-primary-light); }
    .module-tag:hover { background: var(--color-primary-light); color: white; border-color: var(--color-primary-light); text-decoration: none; }
    .json-view { background: var(--color-bg); padding: 16px; border-radius: var(--radius); overflow-x: auto; font-size: 0.8rem; max-height: 500px; }
  `]
})
export class AcpIndexViewComponent implements OnInit {
  acpId = '';
  index: any = null;
  sections = ['Übersicht', 'Aufgaben', 'Assessment-Teile', 'Skalen', 'Roh-JSON'];
  activeSection = 'Übersicht';

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.api.getViewIndex(this.acpId).subscribe(idx => this.index = idx);
  }

  moduleRefTrack(moduleRef: any, index: number): string {
    return this.moduleRefId(moduleRef) || `module-${index}`;
  }

  moduleRefId(moduleRef: any): string | null {
    if (typeof moduleRef === 'string' && moduleRef.trim().length > 0) {
      return moduleRef.trim();
    }
    if (moduleRef && typeof moduleRef === 'object') {
      if (typeof moduleRef.moduleId === 'string' && moduleRef.moduleId.trim().length > 0) {
        return moduleRef.moduleId.trim();
      }
      if (typeof moduleRef.id === 'string' && moduleRef.id.trim().length > 0) {
        return moduleRef.id.trim();
      }
    }
    return null;
  }
}
