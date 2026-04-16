import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Acp, AccessConfig, AcpSnapshot, AcpFile, Comment, AppSettings, User, PublicAcp, UnitViewData, TaskSequence, Credential } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly API = '/api';

  constructor(private http: HttpClient) {}

  // Users
  getUsers(): Observable<User[]> { return this.http.get<User[]>(`${this.API}/users`); }
  createUser(data: any): Observable<User> { return this.http.post<User>(`${this.API}/users`, data); }
  updateUser(id: string, data: any): Observable<User> { return this.http.patch<User>(`${this.API}/users/${id}`, data); }
  deleteUser(id: string): Observable<void> { return this.http.delete<void>(`${this.API}/users/${id}`); }
  setAppAdmin(id: string, isAppAdmin: boolean): Observable<User> {
    return this.http.patch<User>(`${this.API}/users/${id}/app-admin`, { isAppAdmin });
  }
  linkOidcAccount(userId: string, oidcSub: string): Observable<any> {
    return this.http.post(`${this.API}/auth/link-oidc`, { userId, oidcSub });
  }

  // Settings
  getSettings(): Observable<AppSettings> { return this.http.get<AppSettings>(`${this.API}/admin/settings`); }
  updateSettings(data: Partial<AppSettings>): Observable<AppSettings> {
    return this.http.put<AppSettings>(`${this.API}/admin/settings`, data);
  }

  // ACP
  getAcps(): Observable<Acp[]> { return this.http.get<Acp[]>(`${this.API}/acp`); }
  getAcp(id: string): Observable<Acp> { return this.http.get<Acp>(`${this.API}/acp/${id}`); }
  createAcp(data: any): Observable<Acp> { return this.http.post<Acp>(`${this.API}/acp`, data); }
  updateAcp(id: string, data: any): Observable<Acp> { return this.http.patch<Acp>(`${this.API}/acp/${id}`, data); }
  deleteAcp(id: string): Observable<void> { return this.http.delete<void>(`${this.API}/acp/${id}`); }

  // ACP Index
  getAcpIndex(id: string): Observable<any> { return this.http.get(`${this.API}/acp/${id}/index`); }
  updateAcpIndex(id: string, data: any): Observable<any> { return this.http.put(`${this.API}/acp/${id}/index`, data); }
  importAcpIndex(id: string, data: any): Observable<any> { return this.http.post(`${this.API}/acp/${id}/index/import`, data); }

  // ACP Roles
  getAcpRoles(id: string): Observable<any[]> { return this.http.get<any[]>(`${this.API}/acp/${id}/roles`); }
  assignAcpRole(id: string, data: any): Observable<any> { return this.http.post(`${this.API}/acp/${id}/roles`, data); }
  removeAcpRole(acpId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/acp/${acpId}/roles/${userId}`);
  }

  // ACP Access
  getAccessConfig(id: string): Observable<AccessConfig> { return this.http.get<AccessConfig>(`${this.API}/acp/${id}/access`); }
  updateAccessConfig(id: string, data: any): Observable<AccessConfig> {
    return this.http.put<AccessConfig>(`${this.API}/acp/${id}/access`, data);
  }
  uploadCredentials(id: string, credentials: any[], mode: 'replace' | 'append' | 'upsert' = 'replace'): Observable<any> {
    return this.http.post(`${this.API}/acp/${id}/access/credentials?mode=${mode}`, { credentials });
  }
  getCredentials(id: string): Observable<Credential[]> {
    return this.http.get<Credential[]>(`${this.API}/acp/${id}/access/credentials`);
  }
  createCredential(acpId: string, username: string, password: string): Observable<Credential> {
    return this.http.post<Credential>(`${this.API}/acp/${acpId}/access/credentials/single`, { username, password });
  }
  updateCredential(acpId: string, credentialId: string, data: { username?: string; password?: string }): Observable<Credential> {
    return this.http.patch<Credential>(`${this.API}/acp/${acpId}/access/credentials/${credentialId}`, data);
  }
  deleteCredential(acpId: string, credentialId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/acp/${acpId}/access/credentials/${credentialId}`);
  }
  updateMetadataColumns(id: string, data: any): Observable<AccessConfig> {
    return this.http.put<AccessConfig>(`${this.API}/acp/${id}/metadata-columns`, data);
  }

  // Files
  getFiles(acpId: string): Observable<AcpFile[]> { return this.http.get<AcpFile[]>(`${this.API}/acp/${acpId}/files`); }
  uploadFiles(acpId: string, formData: FormData): Observable<AcpFile[]> {
    return this.http.post<AcpFile[]>(`${this.API}/acp/${acpId}/files/upload`, formData);
  }
  deleteFile(acpId: string, fileId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/acp/${acpId}/files/${fileId}`);
  }
  deleteAllFiles(acpId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/acp/${acpId}/files/all`);
  }
  getFileValidation(acpId: string, fileId: string): Observable<any> {
    return this.http.get(`${this.API}/acp/${acpId}/files/${fileId}/validation`);
  }
  getFileDownloadUrl(acpId: string, fileId: string): string {
    const token = localStorage.getItem('cp_token');
    return `${this.API}/acp/${acpId}/files/${fileId}/download${token ? '?auth_token=' + encodeURIComponent(token) : ''}`;
  }
  validateUnitFiles(acpId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/acp/${acpId}/files/validate-units`);
  }
  getFileItemList(acpId: string): Observable<any> {
    return this.http.get(`${this.API}/acp/${acpId}/files/item-list`);
  }
  getFileUnitView(acpId: string, unitId: string): Observable<any> {
    return this.http.get(`${this.API}/acp/${acpId}/files/unit-view/${unitId}`);
  }

  getIndexExportUrl(id: string): string {
    const token = localStorage.getItem('cp_token');
    return `${this.API}/acp/${id}/index/export${token ? '?auth_token=' + encodeURIComponent(token) : ''}`;
  }

  appendAuthToken(url: string): string {
    const token = localStorage.getItem('cp_token');
    if (!token) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}auth_token=${encodeURIComponent(token)}`;
  }

  // Snapshots
  getSnapshots(acpId: string): Observable<AcpSnapshot[]> { return this.http.get<AcpSnapshot[]>(`${this.API}/acp/${acpId}/snapshots`); }
  createSnapshot(acpId: string, changelog?: string): Observable<AcpSnapshot> {
    return this.http.post<AcpSnapshot>(`${this.API}/acp/${acpId}/snapshots`, { changelog });
  }
  restoreSnapshot(acpId: string, snapshotId: string): Observable<Acp> {
    return this.http.post<Acp>(`${this.API}/acp/${acpId}/snapshots/${snapshotId}/restore`, {});
  }
  getSnapshotDiff(acpId: string, snapshotId: string): Observable<any> {
    return this.http.get(`${this.API}/acp/${acpId}/snapshots/${snapshotId}/diff`);
  }

  // Comments
  getComments(acpId: string): Observable<Comment[]> { return this.http.get<Comment[]>(`${this.API}/acp/${acpId}/comments`); }
  getMyComments(acpId: string): Observable<Comment[]> { return this.http.get<Comment[]>(`${this.API}/acp/${acpId}/comments/mine`); }
  createComment(acpId: string, data: any): Observable<Comment> {
    return this.http.post<Comment>(`${this.API}/acp/${acpId}/comments`, data);
  }
  exportComments(acpId: string): Observable<any[]> { return this.http.get<any[]>(`${this.API}/acp/${acpId}/comments/export`); }

  // Public Views
  getPublicSettings(): Observable<any> { return this.http.get(`${this.API}/view/settings`); }
  getPublicAcps(): Observable<PublicAcp[]> { return this.http.get<PublicAcp[]>(`${this.API}/view/acp`); }
  getAcpStartPage(acpId: string): Observable<any> { return this.http.get(`${this.API}/view/acp/${acpId}`); }
  getViewUnits(acpId: string): Observable<any[]> { return this.http.get<any[]>(`${this.API}/view/acp/${acpId}/units`); }
  getViewUnit(acpId: string, unitId: string): Observable<UnitViewData> {
    return this.http.get<UnitViewData>(`${this.API}/view/acp/${acpId}/units/${unitId}`);
  }
  getViewItems(acpId: string): Observable<any[]> { return this.http.get<any[]>(`${this.API}/view/acp/${acpId}/items`); }
  getViewSequences(acpId: string): Observable<any[]> { return this.http.get<any[]>(`${this.API}/view/acp/${acpId}/sequences`); }
  getViewSequence(acpId: string, seqId: string): Observable<TaskSequence> {
    return this.http.get<TaskSequence>(`${this.API}/view/acp/${acpId}/sequences/${seqId}`);
  }
  getViewIndex(acpId: string): Observable<any> {
    return this.http.get(`${this.API}/view/acp/${acpId}/index`);
  }
  getViewIndexExportUrl(acpId: string): string {
    const token = localStorage.getItem('cp_token');
    return `${this.API}/view/acp/${acpId}/index/export${token ? '?auth_token=' + encodeURIComponent(token) : ''}`;
  }

  // Items
  uploadEmpiricalDifficulties(acpId: string, file: File): Observable<{ updated: number, failed: any[], successes: any[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ updated: number, failed: any[], successes: any[] }>(`${this.API}/acp/${acpId}/items/upload-empirical-difficulty`, formData);
  }

  clearEmpiricalDifficulties(acpId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/acp/${acpId}/items/empirical-difficulty`);
  }

  // Response State
  saveResponseState(acpId: string, itemId: string, unitId: string, responseData: Record<string, any>): Observable<any> {
    return this.http.post(`${this.API}/acp/${acpId}/items/${itemId}/response-state`, { unitId, responseData });
  }

  getResponseState(acpId: string, itemId: string): Observable<any> {
    return this.http.get(`${this.API}/acp/${acpId}/items/${itemId}/response-state`);
  }

  deleteResponseState(acpId: string, itemId: string): Observable<any> {
    return this.http.delete(`${this.API}/acp/${acpId}/items/${itemId}/response-state`);
  }

  getResponseStateWithFallback(
    acpId: string,
    itemId: string,
    unitId: string,
    itemList: { itemId: string; unitId: string }[]
  ): Observable<{ state: any; isFallback: boolean; fallbackItemId?: string }> {
    return this.http.post<{ state: any; isFallback: boolean; fallbackItemId?: string }>(
      `${this.API}/acp/${acpId}/items/${itemId}/response-state/with-fallback`,
      { unitId, itemList }
    );
  }

  getAllResponseStates(acpId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/acp/${acpId}/items/response-state/all`);
  }
}
