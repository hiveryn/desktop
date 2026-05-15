import * as React from 'react';

export interface InteractiveOptions {
  prompt?: string;
  welcomeLines?: string[];
  responses: string[][];
}

export function useTerminalInteractive(
  writeFn: ((data: string) => void) | null,
  options: InteractiveOptions,
): { onData: (data: string) => void } {
  const writeFnRef = React.useRef(writeFn);
  writeFnRef.current = writeFn;

  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const responseIndexRef = React.useRef(0);
  const inputBufferRef = React.useRef('');

  // Write welcome lines and initial prompt when the terminal becomes available
  React.useEffect(() => {
    if (!writeFn) return;
    const { welcomeLines = [], prompt = '$ ' } = optionsRef.current;
    welcomeLines.forEach(line => writeFn(line + '\r\n'));
    writeFn(prompt);
  }, [writeFn]);

  // Stable onData handler — reads latest writeFn and options from refs
  const onData = React.useCallback((data: string) => {
    const write = writeFnRef.current;
    if (!write) return;
    const { prompt = '$ ', responses } = optionsRef.current;

    if (data === '\r') {
      write('\r\n');
      if (inputBufferRef.current.trim() === 'clear') {
        // erase scrollback + visible screen + cursor home — all via writeFn, no TerminalPane API changes needed
        write('\x1b[3J\x1b[2J\x1b[H');
      } else {
        const block = responses[responseIndexRef.current % responses.length];
        responseIndexRef.current++;
        block.forEach(line => write(line + '\r\n'));
      }
      inputBufferRef.current = '';
      write(prompt);
    } else if (data === '\x7f') {
      if (inputBufferRef.current.length > 0) {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        write('\b \b');
      }
    } else if (data >= ' ') {
      inputBufferRef.current += data;
      write(data);
    }
  }, []); // stable — reads all state from refs

  return { onData };
}
