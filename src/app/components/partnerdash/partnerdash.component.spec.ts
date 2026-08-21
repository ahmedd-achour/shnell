import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PartnerdashComponent } from './partnerdash.component';

describe('PartnerdashComponent', () => {
  let component: PartnerdashComponent;
  let fixture: ComponentFixture<PartnerdashComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PartnerdashComponent]
    });
    fixture = TestBed.createComponent(PartnerdashComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
