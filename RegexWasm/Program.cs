// Keep the WASM module alive so that [JSExport] methods remain callable
await Task.Delay(Timeout.Infinite);
