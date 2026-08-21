import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminDriverManagementComponent } from './admin-driver-management.component';

describe('AdminDriverManagementComponent', () => {
  let component: AdminDriverManagementComponent;
  let fixture: ComponentFixture<AdminDriverManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminDriverManagementComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AdminDriverManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
