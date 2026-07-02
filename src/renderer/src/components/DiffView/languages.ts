import refractor from 'refractor/core';
import bash from 'refractor/lang/bash';
import c from 'refractor/lang/c';
import cpp from 'refractor/lang/cpp';
import css from 'refractor/lang/css';
import go from 'refractor/lang/go';
import java from 'refractor/lang/java';
import javascript from 'refractor/lang/javascript';
import json from 'refractor/lang/json';
import jsx from 'refractor/lang/jsx';
import markdown from 'refractor/lang/markdown';
import python from 'refractor/lang/python';
import rust from 'refractor/lang/rust';
import scss from 'refractor/lang/scss';
import sql from 'refractor/lang/sql';
import tsx from 'refractor/lang/tsx';
import typescript from 'refractor/lang/typescript';
import yaml from 'refractor/lang/yaml';

// Curated set of languages actually expected in Hiveryn's own repos, kept
// small deliberately — refractor/core starts empty and every registered
// language adds to the bundle. Extend as new file types show up in diffs.
const LANGUAGES = [
  bash,
  c,
  cpp,
  css,
  go,
  java,
  javascript,
  json,
  jsx,
  markdown,
  python,
  rust,
  scss,
  sql,
  tsx,
  typescript,
  yaml,
];

let registered = false;

export function registerLanguages(): void {
  if (registered) return;
  registered = true;
  for (const lang of LANGUAGES) refractor.register(lang);
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  go: 'go',
  py: 'python',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
};

export function languageForPath(path: string): string | undefined {
  const ext = path.split('.').pop();
  if (!ext) return undefined;
  return EXTENSION_LANGUAGE[ext.toLowerCase()];
}

export { refractor };
