import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  isRegexError,
  MatchResult,
  RegexError,
  RegexWasmService,
} from '../../services/regex-wasm.service';

@Component({
  selector: 'app-regex-tester',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './regex-tester.component.html',
  styleUrl: './regex-tester.component.css',
})
export class RegexTesterComponent implements OnInit, OnDestroy {
  private readonly wasm = inject(RegexWasmService);
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  readonly ball = viewChild<ElementRef<HTMLDivElement>>('ball');

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
  readonly flagR = signal(false);
  readonly engine = signal<'dotnet' | 'js'>('dotnet');
  readonly mode = signal<'find' | 'replace'>('find');

  // ── derived ────────────────────────────────────────────────────────────────
  readonly flags = computed(
    () =>
      (this.flagI() ? 'i' : '') +
      (this.flagM() ? 'm' : '') +
      (this.flagS() ? 's' : '') +
      (this.flagR() ? 'r' : ''),
  );

  readonly ready = computed(() => !this.loading() && this.loadError() === null);

  readonly validationError = computed((): string => {
    if (!this.ready() || !this.pattern()) return '';
    if (this.engine() === 'js')
      return this.wasm.validateJs(this.pattern(), this.jsFlags());
    return this.wasm.validate(this.pattern());
  });

  readonly jsFlags = computed(
    () =>
      (this.flagI() ? 'i' : '') +
      (this.flagM() ? 'm' : '') +
      (this.flagS() ? 's' : ''),
  );

  readonly matches = computed((): MatchResult[] => {
    if (!this.ready() || this.validationError() || !this.pattern()) return [];
    const result =
      this.engine() === 'js'
        ? this.wasm.findMatchesJs(this.pattern(), this.input(), this.jsFlags())
        : this.wasm.findMatches(this.pattern(), this.input(), this.flags());
    return isRegexError(result) ? [] : result;
  });

  readonly replaceResult = computed((): string | RegexError | null => {
    if (
      !this.ready() ||
      this.mode() !== 'replace' ||
      !this.pattern() ||
      this.validationError()
    )
      return null;
    return this.engine() === 'js'
      ? this.wasm.replaceAllJs(
          this.pattern(),
          this.input(),
          this.replacement(),
          this.jsFlags(),
        )
      : this.wasm.replaceAll(
          this.pattern(),
          this.input(),
          this.replacement(),
          this.flags(),
        );
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
    this.startTick();
  }

  ngOnDestroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  private startTick(): void {
    let pos = 0;
    let dir = 1;
    this.tickInterval = setInterval(() => {
      const el = this.ball()?.nativeElement;
      if (!el) return;
      pos += dir * 3;
      if (pos >= 100) {
        pos = 100;
        dir = -1;
      }
      if (pos <= 0) {
        pos = 0;
        dir = 1;
      }
      el.style.left = pos + '%';
    }, 50);
  }

  // ── helpers exposed to template ────────────────────────────────────────────
  isError(v: string | RegexError | null): v is RegexError {
    return isRegexError(v);
  }

  setMode(m: 'find' | 'replace'): void {
    this.mode.set(m);
  }

  setPattern(v: string): void {
    this.pattern.set(v);
  }
  setInput(v: string): void {
    this.input.set(v);
  }
  setReplacement(v: string): void {
    this.replacement.set(v);
  }
  toggleFlagI(): void {
    this.flagI.set(!this.flagI());
  }
  toggleFlagM(): void {
    this.flagM.set(!this.flagM());
  }
  toggleFlagS(): void {
    this.flagS.set(!this.flagS());
  }
  toggleFlagR(): void {
    this.flagR.set(!this.flagR());
  }
  setEngine(e: 'dotnet' | 'js'): void {
    this.engine.set(e);
  }

  loadPresetRtl(): void {
    this.pattern.set('\\d+');
    this.input.set('Order 100 shipped 200 items worth 300 dollars');
    this.flagI.set(false);
    this.flagM.set(false);
    this.flagS.set(false);
    this.flagR.set(true);
    this.engine.set('dotnet');
    this.mode.set('find');
    this.replacement.set('');
  }

  loadPresetAnchor(): void {
    this.pattern.set('\\A\\w+');
    this.input.set('Hello\nAlice\nBob');
    this.flagI.set(false);
    this.flagM.set(true);
    this.flagS.set(false);
    this.flagR.set(false);
    this.engine.set('dotnet');
    this.mode.set('find');
    this.replacement.set('');
  }

  loadPresetBacktrack(): void {
    this.pattern.set('(a+)+$');
    this.input.set('aaaaaaaaaaaaaaaaaaaaaaaaa!');
    this.flagI.set(false);
    this.flagM.set(false);
    this.flagS.set(false);
    this.flagR.set(false);
    this.engine.set('dotnet');
    this.mode.set('find');
    this.replacement.set('');
  }
}
