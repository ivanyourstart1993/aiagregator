'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const CURL = `curl https://api.aigenway.com/v1/generations \\
  -H "Authorization: Bearer $AI_AGG_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "google_banana",
    "model":    "gemini-3.1-flash-image-preview",
    "method":   "text_to_image",
    "params":   { "prompt": "neon city at night", "aspect_ratio": "16:9" }
  }'`;

const NODE = `import fetch from 'node-fetch';

const res = await fetch('https://api.aigenway.com/v1/generations', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.AI_AGG_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    provider: 'google_banana',
    model:    'gemini-3.1-flash-image-preview',
    method:   'text_to_image',
    params:   { prompt: 'neon city at night', aspect_ratio: '16:9' },
  }),
});

const { taskId, status } = await res.json();`;

const PYTHON = `import os, requests

res = requests.post(
    'https://api.aigenway.com/v1/generations',
    headers={'Authorization': f'Bearer {os.environ["AI_AGG_KEY"]}'},
    json={
        'provider': 'google_banana',
        'model':    'gemini-3.1-flash-image-preview',
        'method':   'text_to_image',
        'params':   {'prompt': 'neon city at night', 'aspect_ratio': '16:9'},
    },
)
data = res.json()`;

export function CodeExample() {
  const t = useTranslations('marketing.codeExample');
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6 md:py-20">
      <div className="grid gap-10 md:grid-cols-12 md:items-center">
        <div className="md:col-span-5">
          <p className="text-xs font-medium uppercase tracking-wider text-info">{t('eyebrow')}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t('subtitle')}
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <BulletItem>{t('bullet1')}</BulletItem>
            <BulletItem>{t('bullet2')}</BulletItem>
            <BulletItem>{t('bullet3')}</BulletItem>
          </ul>
        </div>

        <div className="md:col-span-7">
          <Tabs defaultValue="curl" className="w-full">
            <div className="flex items-center justify-between gap-2">
              <TabsList className="bg-card/60">
                <TabsTrigger value="curl" className="text-xs">cURL</TabsTrigger>
                <TabsTrigger value="node" className="text-xs">Node.js</TabsTrigger>
                <TabsTrigger value="python" className="text-xs">Python</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="curl">
              <CodeBlock code={CURL} />
            </TabsContent>
            <TabsContent value="node">
              <CodeBlock code={NODE} />
            </TabsContent>
            <TabsContent value="python">
              <CodeBlock code={PYTHON} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <span>{children}</span>
    </li>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="relative rounded-xl border border-border/70 bg-card/60 shadow-xl shadow-black/30">
      <button
        type="button"
        onClick={copy}
        className={cn(
          'absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px] font-medium transition-colors',
          copied ? 'text-success' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-4 pr-16 text-[12.5px] leading-relaxed">
        <code className="block whitespace-pre font-mono text-foreground/85">{code}</code>
      </pre>
    </div>
  );
}
