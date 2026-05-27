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
      health.ts           Daemon health polling — GET /api/health, broadcasts daemon:health-status
      sse.ts              Shared SSE parsing (dispatchSseBlock, consumeSseBuffer)
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-session per webContents
      architect-events.ts Architect SSE subscription manager — live kanban refresh
    ipc/
      index.ts            registerIpc() — calls all namespace registrars
      results.ts          Centralized DaemonResult helpers (ok, errorResult, invalidDaemonResponse, withNullData, withData)
      logs.ts             logs:renderer handler — writes forwarded renderer console logs
      preferences.ts      preferences:*, user:* handlers (local, no daemon call)
      profiles.ts         profiles:* handlers → daemon HTTP via daemonFetch
      architects.ts       architects:* handlers → daemon HTTP via daemonFetch
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-terminal per session
      sessions.ts         sessions:list/create/createFreeform/conclude/approve-conclusion/reject-conclusion → daemon HTTP
      tabs.ts             tabs:list → daemon HTTP; canonical right-pane session layout
      terminals.ts        terminals:list/create/kill → daemon HTTP
      tickets.ts          tickets:* handlers → daemon HTTP via daemonFetch
      launcher.ts         launcher:open-architect handler
      daemon.ts           daemon:health:get handler
  preload/
    index.ts              contextBridge — invoke() wrapper + daemon.onRequest listeners
    index.d.ts            Global TypeScript types for the renderer (Envelope, IpcError, HiverynAPI…)
  renderer/src/
    App.tsx               Root component — hash-based routing between Launcher / ArchitectWindow
    main.tsx              React entry, theme init, renderer console logging install
    logging.ts            Renderer console patch — captures console.* and forwards structured logs
    state/
      sessionStore.ts     Zustand store — sessions, main terminal IDs, daemon tabs, events, focusedPane, active selection, pendingApproval
      selectors.ts        Stable-reference selectors (useEventsForActiveSession, useWorkSessions, …)
    hooks/
      useShortcutConfig.ts        Fetches keybindings from daemon; exposes ShortcutConfig type
    keys/
      matchers.ts                 matchesShortcut(), isTextInputFocused(), SHIFT_MAP, CODE_MAP
      dispatcher.ts               dispatch() — single routing function for all key events; registerDynamicHandler()
      useKeyDispatcher.ts         Single document-level keydown listener; calls setActiveShortcutConfig + dispatch
    pages/
      launcher.tsx        Launcher page — architect list, variant selection on click
      architect-window/
        index.tsx                Thin shell — composes hooks + view components
        SessionTerminal.tsx      Reusable terminal — connect to any (sessionId, terminalId)
        hooks/                   useArchitectData, useSessionRestore, useSessionEvents,
                                 useDaemonRecovery, sessionSnapshot
        components/              RightPane, BottomTabs, MainTerminalStack,
                                 ExtraTerminalStack, TicketWorkflow, ConcludeSessionDialog,
                                 FreeformSessionDialog, ApprovalDialog
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
    types.ts              Types shared across main, preload, and renderer modules (Envelope, AgentProfile, Session…)
