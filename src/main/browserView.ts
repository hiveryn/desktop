import { BrowserWindow, type Rectangle, WebContentsView, webContents } from 'electron';
import type { BrowserViewBounds, BrowserViewState } from '../shared/types';

// Isolated, non-persisted partition so browser tabs share cookies/storage with
// nothing else in the app (and are cleared on quit).
const PARTITION = 'browsertabs';

interface ManagedView {
  view: WebContentsView;
  sessionId: string;
  // The host renderer's webContents id — used both to resolve the owning window
  // for attach/detach and to push state/open-new-tab events back to it.
  hostId: number;
  attached: boolean;
}

// Keyed by daemon-assigned browser tab id. Views outlive their React BrowserPane
// so back/forward history survives tab/session switches; they are only torn down
// on explicit close or host-window destruction.
const views = new Map<string, ManagedView>();

// Host webContents ids we've already hooked a 'closed' cleanup onto.
const hookedHosts = new Set<number>();

function hostWindow(managed: ManagedView): BrowserWindow | null {
  const wc = webContents.fromId(managed.hostId);
  if (!wc) return null;
  return BrowserWindow.fromWebContents(wc);
}

function sendToHost(managed: ManagedView, channel: string, payload: unknown): void {
  const wc = webContents.fromId(managed.hostId);
  if (wc && !wc.isDestroyed()) {
    wc.send(channel, payload);
  }
}

function stateOf(tabId: string, managed: ManagedView): BrowserViewState {
  const wc = managed.view.webContents;
  return {
    tabId,
    url: wc.getURL(),
    title: wc.getTitle(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    loading: wc.isLoading(),
  };
}

function bindPolicies(managed: ManagedView, tabId: string): void {
  const wc = managed.view.webContents;

  // Opening a link in a new tab (target=_blank / window.open) mints a
  // daemon-tracked sibling browser tab — the renderer POSTs the create. Deny the
  // native popup window.
  wc.setWindowOpenHandler(({ url }) => {
    sendToHost(managed, 'browser:open-new-tab', { sessionId: managed.sessionId, url });
    return { action: 'deny' };
  });

  // URL-bar navigation goes through loadURL() (programmatic — does NOT fire
  // will-navigate), so anything reaching here is page-initiated. Allow http/https
  // freely; block a page from navigating INTO file:// (the escape hatch is scoped
  // to the URL bar only).
  wc.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  const forward = (): void => sendToHost(managed, 'browser:state', stateOf(tabId, managed));
  wc.on('did-navigate', forward);
  wc.on('did-navigate-in-page', forward);
  wc.on('page-title-updated', forward);
  wc.on('did-start-loading', forward);
  wc.on('did-stop-loading', forward);
  wc.on('did-frame-finish-load', forward);
}

function hookHostCleanup(hostId: number): void {
  if (hookedHosts.has(hostId)) return;
  const wc = webContents.fromId(hostId);
  const win = wc ? BrowserWindow.fromWebContents(wc) : null;
  if (!win) return;
  hookedHosts.add(hostId);
  win.once('closed', () => {
    hookedHosts.delete(hostId);
    for (const [tabId, managed] of views) {
      if (managed.hostId === hostId) destroy(tabId);
    }
  });
}

// Create the view if absent, then load `target` only when it differs from the
// currently committed URL — the echo-suppression primitive. A self-initiated
// navigation writes `target` back to the daemon, whose `tab_changed` refetch
// re-drives ensure(); since the view already shows that URL, this no-ops rather
// than reloading the page out from under the user.
export function ensure(host: number, sessionId: string, tabId: string, target: string): void {
  let managed = views.get(tabId);
  if (!managed) {
    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        webSecurity: true,
      },
    });
    managed = { view, sessionId, hostId: host, attached: false };
    views.set(tabId, managed);
    bindPolicies(managed, tabId);
  } else {
    managed.sessionId = sessionId;
    managed.hostId = host;
  }
  hookHostCleanup(host);
  if (target && managed.view.webContents.getURL() !== target) {
    void managed.view.webContents.loadURL(target);
  }
}

// Attach this tab's view to its host window and detach every other view sharing
// that window (only one browser tab is visible per window at a time).
export function setActive(tabId: string): void {
  const managed = views.get(tabId);
  if (!managed) return;
  const win = hostWindow(managed);
  if (!win) return;
  for (const [otherId, other] of views) {
    if (otherId !== tabId && other.hostId === managed.hostId && other.attached) {
      win.contentView.removeChildView(other.view);
      other.attached = false;
    }
  }
  if (!managed.attached) {
    win.contentView.addChildView(managed.view);
    managed.attached = true;
  }
}

export function setBounds(tabId: string, bounds: BrowserViewBounds): void {
  const managed = views.get(tabId);
  if (!managed?.attached) return;
  const rect: Rectangle = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
  managed.view.setBounds(rect);
}

// Hide the view without tearing it down (tab switch, occlusion by a modal or a
// maximized sibling pane). History is preserved for when it re-attaches.
export function detach(tabId: string): void {
  const managed = views.get(tabId);
  if (!managed?.attached) return;
  const win = hostWindow(managed);
  if (win) win.contentView.removeChildView(managed.view);
  managed.attached = false;
}

export function navigate(tabId: string, url: string): void {
  const managed = views.get(tabId);
  if (!managed) return;
  void managed.view.webContents.loadURL(url);
}

export function goBack(tabId: string): void {
  const managed = views.get(tabId);
  if (managed?.view.webContents.navigationHistory.canGoBack()) {
    managed.view.webContents.navigationHistory.goBack();
  }
}

export function goForward(tabId: string): void {
  const managed = views.get(tabId);
  if (managed?.view.webContents.navigationHistory.canGoForward()) {
    managed.view.webContents.navigationHistory.goForward();
  }
}

export function reload(tabId: string): void {
  views.get(tabId)?.view.webContents.reload();
}

export function destroy(tabId: string): void {
  const managed = views.get(tabId);
  if (!managed) return;
  detach(tabId);
  views.delete(tabId);
  const wc = managed.view.webContents;
  if (!wc.isDestroyed()) wc.close();
}
