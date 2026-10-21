// Instruction text with key caps: "[Q]" in a string is drawn as a key, so every instruction can show its control.
import { Fragment } from 'react';

const KEY = /\[([^\]\n]{1,9})\]/g;

/** React: plain text with `[X]` tokens drawn as <kbd>X</kbd>. */
export function Keys({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(KEY)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<kbd key={m.index}>{m[1]}</kbd>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** DOM labels (world-space tags set through innerHTML): the same markup, escaped. */
export function keysHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ESC[c]).replace(KEY, '<kbd>$1</kbd>');
}
