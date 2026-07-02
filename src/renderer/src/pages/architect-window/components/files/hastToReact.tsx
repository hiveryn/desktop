import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { RefractorNode } from 'refractor/core';

// Renders refractor's hast output ({type, tagName, properties, children} /
// {type, value}) straight to React nodes — small enough that pulling in a
// hast-to-JSX dependency isn't warranted.
export function renderHast(nodes: RefractorNode[], keyPrefix = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}${i}`;
    if (node.type === 'text') {
      return node.value;
    }
    const className = node.properties.className?.join(' ');
    return createElement(node.tagName, { key, className }, renderHast(node.children, `${key}-`));
  });
}

// Splits highlighted nodes into per-line node lists so the code viewer can
// wrap each line for the CSS-counter gutter. Elements spanning a newline are
// cloned onto each line they cover.
export function splitHastLines(nodes: RefractorNode[]): RefractorNode[][] {
  const lines: RefractorNode[][] = [[]];
  for (const node of nodes) {
    const parts = splitNode(node);
    for (const [i, part] of parts.entries()) {
      if (i > 0) lines.push([]);
      lines[lines.length - 1].push(...part);
    }
  }
  return lines;
}

// One node-list per line the node spans (a node without newlines yields a
// single-element result).
function splitNode(node: RefractorNode): RefractorNode[][] {
  if (node.type === 'text') {
    return node.value
      .split('\n')
      .map((value) => (value === '' ? [] : [{ type: 'text', value } as RefractorNode]));
  }
  const childLines = splitHastLines(node.children);
  return childLines.map((children) =>
    children.length === 0 ? [] : [{ ...node, children } as RefractorNode],
  );
}
