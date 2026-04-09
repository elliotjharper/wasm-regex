import { Component } from '@angular/core';
import { RegexTesterComponent } from './components/regex-tester/regex-tester.component';

@Component({
  selector: 'app-root',
  imports: [RegexTesterComponent],
  template: '<app-regex-tester />',
})
export class AppComponent {}
