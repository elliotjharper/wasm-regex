import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegexWasmService, MatchResult, RegexError, isRegexError } from '../../services/regex-wasm.service';

@Component({
  selector: 'app-regex-tester',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './regex-tester.component.html',
  styleUrl: './regex-tester.component.css',
})
export class RegexTesterComponent implements OnInit {
  private readonly wasm = inject(RegexWasmService);

  // ── loading state ─────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  // ── inputs ─────────────────────────────────────────────────────────────────
  readonly pattern = signal('');
  readonly input = signal('');
  readonly replacement = signal('');
  readonly flagI = signal(false);
  readonly flagM = signal(false);
  readonly flagS = signal(false);
  readonly mode = signal<'find' | 'replace'>('find');

  // ── derived ────────────────────────────────────────────────────────────────
  readonly flags = computed(() =>
    (this.flagI() ? 'i' : '') + (this.flagM() ? 'm' : '') + (this.flagS() ? 's' : ''),
  );

  readonly ready = computed(() => !this.loading() && this.loadError() === null);

  readonly validationError = computed((): string => {
    if (!this.ready() || !this.pattern()) return '';
    return this.wasm.validate(this.pattern());
  });

  readonly matches = computed((): MatchResult[] => {
    if (!this.ready() || this.validationError() || !this.pattern()) return [];
    const result = this.wasm.findMatches(this.pattern(), this.input(), this.flags());
    return isRegexError(result) ? [] : result;
  });

  readonly replaceResult = computed((): string | RegexError | null => {
    if (!this.ready() || this.mode() !== 'replace' || !this.pattern() || this.validationError())
      return null;
    return this.wasm.replaceAll(this.pattern(), this.input(), this.replacement(), this.flags());
  });

  // ── lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    try {
      await this.wasm.init();
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }

  // ── helpers exposed to template ────────────────────────────────────────────
  isError(v: string | RegexError | null): v is RegexError {
    return isRegexError(v);
  }

  setMode(m: 'find' | 'replace'): void {
    this.mode.set(m);
  }

  setPattern(v: string): void { this.pattern.set(v); }
  setInput(v: string): void { this.input.set(v); }
  setReplacement(v: string): void { this.replacement.set(v); }
  toggleFlagI(): void { this.flagI.set(!this.flagI()); }
  toggleFlagM(): void { this.flagM.set(!this.flagM()); }
  toggleFlagS(): void { this.flagS.set(!this.flagS()); }
}
