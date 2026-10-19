# LibreSprite MCP script for LibreSprite 1.3

`mcp.js` is the remote script of [libresprite-mcp](https://github.com/Snehil-Shah/libresprite-mcp) v0.1.3 (GPL-2.0, © Snehil Shah), adapted so it runs in LibreSprite 1.3. It stays under GPL-2.0; it is not part of this project's MIT-licensed code.

Changes:
- first line `///permission net.fetch`: LibreSprite 1.3 blocks `storage.fetch` without it (a permission dialog appears on the first run)
- `app.yield` events do not reach the script in 1.3: timing uses `setTimeout` when available, otherwise the `storage.fetch` completion events drive the loop
- connects automatically as soon as the server answers (the Connect button is unreliable in 1.3)
- one polling loop only; empty polls (`{"script": null}`) are never posted as output
- register the handler with `setEventHandler` as well
- find the global object without `this` (undefined at script level in 1.3)
- talk to the relay on `127.0.0.1` (the server listens on IPv4 only)
- detect `storage.fetch` responses by polling on every tick instead of relying on a fetch event name

Install (Windows, PowerShell):

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/brummilab/kelloggs-land-hd/main/tools/libresprite/mcp.js -OutFile "$env:APPDATA\LibreSprite\scripts\mcp.js"
```

The MCP server itself needs `mcp<2`: `uvx --with "mcp<2" libresprite-mcp`.
