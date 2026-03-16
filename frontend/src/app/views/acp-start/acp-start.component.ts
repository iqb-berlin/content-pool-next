import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-acp-start',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (data) {
      <div class="page-header"><h1>{{ data.name }}</h1></div>
      <p class="desc">{{ data.description }}</p>

      <div class="grid">
        @if (data.units?.length) {
          <a [routerLink]="['/view', acpId, 'units']" class="card link-card">
            <h3>📝 Aufgaben</h3>
            <p>{{ data.units.length }} Aufgaben verfügbar</p>
          </a>
        }
        @if (data.sequences?.length) {
          <div class="card">
            <h3>📋 Aufgabenfolgen</h3>
            @for (seq of data.sequences; track seq.id) {
              <a [routerLink]="['/view', acpId, 'sequence', seq.id]" class="seq-link">{{ seq.instrumentName || seq.id }}</a>
            }
          </div>
        }
        <a [routerLink]="['/view', acpId, 'items']" class="card link-card">
          <h3>📊 Item-Liste</h3>
          <p>Alle Items mit Metadaten</p>
        </a>
        <a [routerLink]="['/view', acpId, 'index']" class="card link-card">
          <h3>🗂️ ACP-Index</h3>
          <p>Paketstruktur interaktiv ansehen</p>
        </a>
      </div>
    }
  `,
  styles: [`
    .desc { color: var(--color-text-secondary); margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
    .link-card { text-decoration: none; color: inherit; transition: transform 0.15s; cursor: pointer; }
    .link-card:hover { transform: translateY(-2px); text-decoration: none; }
    .link-card p { color: var(--color-text-secondary); font-size: 0.85rem; margin-top: 4px; }
    .seq-link { display: block; padding: 6px 0; border-bottom: 1px solid var(--color-border); }
  `]
})
export class AcpStartComponent implements OnInit {
  acpId = '';
  data: any = null;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.api.getAcpStartPage(this.acpId).subscribe(d => this.data = d);
  }
}
