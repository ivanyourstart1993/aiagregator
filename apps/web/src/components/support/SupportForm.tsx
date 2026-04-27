'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface Props {
  email: string;
  name: string;
}

export function SupportForm({ email, name }: Props) {
  const t = useTranslations('support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      if (res.ok) {
        setStatus({ ok: true, text: t('sent') });
        setSubject('');
        setMessage('');
      } else {
        const body = await res.json().catch(() => null);
        const msg =
          (body && (body.error?.message || body.message)) ||
          `${res.status} ${res.statusText}`;
        setStatus({ ok: false, text: t('failed', { error: msg }) });
      }
    } catch (err) {
      setStatus({ ok: false, text: t('failed', { error: String(err) }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <div className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm">
        <div>
          <span className="text-muted-foreground">{t('fromName')}: </span>
          <span className="font-medium">{name || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t('fromEmail')}: </span>
          <span className="font-mono">{email}</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="subject">
          {t('subject')}
        </label>
        <input
          id="subject"
          required
          minLength={3}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          placeholder={t('subjectPlaceholder')}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="message">
          {t('message')}
        </label>
        <textarea
          id="message"
          required
          minLength={10}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder={t('messagePlaceholder')}
        />
        <div className="text-xs text-muted-foreground">{message.length} / 5000</div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t('sending') : t('send')}
        </Button>
        {status ? (
          <span
            className={
              status.ok ? 'text-sm text-emerald-600' : 'text-sm text-destructive'
            }
          >
            {status.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
