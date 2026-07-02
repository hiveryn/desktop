import { tokenize } from 'react-diff-view';
import type { HunkData } from 'react-diff-view';
import { refractor, registerLanguages } from './languages';

registerLanguages();

interface TokenizeWorkerPayload {
  hunks: HunkData[];
  oldSource: string | null;
  language?: string;
}

interface TokenizeMessage {
  id: number;
  type: 'tokenize';
  payload: TokenizeWorkerPayload;
}

// electron-vite's default lib set (DOM) already declares a global `self:
// Window`; this local `declare const` shadows it within the module scope so
// postMessage/onmessage type-check against the worker's actual API instead
// of Window's cross-document postMessage overload.
declare const self: {
  onmessage: ((event: MessageEvent<TokenizeMessage>) => void) | null;
  postMessage: (message: unknown) => void;
};

self.onmessage = (event) => {
  const { id, type, payload } = event.data;
  if (type !== 'tokenize') return;

  const { hunks, oldSource, language } = payload;
  try {
    const tokens = language
      ? tokenize(hunks, { highlight: true, refractor, language, oldSource: oldSource ?? undefined })
      : tokenize(hunks, { oldSource: oldSource ?? undefined });
    self.postMessage({ id, payload: { success: true, tokens } });
  } catch (error) {
    self.postMessage({
      id,
      payload: { success: false, reason: error instanceof Error ? error.message : String(error) },
    });
  }
};
