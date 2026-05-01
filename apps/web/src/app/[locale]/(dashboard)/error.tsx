'use client';

// TEMP DIAGNOSTIC error boundary — show real stack trace to find the
// crashing server component on the user dashboard. Remove once debugged.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold text-destructive">Dashboard render error</h1>
      <pre className="overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-4 text-xs">
{`${error.name}: ${error.message}\n\ndigest: ${error.digest ?? '(no digest)'}\n\n${error.stack ?? '(no stack)'}`}
      </pre>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border bg-card px-3 py-1 text-sm hover:bg-accent"
      >
        Try again
      </button>
    </div>
  );
}
