import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { JsonPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-acp-index-view',
  standalone: true,
  imports: [RouterLink, JsonPipe],
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
          <pre class="json-view">{{ index.assessmentParts | json }}</pre>
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
    this.api.getAcpIndex(this.acpId).subscribe(idx => this.index = idx);
  }
}
