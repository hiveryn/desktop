# Remove split terminals (ticket 2026-10-09-0520)

## Outcome
No supported split creation, rendering, navigation, configuration or API contract remains in desktop, daemon or shared. Every auxiliary terminal is an ordinary right-pane tab. Kept unchanged: the main/context-pane workbench layout (`.splitPane`, the left/right pane container), maximize, terminal input/resize/scrollback/reconnect, the workdir picker and local/remote (tmux) terminal lifecycle.

## Approach
- **shared** — delete `TerminalPlacement`; `CreateTerminalParams` is `{ workdir_id }`; drop `placement`/`base_tab_id` from `SessionTab` (Go + TS).
- **daemon** — delete placement/base-tab validation and the duplicate-split conflict from `CreateTerminal`, the placement on stored/restored/remote tabs, the domain re-exports, the now-unused `sessionTabID`, and the `split-horizontal` (Cmd+d) default shortcut. Strict request decoding means a request still sending `placement`/`base_tab_id` gets a 400 `unknown field` error. Tests and docs (README, AGENTS, docs/remote-workers.md) updated.
- **desktop** — delete `isSplitTerminalTab`, the split shortcut, `openSplitTerminal`, maximized-split focus routing, split-aware focus cycling/close/selection guards, the `ExtraTerminalStack` split mode, the `RightPane` split container and its `isMaximized` prop (it only served the split), the `.rightPaneSplit*` CSS, the split branch of the workdir picker request, and split comments. The preload `SessionTab`/`CreateTerminalParams` mirrors now alias the shared domain types, as AGENTS.md asks.

## Legacy state
The daemon keeps tab layout in memory only (never in SQLite), so restarting the new daemon drops any old split state, and remote shells already restored as ordinary tabs. A desktop talking to an older daemon ignores `placement`/`base_tab_id`, so a former split shows up as an ordinary selectable tab and is never hidden (covered by a unit test). No user configuration is changed: no live `shortcuts.yaml` exists. If a user file still binds `split-horizontal`, the daemon passes it through, nothing acts on it, and only the shortcuts help dialog lists it.

## Verification
- shared: `go build ./... && go vet ./...`, gofmt clean.
- daemon: `go build`, `go vet`, `go test ./...` all pass.
- desktop: `pnpm typecheck`, `pnpm lint`, vitest (105 tests), `pnpm build` all pass.
- Not done: interactive Electron run.

## Final assessment
The removal is complete. A grep across all three repos finds no `placement`, `base_tab_id`, `TerminalPlacement`, `isSplitTerminalTab` or `split-horizontal` left in code. The remaining "split" matches are unrelated: the diff viewer's split view, path splitting and the workbench pane container. This does not address the WebGL backlog ticket: multiple terminal tabs and sessions still create several contexts.