```

## IPC and envelope pattern

Every daemon-backed IPC call follows this chain:

1. **Main handler** (`ipc/*.ts`) calls `daemonFetch()`, which always returns `{ envelope, httpStatus }` — never throws.
2. **Preload `invoke()`** receives the result, notifies `daemon.onRequest` listeners (for the request log), then either returns `envelope.data` or throws an `IpcError` with `{ status, code, details, stacktrace }` from the envelope.
3. **Renderer** catches `IpcError` — field-level errors (status 400/409) are set directly on form fields via `details.field`; other API errors are surfaced through the `ApiEnvelopeError` component (`src/renderer/src/components/ApiEnvelopeError/`), which renders the full daemon error including `status`, `code`, `details`, and `stacktrace`.

All API responses follow `domain.Envelope` (`data | error`, `logs`, `commands`, `meta.request_id`). The desktop surfaces this in the `RequestLog` panel at the bottom of every page.

## Structured desktop logging

The desktop app writes append-only structured JSONL logs under the resolved runtime home: `$HIVERYN_HOME/logs/` when `HIVERYN_HOME` is set, otherwise `~/.hiveryn/logs/`.

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
- `src/shared/types.ts` is the only cross-boundary module. Main and preload import from it, and renderer may import from it when a module export is needed; ambient renderer globals still come from `index.d.ts`.
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
- **`session:event` IPC events** include `session_intent_id` in the payload — session-level lifecycle events from the daemon's SSE stream.
- **`session.send(sessionId, terminalId, data)`** and **`session.resize(sessionId, terminalId, cols, rows)`** take explicit identifiers — there is no global "active terminal" concept in the main process. Each `SessionTerminal` knows its own `(sessionId, terminalId)` and routes accordingly.

### Terminal lifecycle

Terminal WebSockets survive component mount/unmount cycles. `SessionTerminal` connects on mount, opening the terminal WebSocket; the SSE event stream is session-level and shared across all terminals for that session. The WebSocket stays alive in the main process across renders.

`session.subscribe(sessionId)` starts the SSE stream independently of any terminal WebSocket — used by `useSessionRestore` to begin receiving events as soon as sessions are restored, before `SessionTerminal` mounts. Calling `connect()` for a session that `subscribe()` already opened is safe: `startSse` is a no-op when SSE is already running.

Main terminal disconnect is not session lifecycle. If the main terminal WebSocket closes because the daemon respawned the agent, keep the session registered, keep session SSE active, update `mainTerminalId` from the daemon's `main_terminal_resumed` event or refreshed session list, and let `MainTerminalStack` reconnect by remounting the terminal keyed by the new UUID.

Duplicate `connect()` calls for the same terminal (e.g. from React StrictMode) are deduplicated via `pendingConnects` map keyed by `wcId:sessionId:terminalId`.

Terminal DOM persistence: `TerminalPane` xterm instances are mounted **once per (session, terminal)** in `MainTerminalStack` / `ExtraTerminalStack` and stay mounted as long as the session exists in the store. Visibility is toggled via `display:none` + the `visible` prop, which triggers an immediate `fit()` + `refresh()` in `useLayoutEffect` — no black-screen-on-tab-switch and full scrollback preservation across switches.

### Layout

| Pane | Content |
|---|---|
| **Left pane** | `MainTerminalStack` — every session's main terminal mounted as a sibling; visibility picked by `activeSessionId`. Shows a "No active session / Return to Launcher" fallback when no session is registered. |
| **Right pane** | Daemon-provided tabs from `tabs:list`: Kanban, Activity log, and `ExtraTerminalStack` terminal tabs. Tab visibility picked by `activeRightTab`. |
| **Bottom bar** | `BottomTabs` — one tab per session in the store (architect first, then ticket/freeform sessions). Active tab driven by `activeSessionId`. |

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

- **Spawn**: the launcher creates a session intent via `sessions.create('architect', key)` then spawns a run via `sessions.createRun(intent.id, profileName)`, then opens the architect window. The architect window does not spawn — it only restores.
- **Restore**: on mount, `useSessionRestore` calls `sessions.list()` + `tabs.list(id)` for every running session that matches the architect key, using `current_run.main_terminal_id` for the left-pane terminal and daemon tabs for the right pane.
- **Recovery**: `useDaemonRecovery` subscribes to `daemon:health-status` events from the main-process health poller. On `unreachable → healthy` transitions, it re-fetches the full daemon session snapshot and reconciles the store via `store.reconcileSessions()`, which handles changed terminal UUIDs, removed sessions, and stale tab/focus selection.
- **`sessions:list`** returns `SessionIntent[]`. A session is running when `intent.current_run?.status === 'running'`; main-terminal reconnects use `current_run.main_terminal_id`.
- The daemon enforces **one running session per architect** (partial unique index).
- Session disconnect will be a future explicit user action — never an automatic cleanup.

## Daemon health polling

The main-process health manager (`src/main/daemon/health.ts`) polls `GET /api/health` on a configurable interval. It tracks `unknown | unreachable | healthy` state transitions and broadcasts `daemon:health-status` events to all renderer windows.

| Transition | Action |
|---|---|
| Any → unreachable | `sessionManager.handleDaemonUnavailable()` + `architectEvents.handleDaemonUnavailable()` — abort all WS, SSE, and clear stale state |
| Unreachable → healthy | `architectEvents.handleDaemonAvailable()` — re-open architect SSE subscriptions; renderer triggers session snapshot reconciliation |
| First healthy detection | Loads `GET /api/config/desktop` to read `desktop_health_poll_interval` from `~/.hiveryn/config.yaml` |

The `daemon:health:get` IPC lets renderers read the current status synchronously upon mount, so windows opened during an outage receive the correct initial state.

## IPC response helpers

All main-process IPC handlers that construct `DaemonResult` envelopes use the centralized helpers in `src/main/ipc/results.ts`:

| Helper | Use |
|---|---|
| `ok(data)` | Success response with payload |
| `errorResult(code, message)` | Desktop-authored error (session, network) |
| `invalidDaemonResponse(message)` | Daemon returned an unexpected payload shape |
| `withNullData(result)` | Passthrough daemon error, null data |
| `withData(result, data)` | Passthrough with transformed data |

## Session conclusion cleanup

When a session ends (architect or worker), the daemon sends a daemon-authored `status: ended` SSE event with `raw.lifecycle === 'concluded'`. Raw agent `ended` events are not session lifecycle. `useSessionEvents` immediately performs client-side cleanup with no dialog or countdown:

1. `session.disconnect(sessionId)` — cleans up client-side WebSocket/SSE
2. `store.unregisterSession(sessionId)` — removes the session from the Zustand store
3. **Architect session**: calls `architect.closeWindow()` — closes the entire architect window
4. **Ticket/freeform session**: switches the active session back to the architect (or `null` if none remain) and resets the right pane to `kanban` or `event-log`

## Conclusion approval flow

When an agent requests a conclusion via MCP, the daemon blocks and publishes a `{ type: "status", status: "approval_required", raw: { body: "..." } }` SSE event on the session stream. The desktop handles this as follows:

1. **`useSessionEvents`** detects `status === 'approval_required'`, extracts `raw.body` (throws if missing), and calls `store.setPendingApproval({ sessionId, body })`.
2. **`ArchitectWindow`** subscribes to `pendingApproval` from the session store and renders `<ApprovalDialog>` when non-null.
3. **`ApprovalDialog`** shows the conclusion body as rendered markdown. "APPROVE" calls `sessions:approve-conclusion` IPC → `POST /api/sessions/{id}/approve-conclusion`. "REJECT" transitions to a reason-input step; confirming calls `sessions:reject-conclusion` IPC → `POST /api/sessions/{id}/reject-conclusion` with `{ reason }`.
4. On either action completing, `setPendingApproval(null)` closes the dialog.

The dialog is scoped to the window that owns the session — each architect window runs its own `useSessionEvents` and its own store slice, so only the correct window shows the dialog.

## Keyboard shortcuts and focus model

Keybindings are owned by the daemon (`GET /api/config/shortcuts`). The desktop has **no hardcoded fallbacks** — if the response is missing a required section, shortcuts are disabled and the error is surfaced via the `ApiEnvelopeError` component.

### Dispatch architecture

All keyboard routing flows through a single `dispatch(event)` function in `keys/dispatcher.ts`. It returns `'consumed' | 'passthrough'`.

There are two callers:

1. **`TerminalPane.attachCustomKeyEventHandler`** — called by xterm itself before its own `_keyDown`/`_keyPress` processing. When the terminal has DOM focus, this is the gate. Returning `false` suppresses xterm's emit so the keystroke never reaches the PTY. Returning `true` passes through. xterm-level concerns (Shift+Enter → `\n`, double-fire suppression) are also handled here.

2. **`useKeyDispatcher`** — a single bubble-phase `keydown` listener on `document`. Skips events whose target is `.xterm-helper-textarea` (those come via path 1). Calls `dispatch(event)`, and if `'consumed'`, calls `preventDefault()`/`stopPropagation()`.

The dispatcher runs handlers in two stages:
- **Dynamic handlers** (LIFO stack, registered via `registerDynamicHandler`) — for modal/pane-local shortcuts that need component state (kanban cursor, dialog-open flag). Components register via `useEffect` and get an unregister cleanup.
- **Global shortcuts** — focus-left/right/up/down, focus-main, first/prev/next-session, close-tab, new-terminal, direct tab jumps (Cmd+2..9).

`matchesShortcut(event, binding)` in `keys/matchers.ts` understands modifier strings (`Cmd+Shift+x`), shift-character mapping (`Shift+[` → `{`), and `event.code` fallback for layout-independent punctuation/digit matching.

- **Pane-local shortcuts** (kanban `h/l/j/k/o/s/r`, event-log `j/k/o/c`) use `registerDynamicHandler` inside `RightPane`, gated on `focusedPane`. `isTextInputFocused()` guards them so modal inputs are never stolen.
- **`quit`** (`q`) uses `registerDynamicHandler` inside `TicketWorkflow`, active only while a dialog is open.

### Focus model

`sessionStore.focusedPane` is the single source of truth: `'main-terminal' | 'right-kanban' | 'right-event-log' | 'right-terminal:{uuid}'`. It is updated by:
- Clicks on pane wrappers
- Navigation shortcut actions inside the dispatcher
- `TerminalPane.onTextAreaFocus` callback — fires when xterm's helper textarea receives DOM focus by any means (keyboard shortcut transition or mouse click), calling `setFocusedPane` to keep app state in sync with DOM reality.

`TerminalPane` accepts a `focused` prop that drives `term.focus()` / `term.blur()`. `MainTerminalStack` / `ExtraTerminalStack` compute `focused` per-terminal from `focusedPane` and pass `paneId` so each terminal knows which pane ID to claim on focus.

The visual focus ring is a `::after` pseudo-element overlay on the pane wrappers (`z-index: var(--z-index-pane-focus)`, `pointer-events: none`), so it sits **above** xterm's canvas but **below** modals. The color is `--theme-focus-ring` (defined in `styles/global.css`), which tracks the active light/dark theme.

## Architect workspace events

The architect window subscribes to the daemon's `GET /api/architects/{key}/events` SSE stream for live kanban refresh when tickets change.

- **`architects.subscribeEvents(key, callback)`** (renderer API) — opens SSE, `callback` fires on each `WorkspaceChangedEvent`. Returns unsubscribe function.
- **Main process** — `architect-events.ts` manages SSE connections per `(webContents, architectKey)`. Parses `data:` lines, forwards `WorkspaceChangedEvent` to renderer via `sender.send('architect:workspace-event', ...)`.
- **Subscription lifecycle** — `subscribeEvents` invokes `architects:events:subscribe` IPC (opens SSE), `unsubscribe` invokes `architects:events:unsubscribe` IPC (aborts SSE). Window `destroyed` auto-cleans up.
- **Re-fetch on event** — renderer callback checks `event.type === 'workspace_changed'`, then re-fetches both `architects.get(architectKey)` (architect metadata/repos) and `tickets.list(architectKey)` (board state) without toggling loading.
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
