import * as React from 'react';

export interface SimulateOptions {
  lines: string[];
  intervalMs?: number;
  loop?: boolean;
}

export function useTerminalSimulate(
  writeFn: ((data: string) => void) | null,
  options: SimulateOptions,
): void {
  const writeFnRef = React.useRef(writeFn);
  writeFnRef.current = writeFn;

  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  React.useEffect(() => {
    if (!writeFn) return;

    const { lines, intervalMs = 80, loop = false } = optionsRef.current;
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const writeNext = () => {
      const write = writeFnRef.current;
      if (!write) return;
      if (index < lines.length) {
        write(lines[index] + '\r\n');
        index++;
        timer = setTimeout(writeNext, intervalMs);
      } else if (loop) {
        index = 0;
        write('\x1b[2J\x1b[H'); // clear screen + cursor home
        timer = setTimeout(writeNext, intervalMs * 5);
      }
    };

    timer = setTimeout(writeNext, intervalMs);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [writeFn]);
}
