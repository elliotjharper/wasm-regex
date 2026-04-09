# blazor-wasm-regex

A .NET `[JSExport]` WASM module that exposes regex logic to JavaScript so it can be loaded into any web app (Angular, React, plain JS, …) — no Blazor runtime, no HTML shell, no server required.

---

## How it works

`RegexWasm` is built with the plain `Microsoft.NET.Sdk` targeting `browser-wasm` (not Blazor).
It uses `[JSExport]` to expose three static methods directly to JavaScript.
Publishing it produces a standard `_framework/` folder of static files.

### Prerequisites

```bash
dotnet workload install wasm-tools
```

### Build

```bash
dotnet publish -r browser-wasm -c Release
```

Output: `bin/Release/net9.0/browser-wasm/AppBundle/`

Copy the `_framework/` subfolder into your Angular (or other) project's static assets.

### Exported API

All methods are synchronous and return JSON strings.

#### `RegexApi.FindMatches(pattern, input, flags)`

Returns a JSON array of match objects, or an error object.

```json
// success
[
  { "value": "Hello", "index": 0, "length": 5, "groups": [] },
  { "value": "world", "index": 6, "length": 5, "groups": [] }
]

// parse error
{ "error": "parse", "message": "Invalid pattern …" }

// catastrophic backtracking (> 2 s)
{ "error": "timeout", "message": "Regex match timed out …" }
```

#### `RegexApi.ReplaceAll(pattern, input, replacement, flags)`

Returns the replaced string, or an error object (same shape as above).
Supports .NET backreference syntax (`$1`, `$2`, `${name}`, etc.).

#### `RegexApi.Validate(pattern)`

Returns `""` if the pattern is valid, or the parse error message string.

#### `flags` parameter

Any combination of the single characters:

| char | effect |
|---|---|
| `i` | case-insensitive |
| `m` | multiline (`^`/`$` match line boundaries) |
| `s` | single-line / dotall (`.` matches `\n`) |

Pass `""` for no flags.

### Angular integration (TypeScript)

```ts
// angular.json: add "_framework" folder to assets[]
// tsconfig: "allowSyntheticDefaultImports": true, "moduleResolution": "bundler"

import { dotnet } from '../assets/_framework/dotnet.js';

let regexApi: { FindMatches: Function; ReplaceAll: Function; Validate: Function } | null = null;

export async function initRegexWasm(): Promise<void> {
  // create() loads the WASM runtime and returns the interop helpers
  const { getAssemblyExports, getConfig, runMain } = await dotnet
    .withConfig({})
    .create();

  // runMain() starts Program.cs (Task.Delay(Infinite)) — fire-and-forget,
  // it never resolves, but the [JSExport] methods are immediately usable.
  runMain();

  const config = getConfig();
  const exports = await getAssemblyExports(config.mainAssemblyName); // "RegexWasm.dll"
  regexApi = exports.RegexApi;
}

export function findMatches(pattern: string, input: string, flags = '') {
  const raw = regexApi!.FindMatches(pattern, input, flags) as string;
  return JSON.parse(raw); // array of matches, or { error, message }
}

export function replaceAll(pattern: string, input: string, replacement: string, flags = '') {
  return regexApi!.ReplaceAll(pattern, input, replacement, flags) as string;
  // if the returned string starts with '{' it is an error object; otherwise it is the result
}

export function validate(pattern: string): string {
  return regexApi!.Validate(pattern) as string; // "" = valid
}
```

> **Note:** `dotnet.js` is an ES module. Make sure Angular's build is configured to treat
> it as an external ES module or copy it as a verbatim asset and load it with a dynamic
> `import()`. Vite/esbuild-based Angular 17+ projects handle this automatically.
