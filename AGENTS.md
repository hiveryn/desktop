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
    daemon/
      client.ts           daemonFetch() — base URL, timeout, envelope unwrap, never throws
      sse.ts              Shared SSE parsing (dispatchSseBlock, consumeSseBuffer)
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-session per webContents
      architect-events.ts Architect SSE subscription manager — live kanban refresh
    ipc/
      index.ts            registerIpc() — calls all namespace registrars
      preferences.ts      preferences:*, user:* handlers (local, no daemon call)
      profiles.ts         profiles:* handlers → daemon HTTP via daemonFetch
      architects.ts       architects:* handlers → daemon HTTP via daemonFetch
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-terminal per session
      sessions.ts         sessions:list/create/delete → daemon HTTP; enriches list with ws_url
      terminals.ts        terminals:list/create/kill → daemon HTTP
      tickets.ts          tickets:* handlers → daemon HTTP via daemonFetch
      launcher.ts         launcher:open-architect handler
  preload/
    index.ts              contextBridge — invoke() wrapper + daemon.onRequest listeners
    index.d.ts            Global TypeScript types for the renderer (Envelope, IpcError, HiverynAPI…)
  renderer/src/
    App.tsx               Root component — hash-based routing between Launcher / ArchitectWindow
    main.tsx              React entry, QueryClient, theme init
    pages/
      launcher/           Launcher page — architect list, open architect window
      architect-window/   Architect window — split-pane layout, terminal, kanban, event log
        SessionTerminal.tsx    Reusable terminal component — connect to any session by id+wsUrl
        ArchitectTerminal.tsx  Architect spawn flow — ProfileSelector → spawn → SessionTerminal
      dashboard/          Dashboard page
      agent-profiles/     Agent Profiles page — index, profile-card, profile-form, schema
    components/
      ui/                 shadcn components (button, dialog, form, toggle-group…)
      request-log/        Daemon activity log panel
      page-error.tsx      Per-page error boundary fallback
  shared/
    types.ts              Types shared across main and preload (Envelope, AgentProfile, Session…)
