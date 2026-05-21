# Hiveryn Desktop

The Hiveryn desktop app. **Currently under active development — not ready for general use.**

Built with Electron, React, and Tailwind CSS. Talks to the local Hiveryn daemon for all state and agent operations.

## Logging

Log location is mode-specific:

| Mode | Directory |
|------|-----------|
| Production | `~/.hiveryn/logs/` |
| Development | `~/.hiveryn/logs-dev/` |

Both modes write `desktop.jsonl` (main process) and `renderer.jsonl` (forwarded renderer `console.*` output) into their respective directory.

## Requirements

- [Hiveryn daemon](../daemon) running on `http://127.0.0.1:4201`

## Running locally

```bash
pnpm install
pnpm dev
```

## License

MIT
