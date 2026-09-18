import { Component } from '@angular/core';
import { ClockComponent } from './clock.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ClockComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'CuteClock';
}
