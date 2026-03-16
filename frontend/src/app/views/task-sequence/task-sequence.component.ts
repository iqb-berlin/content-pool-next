import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TaskSequence } from '../../core/models/api.models';

@Component({
  selector: 'app-task-sequence',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (sequence) {
      <div class="page-header">
        <h1>Aufgabenfolge: {{ sequence.name || sequence.id }}</h1>
        <a [routerLink]="['/view', acpId]" class="btn btn-outline">← Zurück</a>
      </div>

      <div class="card">
        <table class="table">
          <thead><tr><th>#</th><th>Aufgabe</th><th></th></tr></thead>
          <tbody>
            @for (unit of sequence.units; track unit.id; let i = $index) {
              <tr [class.active]="unit.id === currentUnitId">
                <td>{{ i + 1 }}</td>
                <td>{{ unit.name || unit.id }}</td>
                <td><a [routerLink]="['/view', acpId, 'unit', unit.id]" class="btn btn-sm btn-primary">Ansehen</a></td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (sequence.units.length > 1) {
        <div class="nav-bar">
          <button class="btn btn-outline" [disabled]="currentIndex <= 0" (click)="prev()">← Vorherige</button>
          <span>{{ currentIndex + 1 }} / {{ sequence.units.length }}</span>
          <button class="btn btn-outline" [disabled]="currentIndex >= sequence.units.length - 1" (click)="next()">Nächste →</button>
        </div>
      }
    }
  `,
  styles: [`
    .active td { background: rgba(41,128,185,0.08); }
    .nav-bar { display: flex; justify-content: center; align-items: center; gap: 24px; margin-top: 16px; }
  `]
})
export class TaskSequenceComponent implements OnInit {
  acpId = '';
  sequenceId = '';
  sequence: TaskSequence | null = null;
  currentIndex = 0;
  currentUnitId = '';

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.sequenceId = this.route.snapshot.paramMap.get('sequenceId') || '';
    this.api.getViewSequence(this.acpId, this.sequenceId).subscribe(s => {
      this.sequence = s;
      if (s.units.length) this.currentUnitId = s.units[0].id;
    });
  }

  prev() {
    if (this.currentIndex > 0 && this.sequence) {
      this.currentIndex--;
      this.currentUnitId = this.sequence.units[this.currentIndex].id;
    }
  }

  next() {
    if (this.sequence && this.currentIndex < this.sequence.units.length - 1) {
      this.currentIndex++;
      this.currentUnitId = this.sequence.units[this.currentIndex].id;
    }
  }
}
