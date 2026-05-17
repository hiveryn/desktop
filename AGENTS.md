# desktop Architecture

`desktop` is the Hiveryn Electron application. It provides the UI surface for interacting with the local daemon and, eventually, running agent sessions.

## Purpose

The desktop app is the **primary UI** for Hiveryn. It talks to the daemon over HTTP and surfaces local state — agent profiles, sessions, workspace views — in a native macOS window. It does not own any state; it delegates all reads/writes to the daemon.

## Process boundaries

Electron splits work across three processes. Treat them as three different runtimes — they cannot share memory or call each other directly.

| Process | Entry | What it does |
|---|---|---|
| Main | `src/main/index.ts` | Electron app lifecycle, window creation, IPC handlers, daemon HTTP client |
| Preload | `src/preload/index.ts` | Bridges main ↔ renderer via `contextBridge`; unwraps daemon envelopes; notifies request-log listeners |
| Renderer | `src/renderer/src/main.tsx` | React UI; uses `window.hiveryn.*` exclusively to talk to the outside world |

The renderer has **no Node.js access**. It can only call functions exposed on `window.hiveryn` through the preload bridge. Never import Node or Electron APIs in renderer code.

## Source layout

```
src/
  main/
    index.ts              Electron app setup — window creation, registerIpc()
    logging.ts            Structured JSONL logger — patches main console, writes desktop/renderer logs
    daemon/
      client.ts           daemonFetch() — base URL, timeout, envelope unwrap, never throws
      sse.ts              Shared SSE parsing (dispatchSseBlock, consumeSseBuffer)
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-session per webContents
      architect-events.ts Architect SSE subscription manager — live kanban refresh
    ipc/
      index.ts            registerIpc() — calls all namespace registrars
      logs.ts             logs:renderer handler — writes forwarded renderer console logs
      preferences.ts      preferences:*, user:* handlers (local, no daemon call)
      profiles.ts         profiles:* handlers → daemon HTTP via daemonFetch
      architects.ts       architects:* handlers → daemon HTTP via daemonFetch
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-terminal per session
      sessions.ts         sessions:list/create → daemon HTTP
      tabs.ts             tabs:list → daemon HTTP; canonical right-pane session layout
      terminals.ts        terminals:list/create/kill → daemon HTTP
      tickets.ts          tickets:* handlers → daemon HTTP via daemonFetch
      launcher.ts         launcher:open-architect handler
  preload/
    index.ts              contextBridge — invoke() wrapper + daemon.onRequest listeners
    index.d.ts            Global TypeScript types for the renderer (Envelope, IpcError, HiverynAPI…)
  renderer/src/
    App.tsx               Root component — hash-based routing between Launcher / ArchitectWindow
    main.tsx              React entry, theme init, renderer console logging install
    logging.ts            Renderer console patch — captures console.* and forwards structured logs
    state/
      sessionStore.ts     Zustand store — sessions, main terminal IDs, daemon tabs, events, focusedPane, active selection
      selectors.ts        Stable-reference selectors (useEventsForActiveSession, useWorkSessions, …)
    hooks/
      useShortcutConfig.ts        Fetches keybindings from daemon; exports matchesShortcut() helper
      useNavigationShortcuts.ts   Capture-phase global keydown — focus moves, session cycling, Cmd+T/W
    pages/
      launcher.tsx        Launcher page — architect list, variant selection on click
      architect-window/
        index.tsx                Thin shell — composes hooks + view components
        SessionTerminal.tsx      Reusable terminal — connect to any (sessionId, terminalId)
        hooks/                   useArchitectData, useSessionRestore, useSessionEvents, useViewportMode
        components/              LeftPane, RightPane, BottomTabs, MainTerminalStack,
                                 ExtraTerminalStack, TicketWorkflow
      dashboard/          Dashboard page
      agent-profiles/     Agent Profiles page — index, profile-card, profile-form, schema
    components/
      index.ts            Renderer component barrel exported through @components
      */                  Co-located React components and CSS Modules
      icons/              Component icon exports
    styles/
      global.css          Renderer global styles imported through @styles/global.css
      reset.css           Shared reset imported by global.css
  shared/
    types.ts              Types shared across main and preload (Envelope, AgentProfile, Session…)
```

## IPC and envelope pattern

Every daemon-backed IPC call follows this chain:

