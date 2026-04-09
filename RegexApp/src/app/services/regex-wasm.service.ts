import { Injectable } from '@angular/core';

export interface MatchResult {
  value: string;
  index: number;
  length: number;
  groups: string[];
}

export interface RegexError {
  error: 'parse' | 'timeout';
  message: string;
}

export function isRegexError(v: unknown): v is RegexError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

interface RegexApiExports {
  FindMatches(pattern: string, input: string, flags: string): string;
  ReplaceAll(
    pattern: string,
    input: string,
    replacement: string,
    flags: string,
  ): string;
  Validate(pattern: string): string;
}

@Injectable({ providedIn: 'root' })
export class RegexWasmService {
  private api: RegexApiExports | null = null;
  private initPromise: Promise<void> | null = null;

  /** Load and initialise the .NET WASM module. Safe to call multiple times. */
  init(): Promise<void> {
    if (this.api) return Promise.resolve();
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  private async load(): Promise<void> {
    // Use `new Function` to prevent esbuild from treating /_framework/dotnet.js
    // as a build-time module; it is a runtime WASM asset served from public/.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { dotnet } = await (new Function(
      'return import("/_framework/dotnet.js")',
    )() as Promise<{ dotnet: any }>);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { getAssemblyExports, getConfig, runMain } = await dotnet
      .withConfig({})
      .create();

    // runMain() starts Program.cs which calls Task.Delay(Infinite) to keep the
    // WASM module alive. Fire-and-forget — [JSExport] methods are usable immediately.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    void runMain();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const config = getConfig();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const exports = await getAssemblyExports(config.mainAssemblyName);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.api = exports['RegexApi'] as RegexApiExports;
  }

  findMatches(
    pattern: string,
    input: string,
    flags: string,
  ): MatchResult[] | RegexError {
    if (!this.api) throw new Error('RegexWasmService is not initialised');
    return JSON.parse(this.api.FindMatches(pattern, input, flags)) as
      | MatchResult[]
      | RegexError;
  }

  replaceAll(
    pattern: string,
    input: string,
    replacement: string,
    flags: string,
  ): string | RegexError {
    if (!this.api) throw new Error('RegexWasmService is not initialised');
    const raw = JSON.parse(
      this.api.ReplaceAll(pattern, input, replacement, flags),
    ) as { result: string } | RegexError;
    return isRegexError(raw) ? raw : raw.result;
  }

  validate(pattern: string): string {
    if (!this.api) throw new Error('RegexWasmService is not initialised');
    return this.api.Validate(pattern);
  }

  // ── JavaScript native regex engine ─────────────────────────────────────────

  validateJs(pattern: string, flags: string): string {
    try {
      new RegExp(pattern, flags);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  findMatchesJs(
    pattern: string,
    input: string,
    flags: string,
  ): MatchResult[] | RegexError {
    try {
      const jsFlags =
        flags.replace(/[^igms]/g, '') + (flags.includes('g') ? '' : 'g');
      const re = new RegExp(pattern, jsFlags);
      const results: MatchResult[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(input)) !== null) {
        const groups: string[] = [];
        for (let i = 1; i < m.length; i++) groups.push(m[i] ?? '');
        results.push({
          value: m[0],
          index: m.index,
          length: m[0].length,
          groups,
        });
        if (!re.global) break;
      }
      return results;
    } catch (e) {
      return {
        error: 'parse',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  replaceAllJs(
    pattern: string,
    input: string,
    replacement: string,
    flags: string,
  ): string | RegexError {
    try {
      const jsFlags =
        flags.replace(/[^igms]/g, '') + (flags.includes('g') ? '' : 'g');
      const re = new RegExp(pattern, jsFlags);
      return input.replace(re, replacement);
    } catch (e) {
      return {
        error: 'parse',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
