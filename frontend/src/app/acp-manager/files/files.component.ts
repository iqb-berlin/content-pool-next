import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AcpFile } from '../../core/models/api.models';

@Component({
  selector: 'app-files',
  standalone: true,
  template: `
    <div class="page-header">
      <h1>Dateien</h1>
      <label class="btn btn-primary">
        📤 Dateien hochladen
        <input type="file" multiple (change)="upload($event)" hidden>
      </label>
    </div>

    @if (uploading) { <div class="alert alert-success">Dateien werden hochgeladen...</div> }

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Dateiname</th>
            <th>Typ</th>
            <th>Größe</th>
            <th>Validierung</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          @for (file of files; track file.id) {
            <tr>
              <td>{{ file.originalName }}</td>
              <td>{{ file.fileType || '–' }}</td>
              <td>{{ formatSize(file.fileSize) }}</td>
              <td>
                @if (file.validationResult) {
                  <span class="badge" [class.badge-success]="file.validationResult.valid" [class.badge-danger]="!file.validationResult.valid">
                    {{ file.validationResult.valid ? 'OK' : 'Fehler' }}
                  </span>
                } @else {
                  <span class="badge badge-warning">Nicht geprüft</span>
                }
              </td>
              <td>
                <a [href]="getDownloadUrl(file)" class="btn btn-sm btn-outline" target="_blank">⬇ Download</a>
                <button class="btn btn-sm btn-danger" (click)="deleteFile(file)" style="margin-left:8px">Löschen</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!files.length) {
        <div class="empty-state"><h3>Keine Dateien vorhanden</h3></div>
      }
    </div>
  `
})
export class FilesComponent implements OnInit {
  acpId = '';
  files: AcpFile[] = [];
  uploading = false;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.parent?.snapshot.paramMap.get('acpId') || '';
    this.load();
  }

  load() {
    this.api.getFiles(this.acpId).subscribe(f => this.files = f);
  }

  upload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const fd = new FormData();
    for (let i = 0; i < input.files.length; i++) {
      fd.append('files', input.files[i]);
    }
    this.uploading = true;
    this.api.uploadFiles(this.acpId, fd).subscribe({
      next: () => { this.uploading = false; this.load(); },
      error: () => this.uploading = false
    });
  }

  deleteFile(file: AcpFile) {
    if (confirm(`Datei "${file.originalName}" löschen?`)) {
      this.api.deleteFile(this.acpId, file.id).subscribe(() => this.load());
    }
  }

  getDownloadUrl(file: AcpFile): string {
    return this.api.getFileDownloadUrl(this.acpId, file.id);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
