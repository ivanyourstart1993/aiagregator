// Reserved for a future detail view. Currently the table includes inline expansion.
import type { AlertView } from '@/lib/server-api';

export function AlertDetail({ alert }: { alert: AlertView }) {
  return (
    <pre className="overflow-auto rounded bg-muted p-3 font-mono text-xs">
      {JSON.stringify(alert, null, 2)}
    </pre>
  );
}
