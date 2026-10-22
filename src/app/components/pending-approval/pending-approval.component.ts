import { Component, OnInit, inject } from '@angular/core';
import { Auth, signOut } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-pending-approval',
  templateUrl: './pending-approval.component.html',
  styleUrls: ['./pending-approval.component.css']
})
export class PendingApprovalComponent implements OnInit {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  status$!: Observable<'pending' | 'approved' | 'unknown'>;

  ngOnInit(): void {
    const user = this.auth.currentUser;
    if (!user) {
      this.router.navigate(['/sign-in']);
      return;
    }

    this.status$ = docData(doc(this.firestore, 'companies', user.uid)).pipe(
      switchMap((company: any) => {
        if (company?.isAdminApproved === true) {
          // Approved while they were sitting on this page — bounce them in.
          this.router.navigate(['/stops-management']);
          return of('approved' as const);
        }
        return of(company ? ('pending' as const) : ('unknown' as const));
      })
    );
  }

  async logout() {
    await signOut(this.auth).catch(() => {});
    this.router.navigate(['/sign-in']);
  }
}