```

## IPC and envelope pattern

Every daemon-backed IPC call follows this chain:

1. **Main handler** (`ipc/*.ts`) calls `daemonFetch()`, which always returns `{ envelope, httpStatus }` — never throws.
2. **Preload `invoke()`** receives the result, notifies `daemon.onRequest` listeners (for the request log), then either returns `envelope.data` or throws an `IpcError` with `{ status, code, details, stacktrace }` from the envelope.
3. **Renderer** catches `IpcError` — field-level errors (status 400/409) are set directly on form fields via `details.field`; other errors are toasted.

All API responses follow `domain.Envelope` (`data | error`, `logs`, `commands`, `meta.request_id`). The desktop surfaces this in the `RequestLog` panel at the bottom of every page.

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
- shadcn components live in `src/renderer/src/components/ui/` and are excluded from Biome formatting. Page-specific components live next to their page's `index.tsx`.
- Error boundaries exist at two levels: global (catches anything) and per-page (`key={page}` resets on navigation).
- Keep `src/main/index.ts` as thin Electron setup only — no business logic, no inline IPC handlers.

## CSS/UI handoff policy

CSS and UI component work must be done in the `@hiveryn/components` library, NOT in the desktop app. The desktop app should consume components and their styles from the library. If a new design need arises (layout, styling, visual component), create a follow-up ticket for the component library. **Always flag CSS/UI changes in your plan/implementation notes** so they can be handed off.

## Multi-session & multi-terminal architecture

The `sessionManager` (`src/main/daemon/session.ts`) supports **multiple concurrent sessions per webContents** — keyed by `wcId → sessionId → ActiveSession`. Each session can have **multiple named terminals** (e.g. `main`, `bash`, `bash-2`), each with its own WebSocket connection.

### Terminal data routing

- **`session:data` IPC events** carry `{ sessionId: string; terminalName: string; data: Uint8Array | string }` so the renderer can route PTY output to the correct terminal.
- **`session:terminal-closed` IPC events** carry `{ sessionId: string; terminalName: string }` — fired when a terminal's WebSocket closes server-side (e.g. user ran `exit`). `SessionTerminal` subscribes via `onTerminalClosed` and calls `onDisconnected` in response.
- **`session:event` IPC events** include `session_id` in the payload — session-level lifecycle events unchanged.
- **`session.setActive(sessionId, terminalName)`** must be called before `send()` or `resize()` so input reaches the correct terminal's WebSocket. `SessionTerminal` calls this on mount; clicking a terminal in the UI also routes input via click handlers.

### Terminal lifecycle

Terminal WebSockets survive component mount/unmount cycles. `SessionTerminal` connects on mount and starts the SSE stream (session-level, shared across terminals). The WebSocket stays alive in the main process across renders.

Duplicate `connect()` calls for the same terminal (e.g. from React StrictMode) are deduplicated via `pendingConnects` map keyed by `wcId:sessionId:terminalName`.

Terminal DOM persistence: `TerminalPane` xterm instances survive tab switches via `display: none`/`flex` toggling. All right-pane elements (kanban, event-log, user terminals) are always mounted; only the active one is shown. This preserves xterm instances and scrollback across tab switches.

### Layout

| Pane | Content |
|---|---|
| **Left pane** | Always the **main terminal** of the active session. Architect sessions use `ArchitectTerminal` (idle/spawn/running lifecycle). Worker sessions use `SessionTerminal` with `terminalName="main"`. |
| **Right pane** | Views scoped to the active session: Kanban + Activity (architect) or Activity only (worker), plus user-created terminal tabs. User terminals are created via `TERMINALS.create()` with auto-generated names (`bash`, `bash-2`, ...) and default command `bash`. |
| **Bottom bar** | Session switcher only: Architect tab (always present) + worker session tabs. No user terminals in the bottom bar. |

Input routing: clicking anywhere in the left pane routes input to the main terminal. Clicking a right-pane terminal tab or inside the terminal area routes input to that terminal. Switching to kanban/event-log routes input back to main.

### Adding a new terminal

1. Call `window.hiveryn.terminals.create(sessionId, { name, command, args })` → POST to daemon
2. The daemon returns `{ name, ws_url }`; desktop derives the WebSocket URL per terminal
3. Add the terminal to `activeTerminals` state with the appropriate tab key (`arch:{name}` or `{sessionId}:{name}`)
4. Render a `<SessionTerminal>` with the terminal's `wsUrl` and `terminalName`

### Terminal CRUD

| Channel | Method | Path |
|---|---|---|
| `terminals:list` | GET | `/api/sessions/:id/terminals` |
| `terminals:create` | POST | `/api/sessions/:id/terminals` |
| `terminals:kill` | DELETE | `/api/sessions/:id/terminals/:name` |

## Architect session lifecycle

Architect sessions run in the daemon and survive component mount/unmount cycles in the renderer. Component lifecycle is NOT session lifecycle.

- **`ArchitectTerminal`** does NOT disconnect on unmount. The WebSocket/SSE stay alive in the main process.
- **On mount**, `ArchitectTerminal` calls `sessions:list` to find a running session matching the architect key (`architect_key`) and reconnects to it. This handles both layout-change remounts (desktop↔compact) and app relaunches.
- **`sessions:list`** enriches each session with a derived `ws_url` (`ws://{daemon}/ws/session/{id}/terminal/main`) since the daemon's spawn endpoint is the only source of the WS URL.
- The daemon enforces **one running session per architect** (partial unique index), so `.find()` is safe.
- Session disconnect will be a future explicit user action — never an automatic cleanup.

## Session conclusion dialog

When a session ends (architect or worker), the daemon sends a `status: ended` SSE event with conclusion data in `event.raw` (`{body, commits, rejected, rejection_reason}`). The `ArchitectWindow` detects this and renders `SessionConcludedDialog` (from `@hiveryn/components`) — a non-dismissable modal with a countdown timer (5s) and "Terminate Now" button.

On complete (timer or click):

1. `sessions.delete(sessionId)` — kills the daemon session (PTY, bridges, subscribers, DB record)
2. `session.disconnect(sessionId)` — cleans up client-side WebSocket/SSE
3. **Architect session**: calls `architect.closeWindow()` — closes the entire architect window
4. **Worker session**: removes the worker tab from `activeTerminals`, switches back to the architect tab, and calls `session.setActive()` on the architect session to restore input routing

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
