/// <reference lib="webworker" />

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

let api: RegexApiExports | null = null;

async function loadWasm(): Promise<void> {
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  void runMain();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const config = getConfig();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const exports = await getAssemblyExports(config.mainAssemblyName);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  api = exports['RegexApi'] as RegexApiExports;
}

export type WorkerRequest =
  | { id: number; type: 'init' }
  | {
      id: number;
      type: 'findMatches';
      pattern: string;
      input: string;
      flags: string;
    }
  | {
      id: number;
      type: 'replaceAll';
      pattern: string;
      input: string;
      replacement: string;
      flags: string;
    }
  | { id: number; type: 'validate'; pattern: string };

export interface WorkerResponse {
  id: number;
  result?: string;
  error?: string;
}

addEventListener('message', async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init':
        await loadWasm();
        postMessage({ id: msg.id } satisfies WorkerResponse);
        break;
      case 'findMatches':
        if (!api) throw new Error('Not initialised');
        postMessage({
          id: msg.id,
          result: api.FindMatches(msg.pattern, msg.input, msg.flags),
        } satisfies WorkerResponse);
        break;
      case 'replaceAll':
        if (!api) throw new Error('Not initialised');
        postMessage({
          id: msg.id,
          result: api.ReplaceAll(
            msg.pattern,
            msg.input,
            msg.replacement,
            msg.flags,
          ),
        } satisfies WorkerResponse);
        break;
      case 'validate':
        if (!api) throw new Error('Not initialised');
        postMessage({
          id: msg.id,
          result: api.Validate(msg.pattern),
        } satisfies WorkerResponse);
        break;
    }
  } catch (e) {
    postMessage({
      id: msg.id,
      error: e instanceof Error ? e.message : String(e),
    } satisfies WorkerResponse);
  }
});
