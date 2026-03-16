import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-unit-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <h1>Aufgaben</h1>
      <a [routerLink]="['/view', acpId]" class="btn btn-outline">← Zurück</a>
    </div>
    <div class="card">
      <table class="table">
        <thead><tr><th>ID</th><th>Name</th><th></th></tr></thead>
        <tbody>
          @for (unit of units; track unit.id) {
            <tr>
              <td><code>{{ unit.id }}</code></td>
              <td>{{ unit.name }}</td>
              <td><a [routerLink]="['/view', acpId, 'unit', unit.id]" class="btn btn-sm btn-primary">Ansehen</a></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class UnitListComponent implements OnInit {
  acpId = '';
  units: any[] = [];

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.api.getViewUnits(this.acpId).subscribe(u => this.units = u);
  }
}
