import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StopsManagementComponent } from './stops-management.component';

describe('StopsManagementComponent', () => {
  let component: StopsManagementComponent;
  let fixture: ComponentFixture<StopsManagementComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [StopsManagementComponent]
    });
    fixture = TestBed.createComponent(StopsManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
