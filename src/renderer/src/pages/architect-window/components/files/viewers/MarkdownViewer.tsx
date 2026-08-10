import mdStyles from '@styles/markdown.module.css';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getEditorBuffer } from '../editorBuffers';
import type { CodeEditorHandle, ViewerProps } from '../viewerRegistry';
import CodeEditor from './CodeEditor';
import CopyButton from './CopyButton';
import MarkdownImage, { resolveRelative } from './MarkdownImage';
import Mermaid from './Mermaid';
import styles from './Viewers.module.css';

type MarkdownMode = 'rendered' | 'source';

// Leading YAML frontmatter block. Rendered as a compact key/value strip, not
// fed to react-markdown (which would show it as a thematic break + text).
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function extractFrontmatter(text: string): { pairs: [string, string][] | null; body: string } {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { pairs: null, body: text };
  const pairs = match[1]
    .split(/\r?\n/)
    .map((line): [string, string] => {
      const idx = line.indexOf(':');
      if (idx === -1) return [line.trim(), ''];
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
    .filter(([key]) => key !== '');
  return { pairs, body: text.slice(match[0].length) };
}

// Fragment slugs come in many dialects (GitHub "#agent-mode", Confluence
// "#Agent-Mode", URL-encoded "#Custom-Prompts-%26-Workflows") — comparing
// alphanumerics only matches headings across all of them.
function normalizeFragment(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // compare the raw text
  }
  return decoded.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function flattenText(children: unknown): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(flattenText).join('');
  return '';
}

const eyeIcon = (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    aria-hidden="true"
  >
    <path d="M1.5 8C3 4.5 5.5 3 8 3s5 1.5 6.5 5C13 11.5 10.5 13 8 13s-5-1.5-6.5-5Z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

const codeIcon = (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5.5 4.5L2 8L5.5 11.5" />
    <path d="M10.5 4.5L14 8L10.5 11.5" />
  </svg>
);

export default function MarkdownViewer(props: ViewerProps) {
  const [mode, setMode] = useState<MarkdownMode>('rendered');
  const bodyRef = useRef<HTMLDivElement>(null);
  const { file, text, onOpenFile, scrollRef, editorRef, onDirtyChange, onCursorChange, wordWrap } =
    props;
  const setBodyRef = (node: HTMLDivElement | null): void => {
    bodyRef.current = node;
    scrollRef?.(node);
  };

  // Source mode embeds the same editor code files use, but its handle is
  // captured here rather than reported straight up to FileViewer so this
  // viewer can wrap it: entering edit mode (the `i` key / focus request) first
  // flips to source view, and a save requested while rendered flips to source,
  // mounts the editor, then writes. The editor only mounts in source mode.
  const innerRef = useRef<CodeEditorHandle | null>(null);
  const pendingRef = useRef<'focus' | 'save' | null>(null);
  const pendingSaveResolveRef = useRef<((saved: boolean) => void) | null>(null);
  // The viewer instance persists across markdown-file switches (same kind →
  // no remount), so the handle closures read the live path through a ref.
  const filePathRef = useRef(file.path);
  filePathRef.current = file.path;

  const setInnerHandle = useCallback((handle: CodeEditorHandle | null): void => {
    innerRef.current = handle;
    if (!handle || pendingRef.current === null) return;
    const action = pendingRef.current;
    pendingRef.current = null;
    if (action === 'focus') {
      handle.focus();
    } else {
      const resolve = pendingSaveResolveRef.current;
      pendingSaveResolveRef.current = null;
      void handle.save().then((saved) => resolve?.(saved));
    }
  }, []);

  useEffect(() => {
    if (!editorRef) return;
    editorRef({
      focus: () => {
        if (innerRef.current) {
          innerRef.current.focus();
        } else {
          pendingRef.current = 'focus';
          setMode('source');
        }
      },
      save: () => {
        if (innerRef.current) return innerRef.current.save();
        // Rendered mode with the editor unmounted: only bother mounting it to
        // flush if there are stashed unsaved edits.
        if (!getEditorBuffer(filePathRef.current)?.dirty) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
          pendingSaveResolveRef.current = resolve;
          pendingRef.current = 'save';
          setMode('source');
        });
      },
    });
    return () => editorRef(null);
  }, [editorRef]);
  const parsed = useMemo(() => (text === null ? null : extractFrontmatter(text)), [text]);
  if (text === null || parsed === null) {
    throw new Error(`MarkdownViewer requires decoded text for ${file.path}`);
  }
  const baseDir = file.path.slice(0, file.path.lastIndexOf('/')) || '/';

  // Fragment links must not touch location.hash — the app routes on it — so
  // scroll to the matching rendered heading instead.
  const handleFragmentClick = (e: MouseEvent, href: string): void => {
    e.preventDefault();
    const target = normalizeFragment(href.slice(1));
    if (!target || !bodyRef.current) return;
    for (const heading of bodyRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      if (normalizeFragment(heading.textContent ?? '') === target) {
        heading.scrollIntoView({ block: 'start' });
        return;
      }
    }
  };

  // Relative links open the target file in this explorer; fragment links
  // scroll within the document; external links are handled by main's
  // will-navigate handler (default browser).
  const renderAnchor = (anchorProps: ComponentProps<'a'>): ReactNode => {
    const { href, children, ...rest } = anchorProps;
    if (href?.startsWith('#')) {
      return (
        <a href={href} {...rest} onClick={(e) => handleFragmentClick(e, href)}>
          {children}
        </a>
      );
    }
    const isRelative = href !== undefined && !/^[a-z][a-z0-9+.-]*:/i.test(href);
    if (!isRelative || !onOpenFile) {
      return (
        <a href={href} {...rest}>
          {children}
        </a>
      );
    }
    const pathOnly = href.split(/[?#]/)[0];
    return (
      <a
        href={href}
        {...rest}
        onClick={(e) => {
          e.preventDefault();
          onOpenFile(resolveRelative(baseDir, pathOnly));
        }}
      >
        {children}
      </a>
    );
  };

  const renderPre = (preProps: ComponentProps<'pre'>): ReactNode => {
    const { children, ...rest } = preProps;
    const child = Children.toArray(children)[0];
    if (isValidElement(child)) {
      const childProps = child.props as { className?: string; children?: unknown };
      if (/\blanguage-mermaid\b/.test(childProps.className ?? '')) {
        return <Mermaid code={flattenText(childProps.children)} />;
      }
    }
    return <pre {...rest}>{children}</pre>;
  };

  return (
    <div className={styles.markdownViewer}>
      {mode === 'rendered' ? (
        <div ref={setBodyRef} className={`${styles.markdownBody} ${mdStyles.markdown}`}>
          {parsed.pairs && parsed.pairs.length > 0 && (
            <dl className={styles.frontmatter}>
              {parsed.pairs.map(([key, value], i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: frontmatter keys can repeat; order is stable per text
                <Fragment key={i}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: renderAnchor,
              pre: renderPre,
              img: ({ src, alt }) => (
                <MarkdownImage
                  src={typeof src === 'string' ? src : undefined}
                  alt={alt}
                  baseDir={baseDir}
                />
              ),
            }}
          >
            {parsed.body}
          </ReactMarkdown>
        </div>
      ) : (
        <CodeEditor
          file={file}
          text={text}
          scrollRef={scrollRef}
          editorRef={setInnerHandle}
          onDirtyChange={onDirtyChange}
          onCursorChange={onCursorChange}
          wordWrap={wordWrap}
        />
      )}
      <div className={styles.modeToggle}>
        <button
          type="button"
          className={styles.modeToggleButton}
          data-active={mode === 'rendered' || undefined}
          title="Rendered"
          aria-label="Rendered view"
          onClick={() => setMode('rendered')}
        >
          {eyeIcon}
        </button>
        <button
          type="button"
          className={styles.modeToggleButton}
          data-active={mode === 'source' || undefined}
          title="Source"
          aria-label="Source view"
          onClick={() => setMode('source')}
        >
          {codeIcon}
        </button>
        <CopyButton
          getText={() => getEditorBuffer(filePathRef.current)?.state.doc.toString() ?? text}
        />
      </div>
    </div>
  );
}
