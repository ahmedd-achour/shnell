import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateStopLocationComponent } from './update-stop-location.component';

describe('UpdateStopLocationComponent', () => {
  let component: UpdateStopLocationComponent;
  let fixture: ComponentFixture<UpdateStopLocationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UpdateStopLocationComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(UpdateStopLocationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
