import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetourspaymentsComponent } from './retourspayments.component';

describe('RetourspaymentsComponent', () => {
  let component: RetourspaymentsComponent;
  let fixture: ComponentFixture<RetourspaymentsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RetourspaymentsComponent]
    });
    fixture = TestBed.createComponent(RetourspaymentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