1. **Main handler** (`ipc/*.ts`) calls `daemonFetch()`, which always returns `{ envelope, httpStatus }` — never throws.
2. **Preload `invoke()`** receives the result, notifies `daemon.onRequest` listeners (for the request log), then either returns `envelope.data` or throws an `IpcError` with `{ status, code, details, stacktrace }` from the envelope.
3. **Renderer** catches `IpcError` — field-level errors (status 400/409) are set directly on form fields via `details.field`; other errors are toasted.

All API responses follow `domain.Envelope` (`data | error`, `logs`, `commands`, `meta.request_id`). The desktop surfaces this in the `RequestLog` panel at the bottom of every page.

## Structured desktop logging

The desktop app writes append-only structured JSONL logs under `~/.hiveryn/logs/`.

- **Main process** — `desktop.jsonl`: `src/main/logging.ts` patches `console.debug/info/log/warn/error`, captures source location from stack traces, and writes one JSON object per line with `src: "desktop"`.
- **Renderer** — `renderer.jsonl`: `src/renderer/src/logging.ts` patches `console.*`, captures browser-side source location, and forwards a structured payload through `window.hiveryn.logs.writeRenderer(...)` to `logs:renderer` IPC, where the main process appends it with `src: "renderer"`.
- **Schema** — entries use `ts`, `lvl`, `src`, `msg`, `file`, `line`, `fn`, with optional `err`, `ctx`, and `body` fields so they can be consumed alongside daemon JSONL logs.

## Adding a new IPC namespace

1. **`src/main/ipc/<resource>.ts`** — create `register<Resource>Ipc()`. Each handler calls `daemonFetch()` and returns `DaemonResult`. Transform `envelope.data` as needed (e.g. unwrap nested arrays).
2. **`src/main/ipc/index.ts`** — call the new registrar in `registerIpc()`.
3. **`src/preload/index.ts`** — add the new namespace to `contextBridge.exposeInMainWorld`. Add its channels to `CHANNEL_INFO` for the request log display.
4. **`src/preload/index.d.ts`** — extend `HiverynAPI` with the new namespace's types. Add any new domain types as global interfaces.
5. **`src/shared/types.ts`** — add domain types used by both main and preload.

## Adding a new page

1. Create `src/renderer/src/pages/<name>/` with at minimum `index.tsx`. Split into `schema.ts`, component files etc. as it grows — keep co-located.
2. Add the page to the `Page` union and `NAV_ITEMS` in `App.tsx`.
3. Add a render branch in the page content area. The `ErrorBoundary` wrapper and `key={page}` reset are already provided.

## Design rules

- Renderer code never imports from `electron`, `node:*`, or `src/main`. Only `window.hiveryn.*`.
- `src/shared/types.ts` is the only cross-boundary module. Main and preload import from it; renderer uses the global types from `index.d.ts`.
- `daemonFetch` never throws. IPC handlers never throw. Only the preload `invoke()` throws, so renderer error handling is uniform.
- Field-level validation errors use `IpcError.details.field` — no message parsing.
- Shared renderer components live in `src/renderer/src/components/` and are imported through the `@components` alias. This relocated component source and its styles are excluded from desktop Biome formatting to preserve the imported component code as-is. Page-specific components live next to their page's `index.tsx`.
- Error boundaries exist at two levels: global (catches anything) and per-page (`key={page}` resets on navigation).
- Keep `src/main/index.ts` as thin Electron setup only — no business logic, no inline IPC handlers.

## CSS/UI policy

CSS and shared UI component work lives in `src/renderer/src/components/` and `src/renderer/src/styles/`. Keep component behavior and CSS Modules co-located, and route shared component imports through `@components`.

## Multi-session & multi-terminal architecture

The `sessionManager` (`src/main/daemon/session.ts`) supports **multiple concurrent sessions per webContents** — keyed by `wcId → sessionId → ActiveSession`. Each session can have **multiple UUID-addressed terminals**, each with its own WebSocket connection. The daemon-owned tab layout from `GET /api/sessions/{id}/tabs` is the source of truth for all non-main right-pane tabs.

### Terminal data routing

- **`session:data` IPC events** carry `{ sessionId: string; terminalId: string; data: Uint8Array | string }` so the renderer can route PTY output to the correct terminal.
- **`session:terminal-closed` IPC events** carry `{ sessionId: string; terminalId: string }` — fired when a terminal's WebSocket closes server-side (e.g. user ran `exit`). `SessionTerminal` subscribes via `onTerminalClosed` and calls `onDisconnected` in response.
- **`session:event` IPC events** include `session_id` in the payload — session-level lifecycle events unchanged.
- **`session.send(sessionId, terminalId, data)`** and **`session.resize(sessionId, terminalId, cols, rows)`** take explicit identifiers — there is no global "active terminal" concept in the main process. Each `SessionTerminal` knows its own `(sessionId, terminalId)` and routes accordingly.

