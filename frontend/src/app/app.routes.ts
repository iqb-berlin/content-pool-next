import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./views/landing/landing.component').then(m => m.LandingComponent) },
  { path: 'login', loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent) },
  { path: 'credential-login/:acpId', loadComponent: () => import('./auth/credential-login.component').then(m => m.CredentialLoginComponent) },

  // Admin routes
  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      { path: '', redirectTo: 'users', pathMatch: 'full' },
      { path: 'users', loadComponent: () => import('./admin/users/users.component').then(m => m.UsersComponent) },
      { path: 'settings', loadComponent: () => import('./admin/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'acp', loadComponent: () => import('./admin/acp-list/acp-list.component').then(m => m.AcpListComponent) },
    ]
  },

  // ACP Manager routes
  {
    path: 'manage/:acpId',
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./acp-manager/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'files', loadComponent: () => import('./acp-manager/files/files.component').then(m => m.FilesComponent) },
      { path: 'snapshots', loadComponent: () => import('./acp-manager/snapshots/snapshots.component').then(m => m.SnapshotsComponent) },
      { path: 'access', loadComponent: () => import('./acp-manager/access-config/access-config.component').then(m => m.AccessConfigComponent) },
    ]
  },

  // Public view routes
  { path: 'view/:acpId', loadComponent: () => import('./views/acp-start/acp-start.component').then(m => m.AcpStartComponent) },
  { path: 'view/:acpId/units', loadComponent: () => import('./views/unit-view/unit-list.component').then(m => m.UnitListComponent) },
  { path: 'view/:acpId/unit/:unitId', loadComponent: () => import('./views/unit-view/unit-view.component').then(m => m.UnitViewComponent) },
  { path: 'view/:acpId/sequence/:sequenceId', loadComponent: () => import('./views/task-sequence/task-sequence.component').then(m => m.TaskSequenceComponent) },
  { path: 'view/:acpId/items', loadComponent: () => import('./views/item-list/item-list.component').then(m => m.ItemListComponent) },
  { path: 'view/:acpId/index', loadComponent: () => import('./views/acp-index-view/acp-index-view.component').then(m => m.AcpIndexViewComponent) },

  { path: '**', redirectTo: '' }
];
