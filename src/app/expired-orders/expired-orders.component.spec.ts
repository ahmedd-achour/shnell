import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpiredOrdersComponent } from './expired-orders.component';

describe('ExpiredOrdersComponent', () => {
  let component: ExpiredOrdersComponent;
  let fixture: ComponentFixture<ExpiredOrdersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ExpiredOrdersComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ExpiredOrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