### Terminal lifecycle

Terminal WebSockets survive component mount/unmount cycles. `SessionTerminal` connects on mount and starts the SSE stream (session-level, shared across terminals). The WebSocket stays alive in the main process across renders.

Main terminal disconnect is not session lifecycle. If the main terminal WebSocket closes because the daemon respawned the agent, keep the session registered, keep session SSE active, update `mainTerminalId` from the daemon's `main_terminal_resumed` event or refreshed session list, and let `MainTerminalStack` reconnect by remounting the terminal keyed by the new UUID.

Duplicate `connect()` calls for the same terminal (e.g. from React StrictMode) are deduplicated via `pendingConnects` map keyed by `wcId:sessionId:terminalId`.

Terminal DOM persistence: `TerminalPane` xterm instances are mounted **once per (session, terminal)** in `MainTerminalStack` / `ExtraTerminalStack` and stay mounted as long as the session exists in the store. Visibility is toggled via `display:none` + the `visible` prop, which triggers an immediate `fit()` + `refresh()` in `useLayoutEffect` — no black-screen-on-tab-switch and full scrollback preservation across switches.

### Layout

| Pane | Content |
|---|---|
| **Left pane** | `MainTerminalStack` — every session's main terminal mounted as a sibling; visibility picked by `activeSessionId`. Shows a "No active session / Return to Launcher" fallback when no session is registered. |
| **Right pane** | Daemon-provided tabs from `tabs:list`: Kanban, Activity log, and `ExtraTerminalStack` terminal tabs. Tab visibility picked by `activeRightTab`. |
| **Bottom bar** | `BottomTabs` — one tab per session in the store (architect first, then workers). Active tab driven by `activeSessionId`. |

Each `SessionTerminal` routes its own `onData`/`onResize` via `(sessionId, terminalId)` props — no shared input-routing state needed.

### Adding a new terminal

1. Call `window.hiveryn.terminals.create(sessionId, {})` and let the daemon choose the default shell → POST to daemon
2. The daemon returns `{ terminal_id, session_id, command, status }`
3. Re-fetch `window.hiveryn.tabs.list(sessionId)` and store that layout via `setSessionTabs()`
4. Set `activeRightTab` to the returned `terminal_id`; `ExtraTerminalStack` will pick it up from the refreshed daemon tabs and render a `SessionTerminal`

### Terminal CRUD

| Channel | Method | Path |
|---|---|---|
| `terminals:list` | GET | `/api/sessions/:id/terminals` |
| `terminals:create` | POST | `/api/sessions/:id/terminals` |
| `terminals:kill` | DELETE | `/api/sessions/:id/terminals/:uuid` |
| `tabs:list` | GET | `/api/sessions/:id/tabs` |

## Architect session lifecycle

Architect sessions run in the daemon and survive component mount/unmount cycles in the renderer. Component lifecycle is NOT session lifecycle.

- **Spawn**: the launcher spawns the architect session via `architects.spawn(key, profileName)` and opens the architect window. The architect window does not spawn — it only restores.
- **Restore**: on mount, `useSessionRestore` calls `sessions.list()` + `tabs.list(id)` for every running session that matches the architect key, using `main_terminal_id` for the left-pane terminal and daemon tabs for the right pane.
- **`sessions:list`** returns daemon session records directly, including `main_terminal_id` for main-terminal reconnects.
- The daemon enforces **one running session per architect** (partial unique index).
- Session disconnect will be a future explicit user action — never an automatic cleanup.

## Session conclusion cleanup

When a session ends (architect or worker), the daemon sends a daemon-authored `status: ended` SSE event with `raw.lifecycle === 'concluded'`. Raw agent `ended` events are not session lifecycle. `useSessionEvents` immediately performs client-side cleanup with no dialog or countdown:

1. `session.disconnect(sessionId)` — cleans up client-side WebSocket/SSE
2. `store.unregisterSession(sessionId)` — removes the session from the Zustand store
3. **Architect session**: calls `architect.closeWindow()` — closes the entire architect window
4. **Worker session**: switches the active session back to the architect (or `null` if none remain) and resets the right pane to `kanban` or `event-log`

