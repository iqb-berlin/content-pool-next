import { Component, Inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  standalone: true,
  selector: 'app-review-redirect',
  template: `<div class="empty-state"><h3>Review wird geöffnet …</h3></div>`,
})
export class ReviewRedirectComponent implements OnInit {
  constructor(
    @Inject(ActivatedRoute) private readonly route: ActivatedRoute,
    @Inject(Router) private readonly router: Router,
    @Inject(ApiService) private readonly api: ApiService,
  ) {}

  ngOnInit(): void {
    const acpId =
      this.route.snapshot.paramMap.get('acpId') ||
      this.route.parent?.snapshot.paramMap.get('acpId') ||
      '';
    this.api.getCapabilities(acpId).subscribe({
      next: (access) => {
        const target = access?.canManageReview
          ? ['/view', acpId, 'review', 'manage']
          : ['/view', acpId];
        void this.router.navigate(target, { replaceUrl: true });
      },
      error: () => void this.router.navigate(['/view', acpId], { replaceUrl: true }),
    });
  }
}
