# Hidden desktop integration checks

`isolated-workspace-main.ts` uses the production renderer, preload, daemon client and IPC. It creates the hidden workbench window with a separate application name and user-data directory, without tray, notification or global shortcut setup. It is a verification entrypoint, not a production launch mode.

Prepare a private temporary run directory containing `owned-isolation` with `workspace-migration-ticket`, a `home/` with disposable daemon configuration and a registered `example` fixture workspace. Use a free loopback port other than 4200/4201. Keep the daemon executable, SQLite, logs, provider configuration and fixture executables inside that directory. Do not use real provider credentials or global hooks. Start only this owned daemon and retain its PID.

Build without touching the normal output:

```sh
pnpm exec electron-vite build --config scripts/isolated-workspace.config.ts --outDir "$RUN_DIR/out"
```

External main-process dependencies must resolve from the build location; a `node_modules` symlink inside the run output to this checkout's installed dependencies suffices. Launch Electron against `$RUN_DIR/out/main/index.js` with `HIVERYN_ISOLATED_RUN=$RUN_DIR`, `HIVERYN_HOME=$RUN_DIR/home` and `HIVERYN_DAEMON_URL=http://127.0.0.1:$RUN_PORT`. Playwright's Electron launcher can drive the hidden window through normal DOM interactions. Assert `BrowserWindow.isVisible() === false`, isolated `app.getPath('userData')`, and no registered global shortcuts before interacting.

A minimal smoke flow is to select the fixture architect in the session sidebar (launching its architect session with a fixture variant), write a valid backlog ticket through the filesystem, wait for its title to appear, atomically replace the file and check the new title, then delete it and check disappearance. A worker launch check should open the ticket, click Spawn, verify every workflow chip has `aria-pressed=false`, select a fixture agent and an explicit workflow, and click Spawn. Verify the daemon session/run and captured fixture arguments; a deterministic process is not evidence of real-provider behavior. Close Electron through its owned handle and stop only the daemon PID after verifying its executable path belongs to the run. Retain concise logs/screenshots outside source.