## Keyboard shortcuts and focus model

Keybindings are owned by the daemon (`GET /api/config/shortcuts`). The desktop has **no hardcoded fallbacks** — if the response is missing a required section, shortcuts are disabled and an error is logged.

- **`useShortcutConfig`** fetches the config on mount and on every window `focus` event, so daemon-side edits to `~/.hiveryn/shortcuts.yaml` flow in without a desktop reload. It exports `matchesShortcut(event, binding)` which understands modifier strings (`Cmd+Shift+x`), shift-character mapping (`Shift+[` → `{`), and falls back to `event.code` for layout-independent matching of punctuation/digits.
- **`useNavigationShortcuts`** mounts a single capture-phase `keydown` listener on `document`, calls `e.preventDefault() + stopImmediatePropagation()` on match so xterm never sees the keystroke. It dispatches:
  - **focus-left/right** — toggle between `main-terminal` and the right pane (cycling within the right pane is `j/k`'s job, not `h/l`'s).
  - **focus-down/up** — cycle through the vertically-stacked right pane tabs (kanban → event-log → terminals), with wrap.
  - **focus-main** (`Cmd+1`) and direct tab jumps **`Cmd+2..9`** (position-based, not configurable).
  - **first-session** (`Cmd+Shift+0`), **prev/next-session** (`Cmd+Shift+[/]`).
  - **close-tab** (`Cmd+W`) — closes the current terminal tab or worker session.
  - **new-terminal** (`Cmd+T`) — adds an ad-hoc terminal to the active session.
- **Pane-local shortcuts** (kanban `h/l/j/k/o/s/r`, event-log `j/k/o/c`) are handled inside `RightPane` with a capture-phase listener gated on `focusedPane`. The cursor state for both lives in `RightPane`.
- **`quit`** (`q`) is owned by `TicketWorkflow` — listens only while a dialog is open and dismisses the profile selector first, then the ticket detail.

### Focus model

`sessionStore.focusedPane` is a single string field: `'main-terminal' | 'right-kanban' | 'right-event-log' | 'right-terminal:{uuid}'`. Clicks on a pane wrapper set it; navigation shortcuts set it; the bottom session bar has no focus state — sessions are switched by `Cmd+Shift+[/]/0`, not by focusing the bar.

`TerminalPane` accepts a `focused` prop that drives `term.focus()` / `term.blur()`, so xterm's DOM textarea is actively blurred when the user navigates elsewhere — keystrokes don't leak to the PTY. `MainTerminalStack` / `ExtraTerminalStack` compute `focused` per-terminal from `focusedPane`.

The visual focus ring is a `::after` pseudo-element overlay on the pane wrappers (`z-index: var(--z-index-pane-focus)`, `pointer-events: none`), so it sits **above** xterm's canvas but **below** modals. The color is `--theme-focus-ring` (defined in `styles/global.css`), which tracks the active light/dark theme.

## Architect workspace events

The architect window subscribes to the daemon's `GET /api/architects/{key}/events` SSE stream for live kanban refresh when tickets change.

- **`architects.subscribeEvents(key, callback)`** (renderer API) — opens SSE, `callback` fires on each `WorkspaceChangedEvent`. Returns unsubscribe function.
- **Main process** — `architect-events.ts` manages SSE connections per `(webContents, architectKey)`. Parses `data:` lines, forwards `WorkspaceChangedEvent` to renderer via `sender.send('architect:workspace-event', ...)`.
- **Subscription lifecycle** — `subscribeEvents` invokes `architects:events:subscribe` IPC (opens SSE), `unsubscribe` invokes `architects:events:unsubscribe` IPC (aborts SSE). Window `destroyed` auto-cleans up.
- **Re-fetch on event** — renderer callback checks `event.type === 'workspace_changed'`, then re-fetches `tickets.list(architectKey)` and updates board state without toggling loading.
- **Event shape** — `{ type: string, architect_key: string, reason: string, ticket_id: string, at: string }`. Reasons: `ticket_created`, `ticket_updated`, `ticket_moved`, `ticket_deleted`.

## Development

```bash
pnpm dev          # Electron dev server with HMR
pnpm typecheck    # tsc across main + renderer (no emit)
pnpm lint         # Biome check
pnpm format       # Biome check --fix
pnpm build        # Production build (all three processes)
pnpm dist:mac     # Build + package DMG
```
