export function dispatchSseBlock(block: string, onData: (data: string) => void): void {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (!data) return;

  onData(data);
}

export function consumeSseBuffer(buffer: string, onData: (data: string) => void): string {
  let remaining = buffer.replace(/\r\n/g, '\n');
  let boundaryIndex = remaining.indexOf('\n\n');

  while (boundaryIndex !== -1) {
    const block = remaining.slice(0, boundaryIndex);
    dispatchSseBlock(block, onData);
    remaining = remaining.slice(boundaryIndex + 2);
    boundaryIndex = remaining.indexOf('\n\n');
  }

  return remaining;
}
