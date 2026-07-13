import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { type Extension, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

// CodeMirror theme for the files-tab editor, mapped to the same theme tokens
// the rest of the app uses so it follows the terminal palette.
const editorChrome = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--theme-text)',
    backgroundColor: 'var(--theme-background)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-family-mono)',
    lineHeight: 'var(--line-height-base)',
    tabSize: '4',
  },
  '.cm-content': {
    padding: 'var(--space-2) 0',
    caretColor: 'var(--theme-cursor)',
  },
  '.cm-line': {
    paddingRight: 'var(--space-h-2)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--theme-cursor)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--theme-terminal-selection)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--theme-terminal-selection)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--theme-selection)',
  },
  // Subtle, right-aligned line-number strip matching the explorer's palette.
  '.cm-gutters': {
    color: 'var(--theme-text-subtle)',
    backgroundColor: 'var(--theme-background)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '5ch',
    padding: '0 1ch 0 var(--space-h-2)',
  },
  '.cm-activeLineGutter': {
    color: 'var(--theme-text-muted)',
    backgroundColor: 'transparent',
  },
  // codemirror-vim's mode/ex-command panel.
  '.cm-panels': {
    color: 'var(--theme-text-muted)',
    backgroundColor: 'var(--theme-surface-1)',
    borderTop: '1px solid var(--theme-border)',
  },
  '.cm-vim-panel': {
    padding: '0 var(--space-h-2)',
    fontFamily: 'var(--font-family-mono)',
    fontSize: 'var(--font-size-xs)',
  },
  '.cm-vim-panel input': {
    color: 'var(--theme-text)',
    fontFamily: 'var(--font-family-mono)',
    fontSize: 'var(--font-size-xs)',
  },
});

// codemirror-vim installs its block-cursor colors at Prec.highest, so the
// override has to sit at the same precedence to win.
const vimCursor = Prec.highest(
  EditorView.theme({
    '.cm-fat-cursor': {
      background: 'var(--theme-cursor)',
      color: 'var(--theme-cursor-accent)',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
      background: 'none',
      outline: 'solid 1px var(--theme-cursor)',
    },
  }),
);

// Lezer tag → color mapping mirroring styles/prism.css so files render the
// same in the editor and the refractor-based git-diff view. Bare
// variable names are deliberately left unstyled — prism doesn't color them
// either, and painting every identifier would make the two renderers diverge.
const highlightStyle = HighlightStyle.define([
  { tag: [tags.comment, tags.meta], color: 'var(--theme-text-subtle)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: 'var(--theme-ansi-magenta)' },
  {
    tag: [tags.string, tags.special(tags.string), tags.character, tags.regexp],
    color: 'var(--theme-ansi-green)',
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.className],
    color: 'var(--theme-ansi-blue)',
  },
  {
    tag: [tags.number, tags.bool, tags.atom, tags.null, tags.constant(tags.variableName)],
    color: 'var(--theme-ansi-yellow)',
  },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--theme-text-muted)' },
  {
    tag: [tags.propertyName, tags.tagName, tags.typeName, tags.namespace, tags.self],
    color: 'var(--theme-ansi-cyan)',
  },
  { tag: [tags.attributeName, tags.labelName], color: 'var(--theme-ansi-bright-yellow)' },
  { tag: tags.deleted, color: 'var(--theme-ansi-red)' },
  { tag: tags.inserted, color: 'var(--theme-ansi-green)' },
  { tag: [tags.url, tags.link], color: 'var(--theme-ansi-bright-cyan)' },
  { tag: tags.heading, fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.invalid, color: 'var(--theme-status-error)' },
]);

export const editorTheme: Extension = [editorChrome, vimCursor, syntaxHighlighting(highlightStyle)];
