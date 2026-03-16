import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppSettings } from '../../core/models/api.models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-header"><h1>Einstellungen</h1></div>
    @if (saved) { <div class="alert alert-success">Einstellungen gespeichert.</div> }
    @if (settings) {
      <div class="card">
        <h3>Grundeinstellungen</h3>
        <div class="form-group">
          <label>Sprache</label>
          <select [(ngModel)]="settings.language">
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
        <div class="form-group">
          <label>Logo URL</label>
          <input [(ngModel)]="settings.logoUrl">
        </div>
      </div>
      <div class="card">
        <h3>Texte</h3>
        <div class="form-group">
          <label>Startseite (HTML)</label>
          <textarea [(ngModel)]="settings.landingPageHtml" rows="4"></textarea>
        </div>
        <div class="form-group">
          <label>Impressum (HTML)</label>
          <textarea [(ngModel)]="settings.imprintHtml" rows="4"></textarea>
        </div>
        <div class="form-group">
          <label>Datenschutz (HTML)</label>
          <textarea [(ngModel)]="settings.privacyHtml" rows="4"></textarea>
        </div>
        <div class="form-group">
          <label>Barrierefreiheit (HTML)</label>
          <textarea [(ngModel)]="settings.accessibilityHtml" rows="4"></textarea>
        </div>
      </div>
      <button class="btn btn-primary" (click)="save()">Speichern</button>
    }
  `
})
export class SettingsComponent implements OnInit {
  settings: AppSettings | null = null;
  saved = false;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getSettings().subscribe(s => this.settings = s);
  }

  save() {
    if (!this.settings) return;
    this.api.updateSettings(this.settings).subscribe({
      next: s => { this.settings = s; this.saved = true; setTimeout(() => this.saved = false, 3000); }
    });
  }
}
