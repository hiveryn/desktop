import { RotateCcw } from 'lucide-react';
import type { FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';

export function PageError({ error, resetErrorBoundary }: FallbackProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Button size="sm" variant="outline" onClick={resetErrorBoundary}>
        <RotateCcw className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
