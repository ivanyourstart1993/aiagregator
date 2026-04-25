import type { ReactNode } from 'react';

interface Props {
  value: unknown;
  title?: ReactNode;
}

export function JsonCodeBlock({ value, title }: Props) {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <div className="space-y-2">
      {title ? <div className="text-sm font-semibold">{title}</div> : null}
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-xs leading-relaxed">
        <code>{text}</code>
      </pre>
    </div>
  );
}
