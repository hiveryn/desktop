import * as React from 'react';
import { Back, Close, Forward, Refresh } from '../../../components/icons';
import { useSessionStore } from '../../../state/sessionStore';
import styles from './BrowserPane.module.css';

interface BrowserPaneProps {
  sessionId: string;
  tabId: string;
  // Current daemon-owned target for this tab (the URL the daemon believes is loaded).
  target: string;
  // Re-measure trigger: maximize repositions the pane without necessarily
  // resizing the anchor.
  isMaximized: boolean;
}

// Tabs whose URL bar has already been auto-focused once — so switching back to an
// existing browser tab does not keep stealing focus from page content.
const autoFocusedTabs = new Set<string>();

// Normalize a URL-bar entry into something the native view can load. Absolute
// paths become file://, bare localhost becomes http://, everything else https://.
function normalizeInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^(file|https?):\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  if (/^localhost(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

// Tolerant URL compare (ignores a trailing slash) so a committed URL that only
// differs from the daemon target by normalization does not trigger a write-back.
function sameUrl(a: string, b: string): boolean {
  return a.replace(/\/$/, '') === b.replace(/\/$/, '');
}

const BrowserPane: React.FC<BrowserPaneProps> = ({ sessionId, tabId, target, isMaximized }) => {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputFocusedRef = React.useRef(false);
  const attachedRef = React.useRef(false);
  const lastWrittenUrlRef = React.useRef('');

  const [inputValue, setInputValue] = React.useState(target);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [canGoForward, setCanGoForward] = React.useState(false);

  const maximizedPane = useSessionStore((s) => s.maximizedPane);

  // ── Bounds sync + occlusion ────────────────────────────────────────────────
  // The native view is not a DOM node and paints above all DOM, so a dialog,
  // maximize backdrop, or a maximized sibling pane would render *under* it. We
  // detect occlusion generically via elementFromPoint at the anchor centre: if
  // the topmost DOM element there is not the anchor, something covers the pane.
  const measure = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(cx, cy);
    const occluded = !topEl || (topEl !== anchor && !anchor.contains(topEl));
    const visible = rect.width > 0 && rect.height > 0 && !occluded;

    if (visible) {
      if (!attachedRef.current) {
        void window.hiveryn.browserView.setActive(tabId);
        attachedRef.current = true;
      }
      window.hiveryn.browserView.syncBounds(tabId, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } else if (attachedRef.current) {
      void window.hiveryn.browserView.detach(tabId);
      attachedRef.current = false;
    }
  }, [tabId]);

  // Create/attach the view and load the target (echo-suppressed in main).
  React.useEffect(() => {
    let cancelled = false;
    void window.hiveryn.browserView.ensure(sessionId, tabId, target).then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, tabId, target, measure]);

  // Detach (never destroy — preserve history) when the pane unmounts.
  React.useEffect(() => {
    return () => {
      void window.hiveryn.browserView.detach(tabId);
      attachedRef.current = false;
    };
  }, [tabId]);

  // Keep the view glued to the anchor: ResizeObserver + window resize for smooth
  // geometry, a maximize-state re-measure, a store subscription for the observable
  // overlays, and a low-frequency interval as a safety net for untracked overlays.
  React.useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(anchor);
    window.addEventListener('resize', measure);
    const interval = window.setInterval(measure, 250);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.clearInterval(interval);
    };
  }, [measure]);

  // Immediate re-measure when maximize state flips (layout moves without resizing
  // the anchor).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on maximize changes
  React.useEffect(() => {
    measure();
  }, [isMaximized, maximizedPane, measure]);

  // ── Navigation state from the native view ──────────────────────────────────
  React.useEffect(() => {
    return window.hiveryn.browserView.onState((state) => {
      if (state.tabId !== tabId) return;
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
      if (state.url && !inputFocusedRef.current) {
        setInputValue(state.url);
      }
      // Write a committed navigation back to the daemon so `target` stays current
      // (covers URL-bar and in-page link navigation) and MCP getBrowserTabs is
      // accurate. Echo is suppressed by the tolerant compare + main's ensure().
      if (state.url && state.url !== lastWrittenUrlRef.current && !sameUrl(state.url, target)) {
        lastWrittenUrlRef.current = state.url;
        void window.hiveryn.tabs.createBrowserTab(sessionId, {
          target: state.url,
          tab_id: tabId,
        });
      }
    });
  }, [sessionId, tabId, target]);

  // Auto-focus the URL bar the first time a given tab appears (new tab UX).
  React.useEffect(() => {
    if (autoFocusedTabs.has(tabId)) return;
    autoFocusedTabs.add(tabId);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [tabId]);

  const submitUrl = (): void => {
    const url = normalizeInputUrl(inputValue);
    if (!url) return;
    inputRef.current?.blur();
    void window.hiveryn.browserView.navigate(tabId, url);
  };

  const handleClose = async (): Promise<void> => {
    await window.hiveryn.tabs.closeBrowserTab(sessionId, tabId);
    autoFocusedTabs.delete(tabId);
    await window.hiveryn.browserView.destroy(tabId);
    const tabs = await window.hiveryn.tabs.list(sessionId);
    useSessionStore.getState().setSessionTabs(sessionId, tabs);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.navBtn}
          disabled={!canGoBack}
          aria-label="Back"
          title="Back"
          onClick={() => window.hiveryn.browserView.back(tabId)}
        >
          <Back />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          disabled={!canGoForward}
          aria-label="Forward"
          title="Forward"
          onClick={() => window.hiveryn.browserView.forward(tabId)}
        >
          <Forward />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Reload"
          title="Reload"
          onClick={() => window.hiveryn.browserView.reload(tabId)}
        >
          <Refresh />
        </button>
        <input
          ref={inputRef}
          className={styles.urlInput}
          value={inputValue}
          spellCheck={false}
          autoComplete="off"
          aria-label="URL"
          onFocus={() => {
            inputFocusedRef.current = true;
          }}
          onBlur={() => {
            inputFocusedRef.current = false;
          }}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitUrl();
            }
          }}
        />
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Close browser tab"
          title="Close tab"
          onClick={() => void handleClose()}
        >
          <Close />
        </button>
      </div>
      {/* Native WebContentsView is bounds-synced to fill this anchor. */}
      <div ref={anchorRef} className={styles.viewAnchor} />
    </div>
  );
};

export default BrowserPane;
