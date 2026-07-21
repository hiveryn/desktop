# desktop Architecture

`desktop` is the Hiveryn Electron application — the native macOS window for agent profiles, sessions, and workspace views. This document covers how the desktop app is built and how to work in it: the main/preload/renderer split, source layout, the IPC + envelope pattern, structured logging, the terminal/GPU lifecycle, the native tab registry, the intent approval and conclusion flows, the keyboard/focus model, and the dev commands.

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
    index.ts              Electron app setup — window creation, registerIpc(), createTray(), global shortcut, navigation guard (blocks in-window navigation; external links → default browser); forces a foreground activation policy (setActivationPolicy('regular') + dock.show()) for unpackaged macOS runs so the app registers in cmd+tab/dock
    tray.ts               Menu bar Tray + frameless popover window (loads #/tray); doubles as the centered ⌥Space palette
    globalShortcut.ts     OS-global palette shortcut — reads os-global.palette, registers via globalShortcut, surfaces failures
    logging.ts            Structured JSONL logger — patches main console, writes desktop/renderer logs
    browserView.ts        Native WebContentsView registry for browser tabs — one view per tab id (isolated partition, own window-open/will-navigate policy, echo-suppressing loadURL, attach/detach/bounds); owns native state, ipc/browserView.ts wraps it (mirrors tray.ts / ipc/tray.ts)
    daemon/
      client.ts           daemonFetch() — base URL, timeout, envelope unwrap, never throws; daemonFetchRaw() for raw-bytes endpoints (envelope errors, raw success body)
      health.ts           Daemon health polling — GET /api/health, broadcasts daemon:health-status
      sse.ts              Shared SSE parsing (dispatchSseBlock, consumeSseBuffer)
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-session per webContents
      architect-events.ts Architect SSE subscription manager — live kanban refresh
    ipc/
      index.ts            registerIpc() — calls all namespace registrars
      results.ts          Centralized DaemonResult helpers (ok, errorResult, invalidDaemonResponse, withNullData, withData)
      logs.ts             logs:renderer handler — writes forwarded renderer console logs
      preferences.ts      user:* handlers (local, no daemon call)
      profiles.ts         profiles:* handlers → daemon HTTP via daemonFetch
      architects.ts       architects:* handlers → daemon HTTP via daemonFetch
      session.ts          sessionManager — WebSocket + SSE lifecycle, multi-terminal per session
      sessions.ts         sessions:list/create/createFreeform/conclude/discard/approve-intent/deny-intent → daemon HTTP
      tabs.ts             tabs:list → daemon HTTP; tabs:createBrowserTab/closeBrowserTab → POST/DELETE /api/sessions/:id/browser-tabs (browser tab state); canonical right-pane session layout
      terminals.ts        terminals:list/create/kill → daemon HTTP
      browserView.ts      browser:* handlers — native WebContentsView lifecycle (create/navigate/back/forward/reload/destroy/bounds); pure Electron, no daemon (state routes through tabs.ts)
      tickets.ts          tickets:* handlers → daemon HTTP via daemonFetch
      repos.ts            repos:diff/repos:commitDiff → GET /api/architects/:key/repos/:repoKey/diff[/commits/:sha/diff] (native git-diff tab)
      fs.ts               fs:listDir/fs:readFile → GET /api/fs/tree + /api/fs/file (raw bytes via daemonFetchRaw); fs:writeFile → PUT /api/fs/file (save file edits, overwrite-only); fs:pickDirectory → native directory dialog (native files tab)
      launcher.ts         launcher:open-architect handler — opens/focuses the architect window; self-closes the sender only when it is the launcher window (not the palette / tray)
      daemon.ts           daemon:health:get handler
      palette.ts          palette:focus-architect — cross-window focus + session-switch for the palette
      config.ts           config:shortcuts/desktop → daemon HTTP
      tray.ts             tray:hide / tray:set-height — menu bar popover window control
  preload/
    index.ts              contextBridge — invoke() wrapper + daemon.onRequest listeners
    index.d.ts            Global TypeScript types for the renderer (Envelope, IpcError, HiverynAPI…)
  renderer/src/
    App.tsx               Root component — hash-based routing between Launcher / ArchitectWindow / TrayPalette (#/tray)
    main.tsx              React entry, Nerd Font preload, renderer console logging install
    logging.ts            Renderer console patch — captures console.* and forwards structured logs
    state/
      sessionStore.ts     Zustand store — sessions, main terminal IDs, daemon tabs, events, focusedPane, maximizedPane (per-session), active selection, pendingIntents (keyed by intent id, across all sessions)
      selectors.ts        Stable-reference selectors (useEventsForActiveSession, useWorkSessions, …)
      errorCenterStore.ts Zustand store — durable, per-window error history (entries, unreadCount, sheetOpen); see "Error center" below
      filesStore.ts       Zustand store — per-session files-tab view state (root, current dir, open file, expanded dirs) + window-lifetime custom picker roots
      sessionRepoScope.ts Zustand store + useSessionRepoScope hook — per-session repo scope (primary + additional repos) from ticket + immutable session snapshot; single source shared by FilesPane and GitDiffPane
      paneLayoutStore.ts  Zustand store — window-lifetime sidebar-collapsed flags for the files and git-diff panes (survives pane remounts; deliberately not persisted)
    hooks/
      useShortcutConfig.ts        Fetches keybindings from daemon; exposes ShortcutConfig type
      useErrorCenterCapture.ts    Bridges daemon.onRequest + errors.onInfraEvent into errorCenterStore
    keys/
      matchers.ts                 matchesShortcut(), isTextInputFocused(), SHIFT_MAP, CODE_MAP
      chords.ts                   createChordMatcher() — space-separated key sequences ("g g"); shared by FilesPane and GitDiffPane
      dispatcher.ts               dispatch() — single routing function for all key events; registerDynamicHandler()
      useKeyDispatcher.ts         Single document-level keydown listener; calls setActiveShortcutConfig + dispatch
    lib/
      formatElapsed.ts            formatElapsed(startedAt, now) — "Xh Ym" / "Ym SSs" duration formatting
    pages/
      launcher.tsx        Launcher page — architect list, variant selection on click
      architect-window/
        index.tsx                Thin shell — composes hooks + view components
        SessionTerminal.tsx      Electron wiring for the terminal/ module — builds the transport + theme/keyboard/GPU adapters
        terminal-adapters/       Electron impls of the terminal module interfaces (electronTransport, cssThemeSource, dispatcherRouteKey, gpuCrashSource)
        hooks/                   useArchitectData, useSessionRestore, useSessionEvents,
                                 useDaemonRecovery, usePaletteSessionSwitch, sessionSnapshot
        components/              RightPane, BottomTabs, MainTerminalStack,
                                 ExtraTerminalStack, TicketPane, TicketWorkflow, GitDiffPane,
                                 RepoPicker (git-diff repo selector),
                                 ConcludeSessionDialog, FreeformSessionDialog,
                                 files/ (native files tab — FilesPane, DirTree/DirListing,
                                 useDirTreeData (shared fetch cache + flattened visible-row
                                 list backing vim-style nav), RootPicker, Breadcrumb,
                                 FileViewer + viewer registry: code/markdown/image/binary
                                 (code kind = editable CodeMirror 6 + vim editor —
                                 CodeEditor, cmTheme, editorBuffers dirty-buffer cache);
                                 classify.ts dispatches on Content-Type + extension + UTF-8 probe)
      dashboard/          Dashboard page
      agent-profiles/     Agent Profiles page — index, profile-card, profile-form, schema
    components/
      index.ts            Renderer component barrel exported through @components
      */                  Co-located React components and CSS Modules
      icons/              Component icon exports
      DiffView/            Reusable read-only diff viewer (react-diff-view) — parsed-diff props in, no fetching; used by GitDiffPane and reusable for future commit-diff UIs. Tokenizes syntax highlighting on the main thread, or in a Web Worker (tokenize.worker.ts) above ~1500 changed lines — the renderer's only worker
    terminal/             Transport-agnostic xterm module — no window.hiveryn / store / dispatcher / CSS deps
      TerminalView.tsx    xterm React component; deps (theme, routeKey, gpuCrash) injected; per-pane Cmd+F find box (search addon)
      TerminalSession.tsx Transport lifecycle (connect/reconnect/ESC-c/size-handshake) over an injected TerminalTransport
      types.ts            Injected interfaces: TerminalTransport, TerminalThemeSource, RouteKey, GpuCrashSource, SearchDecorations
      keymap.ts           Pure key mechanics (Shift+Enter→LF, keypress double-fire suppression, Cmd+F find detection)
      overlayFit.ts       FitAddon subclass that reserves zero scrollbar width (full-pane fit; v6 overlay scrollbar floats)
     styles/
       global.css          Renderer global styles imported through @styles/global.css
       reset.css           Shared reset imported by global.css
       prism.css           Prism/refractor token colors mapped to theme tokens — global, colors DiffView (the files-tab editor mirrors the same palette via its own lezer HighlightStyle in viewers/cmTheme.ts)
     plugins/
       registry.ts         Tab icon registry — maps tab type → icon for the 7 native tabs (kanban, event-log, ticket, terminal, git-diff, files, browser)
       types.ts            TabPluginComponent type (icon)
   shared/
     types.ts              Desktop-specific types and @hiveryn/shared/domain re-exports (Envelope, Architect, SystemRuntime…)
```

## IPC and envelope pattern

Every daemon-backed IPC call follows this chain:

1. **Main handler** (`ipc/*.ts`) calls `daemonFetch()`, which always returns `{ envelope, httpStatus }` — never throws.
2. **Preload `invoke()`** receives the result, notifies `daemon.onRequest` listeners (for the request log and the error center — see below), then either returns `envelope.data` or throws an `IpcError` with `{ status, code, details, stacktrace }` from the envelope.
3. **Renderer** catches `IpcError` — field-level errors (status 400/409) are set directly on form fields via `details.field`; most other API errors are left uncaught and surface automatically through the error center (see below), since `useErrorCenterCapture` already saw them via `daemon.onRequest`. A few components (whose error is naturally scoped to and dismissed with the surface — `ConcludeSessionDialog`, `FreeformSessionDialog`, the intent center's `IntentCard`, `TicketWorkflow`) still render the full daemon error inline via the `ApiEnvelopeError` component (`src/renderer/src/components/ApiEnvelopeError/`).

All API responses follow `domain.Envelope` (`data | error`, `logs`, `commands`, `meta.request_id`). The desktop surfaces this in the `RequestLog` panel at the bottom of every page.

## Error center

App errors (daemon/API envelope errors, SSE/WebSocket failures, daemon-unreachable transitions) no longer stick to the screen in a permanent banner. Each is recorded in a per-window, in-memory history; a bottom-right indicator next to the freeform `+` button badges the unread count and opens a bottom sheet with full detail (timestamp, source, message, expandable stacktrace/`request_id`, per-item dismiss, clear all). Mounted in both `ArchitectWindow` and `Launcher` (two independent renderer processes, so each gets its own store instance — scope is naturally per-window and clears on close).

- `state/errorCenterStore.ts` — the durable history (`entries`, `unreadCount`, `sheetOpen`).
- `hooks/useErrorCenterCapture.ts` — the capture bridge, mounted once per window. Subscribes to `daemon.onRequest` (catches every `invoke()` envelope error app-wide — the single tap-in for daemon/API errors) and `errors.onInfraEvent` (main-process SSE/WS failures, pushed one-way from `src/main/daemon/architect-events.ts` and `src/main/daemon/session.ts` via `sender.send('errors:infra-event', payload)`, mirroring the `daemon:health-status` pattern). Daemon-unreachable transitions are pushed from `useDaemonRecovery.ts`, which already tracks that transition for session-restore purposes.
- `components/ErrorCenterIndicator/`, `components/ErrorCenterSheet/` — the badge and bottom sheet, composed into each page's `BottomBar` `right` slot.

## Structured desktop logging

The desktop app writes append-only structured JSONL logs under the resolved runtime home: `$HIVERYN_HOME/logs/` when `HIVERYN_HOME` is set, otherwise `~/.hiveryn/logs/`.

- **Main process** — `desktop.jsonl`: `src/main/logging.ts` patches `console.debug/info/log/warn/error`, captures source location from stack traces, and writes one JSON object per line with `src: "desktop"`.
- **Renderer** — `renderer.jsonl`: `src/renderer/src/logging.ts` patches `console.*`, captures browser-side source location, and forwards a structured payload through `window.hiveryn.logs.writeRenderer(...)` to `logs:renderer` IPC, where the main process appends it with `src: "renderer"`.
- **Schema** — entries use `ts`, `lvl`, `src`, `msg`, `file`, `line`, `fn`, with optional `err`, `ctx`, and `body` fields so they can be consumed alongside daemon JSONL logs.

## Adding a new IPC namespace

1. **`src/main/ipc/<resource>.ts`** — create `register<Resource>Ipc()`. Each handler calls `daemonFetch()` and returns `DaemonResult`. Transform `envelope.data` as needed (e.g. unwrap nested arrays).
2. **`src/main/ipc/index.ts`** — call the new registrar in `registerIpc()`.
3. **`src/preload/index.ts`** — add the new namespace to `contextBridge.exposeInMainWorld`. Add its channels to `CHANNEL_INFO` for the request log display.
4. **`src/preload/index.d.ts`** — extend `HiverynAPI` with the new namespace's types. Domain types are aliased from `@hiveryn/shared/domain` via inline-import globals (`type Session = import('@hiveryn/shared/domain').Session;`) — alias the canonical type, don't re-declare a divergent mirror. Reserve local interfaces for genuinely Electron-boundary shapes.
5. **`src/shared/types.ts`** — add desktop-specific types (envelope wrappers, IPC-only structs). Domain types (Session, Intent, Ticket, …) come from `@hiveryn/shared/domain` — import them from there, not from `src/shared/types`.

## Adding a new page

1. Create `src/renderer/src/pages/<name>/` with at minimum `index.tsx`. Split into `schema.ts`, component files etc. as it grows — keep co-located.
2. Add the page to the `Page` union and `NAV_ITEMS` in `App.tsx`.
3. Add a render branch in the page content area. The `ErrorBoundary` wrapper and `key={page}` reset are already provided.

## Design rules

- Renderer code never imports from `electron`, `node:*`, or `src/main`. Only `window.hiveryn.*`.
- Domain types (Session, Intent, Ticket, SessionTab, …) come from `@hiveryn/shared/domain`. Desktop-specific types (Envelope, DaemonResult, Architect, …) live in `src/shared/types.ts`. Main and preload import from both; renderer imports domain types from `@hiveryn/shared/domain` and gets Electron-boundary types via ambient globals in `preload/index.d.ts`.
- `daemonFetch` never throws. IPC handlers never throw. Only the preload `invoke()` throws, so renderer error handling is uniform.
- Field-level validation errors use `IpcError.details.field` — no message parsing.
- Shared renderer components live in `src/renderer/src/components/` and are imported through the `@components` alias. This relocated component source and its styles are excluded from desktop Biome formatting to preserve the imported component code as-is. Page-specific components live next to their page's `index.tsx`.
- The local sibling package `@hiveryn/shared` is consumed via `link:../shared` (a live symlink in `node_modules`), so every resolution path — `tsc` typecheck and the electron-vite main/preload/renderer bundles — sees the source directly and edits are picked up without a reinstall. It was previously `file:../shared`, which pnpm's `node-linker=hoisted` (`.npmrc`) copies into `node_modules` as a stale snapshot that silently lags source changes (and which `pnpm install`/`--force`/`update` would not reliably refresh). The `electron.vite.config.ts` alias to `../shared/domain/index.ts` remains as belt-and-suspenders for renderer hot-reload.
- Render/lifecycle crashes are contained per-pane by `ErrorBoundary` (`src/renderer/src/components/ErrorBoundary/ErrorBoundary.tsx`): each right-pane tab (`RightPane.tsx`) and each terminal (`MainTerminalStack.tsx`) is wrapped individually, plus an outer boundary around `RightPane` itself. A caught error shows a Retry fallback scoped to that pane and is pushed to the error center; boundaries accept `resetKeys` (e.g. session id) so navigating past the bad state — a session switch, a directory change — auto-clears a stuck crash. Error boundaries only catch render/lifecycle throws, not async/event-handler errors. There is still no boundary above shared app chrome (`Navigation`, `BottomBar`) or at the page level in `App.tsx` — a throw there still takes down the window.
- Keep `src/main/index.ts` as thin Electron setup only — no business logic, no inline IPC handlers.

## CSS/UI policy

CSS and shared UI component work lives in `src/renderer/src/components/` and `src/renderer/src/styles/`. Keep component behavior and CSS Modules co-located, and route shared component imports through `@components`.

### Global UI scale (`--ui-scale`)

`styles/global.css` defines `--ui-scale` (currently `1.1`) as the single source of truth for the overall UI scale — it drives `:root { font-size }`, so every `em`/`ch`/`rem` measurement and the px tokens that multiply by it (`--appbar-height`, etc.) scale from one number. Set it to `1` to restore the pre-scale appearance exactly. **1px/2px hairline borders are intentionally left literal** so they stay crisp (the reason scale is baked into tokens instead of an Electron zoom factor). Two things don't follow the knob and must be kept in sync by hand:

- **Main-process DIP values** can't read CSS vars: `trafficLightPosition` in `src/main/index.ts` (derived from `--appbar-height`) and the tray dimensions in `src/main/tray.ts`. Update them together with `--ui-scale`; both files reference the knob in comments.
- **The xterm terminal** is a canvas, not CSS — its font comes from the `--font-size-terminal` token read in JS via `cssThemeSource.readFontSize()` (`TerminalThemeSource`). It is deliberately **decoupled** from `--ui-scale` (fixed `14px`) so the terminal grid stays dense while the chrome scales.

## Multi-session & multi-terminal architecture

The `sessionManager` (`src/main/daemon/session.ts`) supports **multiple concurrent sessions per webContents** — keyed by `wcId → sessionId → ActiveSession`. Each session can have **multiple UUID-addressed terminals**, each with its own WebSocket connection. The daemon-owned tab layout from `GET /api/sessions/{id}/tabs` is the source of truth for all non-main right-pane tabs.

### Terminal data routing

- **`session:data` IPC events** carry `{ sessionId: string; terminalId: string; data: Uint8Array | string }` so the renderer can route PTY output to the correct terminal.
- **`session:terminal-closed` IPC events** carry `{ sessionId: string; terminalId: string }` — fired when a terminal's WebSocket closes server-side (e.g. user ran `exit`). `SessionTerminal` subscribes via `onTerminalClosed` and calls `onDisconnected` in response.
- **`session:event` IPC events** include `session_id` in the payload — session-level lifecycle events from the daemon's SSE stream.
- **`session.send(sessionId, terminalId, data)`** and **`session.resize(sessionId, terminalId, cols, rows)`** take explicit identifiers — there is no global "active terminal" concept in the main process. Each `SessionTerminal` knows its own `(sessionId, terminalId)` and routes accordingly.

### Terminal lifecycle

Terminal WebSockets survive component mount/unmount cycles. `SessionTerminal` connects on mount, opening the terminal WebSocket; the SSE event stream is session-level and shared across all terminals for that session. The WebSocket stays alive in the main process across renders.

`session.subscribe(sessionId)` starts the SSE stream independently of any terminal WebSocket — used by `useSessionRestore` to begin receiving events as soon as sessions are restored, before `SessionTerminal` mounts. Calling `connect()` for a session that `subscribe()` already opened is safe: `startSse` is a no-op when SSE is already running.

Main terminal disconnect is not session lifecycle. If the main terminal WebSocket closes because the daemon respawned the agent, keep the session registered, keep session SSE active, update `mainTerminalId` from the daemon's `main_terminal_resumed` event or refreshed session list, and let `MainTerminalStack` reconnect by remounting the terminal keyed by the new UUID.

Duplicate `connect()` calls for the same terminal (e.g. from React StrictMode) are deduplicated via `pendingConnects` map keyed by `wcId:sessionId:terminalId`.

Terminal DOM persistence: `TerminalView` (the xterm component in the `terminal/` module, rendered via `SessionTerminal`) instances are mounted **once per (session, terminal)** in `MainTerminalStack` / `ExtraTerminalStack` and stay mounted as long as the session exists — this includes every split (all splits render, not just the one for the current base tab) so switching tabs never unmounts/remounts an xterm (a remount forces a reconnect + replay that flashes black).

How a pane is hidden matters, because xterm's core runs an `IntersectionObserver` that **pauses the renderer** and a `display:none` element fires **no** `ResizeObserver` events — so a `display:none` pane both stops rendering and misses size changes, then resumes against **stale geometry** and corrupts on switch-back. So:

- **Active-session right-pane terminals (primary tabs and splits) are hidden with `visibility:hidden` in stable layout slots, never `display:none`.** `.extraSlot` is `position:absolute; inset:0` (stacked in a `position:relative` container), and the split secondary stays laid out at half-size always (`visibility`-toggled — see `.rightPaneSplitSecondary`). A `visibility:hidden` pane keeps a real box, so xterm never pauses it and the `ResizeObserver` keeps it fitted; switching is a pure visibility flip with nothing stale.
- **Mains and background sessions stay on `display:none`** (one main per session; only switched on session change, which is infrequent), so they pause and don't render in the background.

The WebGL renderer (crisp glyphs; the DOM renderer leaves seams in box-drawing borders) is driven by the **layout box, not the `visible` prop**: attach when the container has a real box, dispose when it collapses to 0×0 (`display:none`) — both via the `ResizeObserver`. A `visibility:hidden` pane keeps its box, so its context **persists across tab switches** (no recreate, which previously raced Chromium's async context GC and resumed against stale geometry). A `display:none` pane frees its context, keeping live contexts under the browser's ~16-context cap — past which Chromium force-loses the oldest (the main left pane) to black. The box-driven re-attach on switch-back runs after layout, so the new renderer always reads a valid cell size. A module-scope counter (`liveWebglContexts` in `TerminalView.tsx`) tracks the live count against that cap and logs it on every attach/dispose.

GPU-process-crash recovery (when Chromium's GPU process dies, `exit_code=5`, destroying every WebGL context): the **primary** trigger is each context's own `addon.onContextLoss`, which fires the instant the context dies, drops to the DOM renderer, and drives a **retry-with-backoff re-attach** (`scheduleWebglReattach`, ~250ms→1250ms linear backoff, ~3.75s total) until a live context returns — fixing the prior single-shot recovery that left a still-visible pane (whose box never changes, so the `ResizeObserver` never re-fires) corrupted until a manual window close/reopen. `src/main/index.ts`'s `child-process-gone` broadcast (`app:gpu-process-crashed`) is the **backup** trigger, covering panes that never held a context (canvas-2D blanking). The whole path — main crash/broadcast, and per-pane context-loss / re-attach attempts / recovery — is logged to the JSONL sinks (each renderer log carries an opaque `logLabel` per pane) so a future occurrence is fully traceable.

Resize-while-scrolled-up: `fitAddon.fit()` → `term.resize()` reflows the whole scrollback (`Buffer.resize`), but the renderer only repaints the live viewport, so when the buffer is scrolled up the displayed rows keep their pre-resize wrapping until something marks them dirty (e.g. maximizing a pane mid-scrollback left stale rows). The `ResizeObserver` forces `term.refresh(0, rows-1)` when a fit changed dimensions **and** the buffer is scrolled up (`viewportY < baseY`); bottom-anchored fits and drag-resizes skip it since the renderer already paints the bottom correctly.

### Layout

| Pane | Content |
|---|---|
| **Left pane** | `MainTerminalStack` — every session's main terminal mounted as a sibling; visibility picked by `activeSessionId`. Shows a "No active session / Return to Launcher" fallback when no session is registered. |
| **Right pane** | Daemon-provided tabs from `tabs:list`: Kanban, Activity log, and `ExtraTerminalStack` terminal tabs. Tab visibility picked by `activeRightTab`. |
| **Bottom bar** | `BottomTabs` — one tab per session in the store (architect first, then ticket/freeform sessions). Active tab driven by `activeSessionId`. Each tab's icon reflects the session's live agent status (`active`/`idle`/`waiting`/`stopped`) via `iconForStatus`, distinct from the pending-intent notify dot. Each tab carries a conclude (×) button that opens the type-aware `ConcludeSessionDialog`. |

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
| `tabs:createBrowserTab` | POST | `/api/sessions/:id/browser-tabs` |
| `tabs:closeBrowserTab` | DELETE | `/api/sessions/:id/browser-tabs/:tabId` |

## Native tab registry

There are exactly 7 tab types (`SessionTab.type`): kanban, event-log, ticket, terminal, git-diff, files, browser. All render directly in `RightPane` via hardcoded panels — none go through a generic content lookup. `src/renderer/src/plugins/registry.ts` holds a small `type → icon` map (`getTabPlugin(type)`) with two live consumers: **`RightPane.mapTabToBarTab`** looks up the icon component for the `TabBar` (unknown types return `null`, filtered out of the tab bar), and `keys/dispatcher.ts`'s `getRightTabIds()` uses the same lookup to validate which tab IDs are cyclable via keyboard (Cmd+2..9, focus-left/right/up/down) — both are just existence checks against the fixed set of known types.

**Tab identity.** `terminal` and `browser` are the two **multi-instance** tab types — each carries a daemon-assigned UUID `id` and is keyed by it (`tabIdOf`, `state/tabFocus.ts`); every other type is single-instance and keyed by its `type` string. `tabFocus.ts` is also the single source of truth for the tab-id → `focusedPane` mapping (`focusIdForTab(tabId, tabs)`), consumed by the store's `normalizeSelection`, `RightPane`, and `keys/dispatcher.ts` — previously three drifted copies. The "+" button on the right pane opens a small Terminal/Browser picker (`components/TabTypePicker/`, portal + backdrop + ↑/↓/Enter/Esc, modeled on `ProfileSelector`) rather than unconditionally spawning a terminal.

`git-diff` is rendered via a hardcoded panel like `ticket`/`TicketPane`. `GitDiffPane` (`pages/architect-window/components/GitDiffPane.tsx`) reads the session's repository scope from `useSessionRepoScope` (`state/sessionRepoScope.ts`) — the single per-session source shared with `FilesPane`, which pairs the ticket's primary repo key with the immutable session-snapshot workdirs plus the daemon's positionally-aligned `additional_repos`/`additional_workdirs` (missing/misaligned scope surfaces as a visible error, never a silent workspace fallback). A header `RepoPicker` dropdown (always shown, primary marked) selects among every scoped repo, defaulting to the primary; diffs stay strictly per-repo. It calls `repos:diff` (`src/main/ipc/repos.ts` → `GET /api/architects/{key}/repos/{repoKey}/diff`) for the selected repo, and refetches on tab activation, manual refresh, and a debounced watch of `useEventsForActiveSession()` for file-mutating tool events (`Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`ApplyPatch`); a failed refetch keeps stale data visible under an inline error banner with Retry (initial-load failures get a full-pane error + Retry). It renders the diff through the reusable `DiffView` component (`components/DiffView/`), which takes parsed-diff-shaped props with no fetching of its own. The left file list is an explorer-style tree built by `gitDiffTree.ts` (pure split-paths → nested-nodes transform over the in-hand file set — unlike the explorer's fetch-driven tree; single-child directory chains compress into one row, GitHub-style, keyed by full path prefix), rendered as `EntryRow`-look rows with a colored single-letter status marker (`M`/`A`/`D`/`R`/`C`/`?` via `data-status`) and staged/unstaged dots derived per-file from which `sections[].kind` exist (staged/unstaged is per-section — one file can show both). Keyboard navigation mirrors the files explorer (same bindings, `git-diff` config namespace): `j/k` moves a cursor over the flattened visible rows, and — unlike the explorer's cursor-then-`o` model — landing on a *file* row immediately shows its diff (`selectedPath`); on a directory row the diff keeps showing the last file. `o`/`Enter` opens a file / toggles a dir, `l`/`h` expand/collapse (`h` from a file jumps to its parent row), `g g`/`Shift+G`, `{`/`}` jump 6 rows, `Shift+J`/`Shift+K` half-page-scroll the diff, `r` refetches, `b` collapses the file list (state in `paneLayoutStore`, shared pattern with FilesPane). `/` opens an in-memory case-insensitive substring filter over changed-file paths (no daemon call, unlike the explorer's `/`); match rows replace the tree, `Tab` toggles input ↔ list, opening a match re-expands its collapsed ancestors, `Esc` closes. All of it is registered inside `GitDiffPane` via `registerDynamicHandler`, gated on `focusedPane === 'right-git-diff'` — see [Keyboard shortcuts and focus model](#keyboard-shortcuts-and-focus-model). The cursor re-clamps when its row disappears (collapse, refetch reshuffle, session switch) — rows derive synchronously from `data`, so there's no in-flight settling to wait out; list state (cursor, collapse set, filter, selection) plus the loaded diff reset on session change **and** on repo switch, so switching repositories never carries one repo's diff into another.

`files` is the other tab with non-trivial behavior: a file explorer with an in-app editor over the daemon's global `GET /api/fs/tree` + `GET /api/fs/file` (read) + `PUT /api/fs/file` (save) endpoints. `FilesPane` (`pages/architect-window/components/files/`) self-measures with a ResizeObserver — two-pane lazy tree + viewer when wide, drill-down single pane when narrow — and keeps per-session state (picker root, current dir, open file, expanded dirs) in `state/filesStore.ts` so tab/session switches don't reset. The root picker offers the architect workspace (`architect.path`), each repo (plus any scoped repo the architect config has since dropped, sourced from the snapshot), and Electron-dialog custom paths (`fs:pickDirectory`); the first-load default root is the primary repo for ticket sessions (opened on the immutable session-snapshot workdir) and the architect workspace otherwise. Both the default and the picker come from `useSessionRepoScope` (`state/sessionRepoScope.ts`) — the single per-session repo-scope source shared with `GitDiffPane`, so the two panes can't derive conflicting defaults. `FilesPane` waits out the scope's `loading` state rather than racing it (the default-root effect fires once per session), and renders a visible error for an `error` scope instead of silently falling back to the workspace root. Viewers dispatch by classified kind via `viewerRegistry.ts` (`Map<kind, component>`): an editable CodeMirror 6 + `@replit/codemirror-vim` editor (`viewers/CodeEditor.tsx`; language loaded on demand from `@codemirror/language-data`, theme/syntax mapped to the app's tokens in `viewers/cmTheme.ts` to match DiffView), markdown (react-markdown + remark-gfm with frontmatter strip, mermaid diagrams via lazily-imported `mermaid`, relative links/images resolved through the daemon, fragment links scroll-to-heading — never `location.hash`, which the app routes on; its "source" toggle embeds the same CodeEditor, so markdown is editable too), images/svg via blob URLs (CSP allows `img-src blob: https:`), and a binary/undecodable fallback. Editing model: `EditorState`s outlive React mounts in a per-absolute-path `editorBuffers.ts` cache so unsaved edits, undo history, and cursor survive navigating away and back (dirty buffers never evicted); save is `:w`/`:wq` or `Cmd-S`, `FileViewer` shows a dirty dot, and the editor is read-only for truncated (>2 MiB) reads. Because the daemon endpoint is overwrite-only with no staleness precondition, saving a file the daemon reports changed on disk raises a non-destructive conflict banner (Reload from disk / Keep my edits) rather than silently clobbering; there is no new-file creation path. Enable it by adding `- type: files` to a session type in `~/.hiveryn/tabs.yaml` — no daemon changes. Vim-style keyboard navigation (`j/k` cursor, `o`/`Enter` open — files open in the viewer, dirs toggle (wide) or drill in (narrow), `l`/`h` expand/collapse directories only — narrow-mode `h` closes the open file first and never walks above the picker root, `g g`/`Shift+G` jump to first/last row, `{`/`}` jump 6 rows, `Shift+J`/`Shift+K` half-page viewer scroll, `i` focuses the open file's editor (markdown flips to source view first), `r` reloads the tree/listing — same as the Refresh button, `b` toggles the sidebar — same as the header collapse button, wide mode only, state in `paneLayoutStore`) is registered inside `FilesPane` itself via `registerDynamicHandler`, gated on `focusedPane === 'right-files'`. `Cmd-S` saves the open file's editor from either the tree or the editor; `Escape` in the editor's vim-normal mode blurs back to the tree (the `isTextInputFocused()` passthrough seam lets the editor own keys while focused). `/` opens a filename search over the daemon's `GET /api/fs/search` (git-aware: `git ls-files` for roots inside a work tree — including nested repos under a plain workspace root — so gitignored files never appear; ranked case-insensitive subsequence matching, capped at 100 results): `useFileSearch` debounces 120ms with a stale-response sequence guard and results replace the tree (wide) / whole listing (narrow). `Tab` toggles focus between the search input and the result list — from the input, `↑/↓`+`Enter` work; Tab'd out, the same vim keys (j/k, gg/G, {/}, o/Enter) drive the result selection. Opening a result reveals it in the tree (ancestors expanded via `filesStore.expandDirs`, cursor on the file — the cursor re-clamp deliberately waits out in-flight listings so it can't steal the cursor before the row exists); `Esc` closes — see [Keyboard shortcuts and focus model](#keyboard-shortcuts-and-focus-model). A `cursorPath` field in `filesStore` tracks the keyboard cursor row independently of the opened file; `useDirTreeData` is the single shared fetch cache that both `DirTree`'s flat rendering and the keyboard handler's `j`/`k` traversal read from (directory listings persist across collapse/re-expand — collapsing does not evict the cache; fetch bookkeeping lives in refs with a generation counter — root change/refresh bumps the generation and is the only thing that invalidates an in-flight `listDir`, so results always land and nodes can't get stuck "Loading…"; failed nodes render an inline Retry).

`browser` is a real in-app browser tab — a native Electron **`WebContentsView`** overlay (the app's first embedded web content), driven by `BrowserPane` (`pages/architect-window/components/BrowserPane.tsx`): a URL bar with back/forward/reload/close and an empty anchor `<div>` the native view is bounds-synced over. The view lives in the main process (`src/main/browserView.ts`, one per tab id, keyed globally so back/forward history survives tab/session switches), in an isolated non-persisted `partition` with `sandbox`/`webSecurity` on. It carries its **own** escape hatches so the host-window SPA lockdown (`main/index.ts`) stays intact: its `setWindowOpenHandler` denies the popup and asks the renderer to mint a daemon-tracked sibling tab (`openInNewTab`), and its `will-navigate` allows page-initiated http/https but blocks navigation **into** `file://` (the URL bar is the only file:// entry, via programmatic `loadURL`, which does not fire `will-navigate`). Because a native view ignores CSS and paints above all DOM, `BrowserPane` bounds-syncs the view to the anchor rect (`ResizeObserver` + window-resize + a maximize re-measure + a 250 ms safety-net interval) via a fire-and-forget `browser:bounds` channel, and **detects occlusion generically** with `document.elementFromPoint` at the anchor centre — if the topmost DOM element there is not the anchor (a dialog/backdrop, or a maximized sibling pane), it detaches the view so there is no ghost overlay; tab-switch/session-switch unmount the pane and detach too. All tab-state mutations route through the daemon (single source of truth): URL-bar/link navigation writes the committed URL back via `POST /api/sessions/{id}/browser-tabs` (existing tab id), open-in-new-tab and the "+" picker POST with an empty tab id, close is `DELETE .../{tabID}`; a self-initiated navigation does not reload the view because main's `ensure()` only `loadURL`s when the committed URL differs from the incoming target (echo suppression). The daemon publishes a `tab_changed` session event (`type=status`) on every browser-tab mutation; `useSessionEvents` refetches the tab list and auto-activates any browser tab that newly appeared (agent `previewInBrowserTab` or a sibling). New tabs open at `https://www.google.com` with the URL bar auto-focused (the daemon requires a non-empty valid target: `file://`, absolute path, `http://localhost:*`, or `https://`).

## Architect session lifecycle

Architect sessions run in the daemon and survive component mount/unmount cycles in the renderer. Component lifecycle is NOT session lifecycle.

- **Spawn**: the launcher creates a session via `sessions.create('architect', key)` then spawns a run via `sessions.createRun(session.id, profileName)`, then opens the architect window. The architect window does not spawn — it only restores.
- **Restore**: on mount, `useSessionRestore` calls `sessions.list()` + `tabs.list(id)` for every running session that matches the architect key, using `current_run.main_terminal_id` for the left-pane terminal and daemon tabs for the right pane.
- **Recovery**: `useDaemonRecovery` subscribes to `daemon:health-status` events from the main-process health poller. On `unreachable → healthy` transitions, it re-fetches the full daemon session snapshot and reconciles the store via `store.reconcileSessions()`, which handles changed terminal UUIDs, removed sessions, and stale tab/focus selection.
- **`sessions:list`** returns `Session[]`. A session is running when `session.current_run?.status === 'running'`; main-terminal reconnects use `current_run.main_terminal_id`.
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

When a session ends (architect or worker), the daemon sends a daemon-authored `status: ended` SSE event with `raw.lifecycle === 'concluded'` (normal conclusion) or `raw.lifecycle === 'discarded'` (ticket moved back to backlog — see below). Raw agent `ended` events are not session lifecycle. `useSessionEvents` treats either lifecycle as a final end and immediately performs client-side cleanup with no dialog or countdown:

1. `session.disconnect(sessionId)` — cleans up client-side WebSocket/SSE
2. `store.unregisterSession(sessionId)` — removes the session from the Zustand store
3. **Architect session**: calls `architect.closeWindow()` — closes the entire architect window
4. **Ticket/freeform session**: switches the active session back to the architect (or `null` if none remain) and resets the right pane to `kanban` or `event-log`

### Discard ticket session (move back to backlog)

A ticket session can be discarded as if it was never spawned — distinct from concluding/rejecting (no conclusion is written, no run record is kept). The ticket `ConcludeSessionDialog` (the type-aware dialog opened from a tab's conclude × button) shows a destructive **MOVE TO BACKLOG** button alongside REJECT. It opens a confirmation step (irreversible; discards the session's output; does **not** revert any git commits the agent already made), then calls `sessions:discard` IPC → `POST /api/sessions/{id}/discard` (no body). The daemon resets the ticket `progress → backlog`, deletes the run/session rows, and emits the `raw.lifecycle === 'discarded'` ended event — which drives the cleanup above to remove the tab. The dialog itself only closes; it never optimistically unregisters. A late call after the daemon resolved returns HTTP 404, treated as already-resolved.

## Intent approval flow

An **intent** is a pending agent tool call the daemon gates on the user — today `concludeSession` and `createWorkTicket`, but the desktop is deliberately tool-agnostic so any future intent renders with no change. When an agent calls such a tool via MCP, the daemon blocks the call and publishes a generic `{ type: "intent", status: "required", raw: { intent_id, intent_type, summary, origin, wait_seconds, policy, payload? } }` SSE event on that session's stream; `origin` is `{ architect_key, session_id, session_type, ticket_id? }`. The desktop handles it as follows:

1. **`useSessionEvents`** detects `type === 'intent' && status === 'required'`, rebuilds a shared `Intent` from `raw` via `parseIntentRequired` (throws on a missing/malformed `intent_id`, `intent_type`, `wait_seconds`, `policy`, or `origin`; `payload` is optional), and calls `store.setPendingIntent(intent)` — keyed by `intent_id`, so one session can have several open at once. It also handles the durable counterpart `status === 'resolved'` by calling `store.clearPendingIntent(raw.intent_id)` — emitted by the daemon on every resolution (approved / auto-approved / denied / auto-denied / error / daemon-restart orphan). Pairing is by `intent_id`, never session id. Since the SSE backlog replays in order on every (re)connect, a `required` followed by a `resolved` nets to "no card", so a stale intent never resurfaces as an unactionable popup.
2. **`BottomTabs`** badges a session's tab (needs-attention dot) when it has any pending intent and is **not** the active session — computed over `pendingIntents` by `origin.session_id`.
3. **`ArchitectWindow`** mounts one window-level `<IntentCenter>` (a `createPortal`-to-`<body>` fixed top-right stack, sibling of `<ErrorCenterSheet>`), so it renders every session's intents in this architect window, not just the active one's.
4. **`IntentCenter`/`IntentCard`** renders each intent (newest on top) with its origin label, `summary` headline, a tool-agnostic `payload` preview (strings as text, commit-shaped arrays as sha chips, string arrays as a comma list, else compact JSON), and a cosmetic countdown seeded from `wait_seconds` labeled by `policy` ("auto-approve Ns" / "auto-deny Ns"). The countdown is **cosmetic** — the daemon's auto-resolve is authoritative, so at zero the card shows "resolving…" and waits for the `resolved` event rather than acting locally. **Approve** calls `sessions:approve-intent` IPC → `POST /api/sessions/{id}/intents/{intentId}/approve` (empty body; the daemon runs the tool's side effect only on approval and returns the result to the blocked agent). An always-visible optional reason field beside **Deny** calls `sessions:deny-intent` IPC → `POST /api/sessions/{id}/intents/{intentId}/deny` with `{ reason }` (204). A late approve/deny after the daemon resolved returns HTTP 404, treated as already-resolved.
5. On success (or 404), the card clears via `clearPendingIntent(intent_id)`; the `resolved` SSE event clears it across all clients regardless.

## Agent status tab icon

Separate from the intent flow, the daemon emits a `{ type: "agent_status", status: "active" | "idle" | "waiting" | "stopped" }` SSE event whenever a session's mapped agent status transitions (emit-on-change only). `useSessionEvents` handles `type === 'agent_status'` by calling `store.setSessionStatus(sessionId, status)` (throws if `status` is absent); `BottomTabs` maps `SessionRecord.status` to a glyph via `iconForStatus` (`active`→`Activity`, `idle`→`AgentIdle`, `waiting`→`AgentWaiting`, `stopped`→`AgentStopped` dimmed, fallback `Terminal`). Initial status is seeded from `current_run.agent_status` in `buildSessionRecord` on window restore, and the persisted event replays in the connect backlog so a fresh stream renders the right icon immediately. `waiting` stays visually distinct from the pending-intent notify dot — they are never merged.

## Keyboard shortcuts and focus model

Keybindings are owned by the daemon (`GET /api/config/shortcuts`). The desktop has **no hardcoded fallbacks for required sections** — if the response is missing a required section (`global`/`kanban`/`event-log`), shortcuts are disabled entirely and the error is pushed directly to the error center (see above); a malformed-but-200 response never reaches `daemon.onRequest`, so `useShortcutConfig` pushes it itself rather than relying on the capture bridge. `files` and `git-diff` are deliberately **not** required sections (the daemon repo may not ship them yet), so `FilesPane` and `GitDiffPane` fall back to hardcoded per-binding defaults (identical for both panes: `j`/`k`/`l`/`h`, `o` (open — `Enter` always works too), `shift+j`/`shift+k`, `r`, `g g` (top) / `shift+g` (bottom), `shift+[`/`shift+]` (jump-up/jump-down), `/` (search), `b` (toggle-sidebar); `FilesPane` additionally defaults `i` (edit) and `cmd+s` (save)) when `cfg.files`/`cfg['git-diff']` is absent — they still go fully dark, like every other pane, when `shortcutConfig` itself is `null`.

### Dispatch architecture

All keyboard routing flows through a single `dispatch(event)` function in `keys/dispatcher.ts`. It returns `'consumed' | 'passthrough'`.

There are two callers:

1. **`TerminalView.attachCustomKeyEventHandler`** — called by xterm itself before its own `_keyDown`/`_keyPress` processing. When the terminal has DOM focus, this is the gate. Returning `false` suppresses xterm's emit so the keystroke never reaches the PTY. Returning `true` passes through. xterm-level concerns (Shift+Enter → `\n`, double-fire suppression, Cmd+F opening the in-terminal find box) are handled in `terminal/keymap.ts`; app shortcuts go through the injected `routeKey` (wired to `dispatch` by `terminal-adapters/dispatcherRouteKey.ts`), which keeps the `terminal/` module off the `keys/dispatcher` import. Cmd+F is checked after `routeKey`, so a daemon-bound shortcut would win; because this handler only fires for the terminal that owns DOM focus, the find box is inherently scoped to the focused pane.

2. **`useKeyDispatcher`** — a single bubble-phase `keydown` listener on `document`. Skips events whose target is `.xterm-helper-textarea` (those come via path 1). Calls `dispatch(event)`, and if `'consumed'`, calls `preventDefault()`/`stopPropagation()`.

The dispatcher runs handlers in two stages:
- **Dynamic handlers** (LIFO stack, registered via `registerDynamicHandler`) — for modal/pane-local shortcuts that need component state (kanban cursor, dialog-open flag). Components register via `useEffect` and get an unregister cleanup.
- **Global shortcuts** — focus-left/right/up/down, focus-main, first/prev/next-session, close-tab, new-terminal, maximize-pane (Cmd+M), direct tab jumps (Cmd+2..9).

`matchesShortcut(event, binding)` in `keys/matchers.ts` understands modifier strings (`Cmd+Shift+x`), shift-character mapping (`Shift+[` → `{`), and `event.code` fallback for layout-independent punctuation/digit matching.

- **Pane-local shortcuts** (kanban `h/l/j/k/o/s/r`, event-log `j/k/o/c`) use `registerDynamicHandler` inside `RightPane`, gated on `focusedPane`. `isTextInputFocused()` guards them so modal inputs are never stolen.
- **Files pane shortcuts** (`j/k` cursor, `o`/`Enter` open, `l`/`h` expand/collapse dirs, `g g`/`shift+g` first/last row, `{`/`}` jump 6 rows, `shift+j`/`shift+k` viewer half-page scroll, `i` focus editor, `cmd+s` save, `r` refresh, `b` sidebar toggle, `/` filename search with `Tab` toggling input ↔ list navigation) use `registerDynamicHandler` inside `FilesPane` (not `RightPane` — it owns the tree/listing state the handler needs), gated on `focusedPane === 'right-files'`. Chord bindings are space-separated combos (`g g`): the pending prefix expires after 1s and any non-continuing key clears it and is handled normally. See [Native tab registry](#native-tab-registry) for the cursor/cache model.
- **`quit`** (`q`) uses `registerDynamicHandler` inside `TicketWorkflow`, active only while a dialog is open.
- The command palette is **not** a renderer shortcut — it's an OS-global window summoned by `⌥Space` (registered in the main process via `globalShortcut`), reusing the tray popover window. See [Menu bar tray & global palette](#menu-bar-tray--global-palette).

### Focus model

`sessionStore.focusedPane` is the single source of truth for keyboard focus: `'main-terminal' | 'right-kanban' | 'right-event-log' | 'right-ticket' | 'right-git-diff' | 'right-files' | 'right-terminal:{uuid}' | 'right-browser:{uuid}'`. It is updated by:
- Clicks on pane wrappers
- Navigation shortcut actions inside the dispatcher
- `TerminalView.onTextAreaFocus` callback — fires when xterm's helper textarea receives DOM focus by any means (keyboard shortcut transition or mouse click); forwarded through `TerminalSession` to `SessionTerminal`, which calls `setFocusedPane` to keep app state in sync with DOM reality (the store write is app policy and stays out of the `terminal/` module).

`TerminalView` accepts a `focused` prop that drives `term.focus()` / `term.blur()`. `MainTerminalStack` / `ExtraTerminalStack` compute `focused` per-terminal from `focusedPane` and pass `paneId` so each terminal knows which pane ID to claim on focus.

The visual focus indicator is a 2px accent strip drawn via a `::after` pseudo-element along the top edge of the focused pane (`z-index: var(--z-index-pane-focus)`, `pointer-events: none`), so it sits **above** xterm's canvas but **below** modals. The color is `--theme-focused-foreground` (defined in `styles/global.css`, dark theme only). The unfocused pane fades to `opacity: 0.7` for additional contrast.

`sessionStore.maximizedPane` mirrors the same value space as `focusedPane` (or `null` for normal layout). It is scoped per architect session: the source of truth is `maximizedPanes` (keyed by session ID), and `maximizedPane` is the derived value for the active session — restored on session switch so maximize state never leaks across sessions. Cmd+M toggles it via the `maximize-pane` global shortcut: the focused pane floats as a `position: fixed` 95vw × 85vh card above a full-viewport backdrop (`--z-index-maximize-backdrop: 20`, pane at `21`). Global overlays portaled to `<body>` (dialogs, profile selector, ticket detail) use `--z-index-page-modals: 30`, which sits **above** the maximize layer so they stay reachable while a pane is maximized. Cmd+M again or clicking the backdrop clears it — Escape is intentionally NOT a dismiss key, so a maximized terminal forwards Escape to xterm (TUIs/vim/agent prompts depend on it). On macOS, Electron's default Window menu is replaced at startup to remove the native "Minimize" entry (Cmd+M) so the renderer can claim the key unobstructed.

## Menu bar tray & global palette

A persistent macOS menu bar icon (`src/main/tray.ts`, created in `app.whenReady` via `createTray()`) opens a command-palette-style popover listing every architect and its sessions. The **same window** is also the global command palette: an OS-global shortcut (default `⌥Space`) summons it centered on the active display. There is no in-app palette overlay — this window is the only palette. The tray is per-process, so a concurrently-running dev build shows a second icon — the dev tray adds a `dev` marker to the title + a `Hiveryn Dev` tooltip (gated on `IS_DESKTOP_DEVELOPMENT`) to disambiguate.

- **Title agent counts** — the tray title shows live fleet state next to the icon: `<active>` sessions working and `!<n>` needing attention (e.g. `3 !1`; `3` when none wait; `!2` when none work; icon-only when nothing runs — zeros are never rendered, each part drops independently). A main-process poll (`STATUS_POLL_INTERVAL_MS`, mirroring `daemon/health.ts`) hits `GET /api/architects/status` and tallies both architect and worker sessions via the daemon's `AgentStatus` (`active` → working; `idle`/`waiting` → attention; `stopped` excluded and never listed anyway). The dev marker folds into the same title (` dev 3 !1`). Poll is torn down in `will-quit` (`stopTrayStatusPoll`); it tolerates an unreachable daemon (keeps the last title) but throws on a malformed 200.

- **Window** — a frameless, transparent, `alwaysOnTop` `BrowserWindow` loading the `#/tray` route. On macOS it's an `NSPanel` (`type: 'panel'`, `setVisibleOnAllWorkspaces`) so it takes key focus for the search input without activating the rest of the app, and shows over fullscreen. Created hidden at startup for instant first open; hidden on `blur`/Escape/selection. Two triggers reposition the one window each open: a **tray click** clamps it under the icon (`positionWindow`); `⌥Space` (`togglePalette`) centers it on the display under the cursor (`positionCentered`, multi-display aware).
- **Global shortcut** — `src/main/globalShortcut.ts` registers the binding via Electron `globalShortcut` in `app.whenReady` (unregistered on `will-quit`). The binding is read from the `os-global.palette` key of `~/.hiveryn/shortcuts.yaml` (via `/api/config/shortcuts`), defaulting to `Option+Space`; `toAccelerator()` converts the config string to Electron's accelerator format. `loadAndRegisterGlobalShortcut()` is **idempotent**: it tracks the accelerator it currently holds and is a no-op when that accelerator is still `isRegistered()`, only unregistering+re-registering when the binding actually changes. Success is judged by `isRegistered()`, never `register()`'s return value, so overlapping calls don't false-positive. Registration can genuinely fail when the combo is already taken — since there's no in-app fallback, failure surfaces an Electron `Notification` (at most once per distinct failing binding) pointing the user at the config key. The OS-global binding is owned by the main process and applied once at `ready`; the renderer's `useShortcutConfig` hook handles in-app shortcuts only and does not re-register the OS-global binding.
- **Surface** — `components/TrayPalette/TrayPalette.tsx` reuses `components/palette/palette.module.css` and the shared row logic in `components/palette/rows.ts` (`buildRows`/`rowKey`/`isArchitectActive`). It mounts the existing `ProfileSelector` for spawning.
- **Actions** — a **session row** or **active architect** calls `palette:focus-architect` (focus-or-create the target `BrowserWindow`, then `palette:switch-session` to land on the chosen session — or the architect's own session when `null` — handled by `usePaletteSessionSwitch`, which retries `setActiveSession` until the target session appears in a freshly created window's store). Because the palette is a non-activating `NSPanel`, focusing/creating the target routes through `raiseWindow()` (existing-window branch in `createArchitectWindow`, new-window `ready-to-show` in `configureWindow`), which calls `app.focus({ steal: true })` on macOS first — `window.focus()` alone won't front a window when another app is active. An **inactive architect** an **inactive architect** opens `ProfileSelector`, then runs the launcher spawn flow (`sessions.create('architect', key)` → `sessions.createRun` → `launcher.openArchitect`).
- **IPC** — `tray:hide` dismisses the popover; `tray:set-height` lets the renderer report measured content height so the window fits (capped, then the body scrolls). A main→renderer `tray:shown` event refreshes data + focuses the input on each open.
- **Asset** — `resources/trayTemplate.png` (+`@2x`), a monochrome template image (`setTemplateImage(true)`), copied into the packaged app via `electron-builder.yml` `extraResources` and resolved from `process.resourcesPath` when packaged.

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
