# blazor-wasm-regex

A .NET `[JSExport]` WASM module that exposes regex logic to JavaScript — no Blazor runtime, no HTML shell, no server required — plus a working Angular 19 demo app that consumes it.

---

## Repository structure

| Directory | Purpose |
|---|---|
| `RegexWasm/` | .NET `browser-wasm` project — builds the WASM module |
| `RegexApp/` | Angular 19 demo app — loads and exercises the WASM module |

---

## RegexWasm

`RegexWasm` is built with the plain `Microsoft.NET.Sdk` targeting `browser-wasm`.
It uses `[JSExport]` to expose three static methods directly to JavaScript.
Publishing it produces a standard `_framework/` folder of static files.

### Prerequisites

```bash
dotnet workload install wasm-tools
```

### Build & copy to Angular

```bash
cd RegexWasm
dotnet publish -r browser-wasm -c Release
```

The post-publish target in `RegexWasm.csproj` automatically copies the `_framework/` output to `RegexApp/public/_framework/`, making it available as a static asset in the Angular app.

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

Returns a JSON object with the replaced string, or an error object (same shape as above).
Supports .NET backreference syntax (`$1`, `$2`, `${name}`, etc.).

```json
// success
{ "result": "Hello WORLD" }

// error (same shape as FindMatches errors)
{ "error": "parse", "message": "…" }
```

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

---

## RegexApp — Angular demo

A minimal Angular 19 standalone app with a `RegexTesterComponent` that loads `RegexWasm` and lets you run FindMatches, Validate, and ReplaceAll interactively.

### Quick start

1. Publish `RegexWasm` first (copies `_framework/` into `RegexApp/public/`):
   ```bash
   cd RegexWasm
   dotnet publish -r browser-wasm -c Release
   ```

2. Start the Angular dev server:
   ```bash
   cd RegexApp
   npm install
   npm start
   ```

3. Open `http://localhost:4200`.

### How the integration works

`RegexWasmService` (`src/app/services/regex-wasm.service.ts`) uses a `new Function` wrapper around a dynamic `import()` to load `/_framework/dotnet.js` at runtime without the Angular/esbuild bundler trying to resolve it at build time:

```ts
const { dotnet } = await (new Function('return import("/_framework/dotnet.js")')() as Promise<{ dotnet: any }>);
const { getAssemblyExports, getConfig, runMain } = await dotnet.withConfig({}).create();
void runMain(); // keeps WASM alive; [JSExport] methods are usable immediately
const exports = await getAssemblyExports(getConfig().mainAssemblyName);
this.api = exports['RegexApi'];
```

