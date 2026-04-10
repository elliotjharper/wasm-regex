import { Injectable } from '@angular/core';
import type { WorkerResponse } from './regex.worker';

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

@Injectable({ providedIn: 'root' })
export class RegexWasmService {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void }
  >();
  private initPromise: Promise<void> | null = null;

  /** Load and initialise the .NET WASM module in a Web Worker. Safe to call multiple times. */
  init(): Promise<void> {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  private async load(): Promise<void> {
    this.worker = new Worker(new URL('./regex.worker', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener(
      'message',
      (ev: MessageEvent<WorkerResponse>) => {
        const { id, ...rest } = ev.data;
        const p = this.pending.get(id);
        if (p) {
          this.pending.delete(id);
          if (rest.error && !rest.result) {
            p.reject(new Error(rest.error));
          } else {
            p.resolve(ev.data);
          }
        }
      },
    );
    await this.postMessage({ type: 'init' });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private postMessage(msg: Record<string, any>): Promise<WorkerResponse> {
    if (!this.worker) return Promise.reject(new Error('Worker not created'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ ...msg, id });
    });
  }

  // ── .NET WASM methods (async, off main thread) ─────────────────────────────

  async findMatches(
    pattern: string,
    input: string,
    flags: string,
  ): Promise<MatchResult[] | RegexError> {
    const resp = await this.postMessage({
      type: 'findMatches',
      pattern,
      input,
      flags,
    });
    return JSON.parse(resp.result!) as MatchResult[] | RegexError;
  }

  async replaceAll(
    pattern: string,
    input: string,
    replacement: string,
    flags: string,
  ): Promise<string | RegexError> {
    const resp = await this.postMessage({
      type: 'replaceAll',
      pattern,
      input,
      replacement,
      flags,
    });
    const raw = JSON.parse(resp.result!) as { result: string } | RegexError;
    return isRegexError(raw) ? raw : raw.result;
  }

  async validate(pattern: string): Promise<string> {
    const resp = await this.postMessage({ type: 'validate', pattern });
    return resp.result ?? '';
  }

  // ── JavaScript native regex engine (synchronous, main thread) ──────────────

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
