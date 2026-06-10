# Hiveryn Desktop

The Hiveryn desktop app. **Currently under active development — not ready for general use.**

Built with Electron, React, and Tailwind CSS. Talks to the local Hiveryn daemon for all state and agent operations.

## Logging

Log location follows the daemon runtime model:

| Environment | Directory |
|-------------|-----------|
| Default | `~/.hiveryn/logs/` |
| Custom `HIVERYN_HOME` | `$HIVERYN_HOME/logs/` |

Desktop writes `desktop.jsonl` (main process) and `renderer.jsonl` (forwarded renderer `console.*` output) alongside daemon logs in that directory.

## Requirements

- [Hiveryn daemon](../daemon) running on `http://127.0.0.1:4200` (configurable via `HIVERYN_DAEMON_URL`)
- `@hiveryn/shared` (file:../shared), `@hiveryn/tabplugin` (file:../tabplugin), and
  `@hiveryn/git-diff` (file:../git-diff) — early-dev packages providing domain types,
  the pluggable tab contract, and the git-diff pluggable tab

## Running locally

```bash
pnpm install
pnpm dev
```

## License

MIT
