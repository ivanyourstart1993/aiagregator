import { Terminal } from 'lucide-react';

const SAMPLE = `curl https://api.aigenway.com/v1/generate \\
  -H "Authorization: Bearer $AI_AGG_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model":    "imagen-3",
    "method":   "generate_image",
    "params":   {
      "prompt": "neon city at night, cinematic",
      "aspect_ratio": "16:9"
    }
  }'`;

export function CodePreview() {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 shadow-2xl shadow-black/40 backdrop-blur">
      {/* macOS-style title bar */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Terminal className="h-3 w-3" />
          curl
        </span>
        <span className="w-12" />
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed">
        <code className="block font-mono">{renderColoredCurl(SAMPLE)}</code>
      </pre>
    </div>
  );
}

/**
 * Minimal manual syntax highlighting for the curl example: just enough to give
 * visual structure without pulling in shiki/prism. Tokens we care about:
 * URL, header names, JSON keys, JSON strings, flags.
 */
function renderColoredCurl(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <span key={i} className="block whitespace-pre">
      {colorizeLine(line)}
    </span>
  ));
}

function colorizeLine(line: string): React.ReactNode {
  // curl line
  if (/^curl /.test(line)) {
    const [, rest] = line.match(/^(curl)\s+(.*)$/) ?? [];
    return (
      <>
        <span className="text-info">curl</span>{' '}
        <span className="text-success">{rest ?? ''}</span>
      </>
    );
  }
  // -H header
  const headerMatch = line.match(/^(\s*)(-H)\s+("[^"]*")(.*)$/);
  if (headerMatch) {
    const [, indent, flag, value, rest] = headerMatch;
    return (
      <>
        {indent}
        <span className="text-warning">{flag}</span>{' '}
        <span className="text-success">{value}</span>
        {rest}
      </>
    );
  }
  // -d data
  const dataMatch = line.match(/^(\s*)(-d)\s+(.*)$/);
  if (dataMatch) {
    const [, indent, flag, rest] = dataMatch;
    return (
      <>
        {indent}
        <span className="text-warning">{flag}</span> {rest}
      </>
    );
  }
  // JSON line with "key": "value"
  const kvMatch = line.match(/^(\s*)("[^"]*"):\s*("[^"]*")(.*)$/);
  if (kvMatch) {
    const [, indent, key, val, rest] = kvMatch;
    return (
      <>
        {indent}
        <span className="text-info">{key}</span>:{' '}
        <span className="text-success">{val}</span>
        {rest}
      </>
    );
  }
  return <span className="text-foreground/85">{line}</span>;
}
