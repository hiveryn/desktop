# Hiveryn Desktop

The Hiveryn desktop app. **Currently under active development — not ready for general use.**

Built with Electron, React, and Tailwind CSS. Talks to the local Hiveryn daemon for all state and agent operations.

## Logging

- Main-process structured logs append to `~/.hiveryn/logs/desktop.jsonl`
- Renderer `console.*` output is forwarded over IPC and appended to `~/.hiveryn/logs/renderer.jsonl`

## Requirements

- [Hiveryn daemon](../daemon) running on `http://127.0.0.1:4201`

## Running locally

```bash
pnpm install
pnpm dev
```

## License

MIT
