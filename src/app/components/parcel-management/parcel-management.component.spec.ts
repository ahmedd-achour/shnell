import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParcelManagementComponent } from './parcel-management.component';

describe('ParcelManagementComponent', () => {
  let component: ParcelManagementComponent;
  let fixture: ComponentFixture<ParcelManagementComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ParcelManagementComponent]
    });
    fixture = TestBed.createComponent(ParcelManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
