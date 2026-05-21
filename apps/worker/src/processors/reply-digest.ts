// Daily reply digest. Polls Message rows (direction=INBOUND, sentAt within
// last 24h) and emails a categorised summary to the operator. Fires once on
// boot if there's anything to send, then every 24h. State is in-memory only —
// a worker restart inside the digest window can re-send the same digest, which
// is acceptable (annoying, not destructive).
import { Resend } from 'resend';
import type { PrismaClient } from '@aiagg/db';

export interface ReplyDigestOptions {
  prisma: PrismaClient;
  resendApiKey: string;
  fromAddress: string;
  digestRecipient: string;
  // Optional override — defaults to once per 24h after boot.
  digestEveryMs?: number;
  // Internal poll cadence; default 1h.
  intervalMs?: number;
  // Used for building lead links in the digest body.
  panelBaseUrl?: string;
}

export interface ReplyDigestHandle {
  close: () => Promise<void>;
}

const INTERESTED = /\b(interested|sounds good|let's talk|tell me more|sign up|onboard|pricing|trial|test|demo|let me try|yes please|how do i|share more)\b/i;
const UNSUBSCRIBE = /\b(unsubscribe|remove me|stop|opt out|not interested|do not contact|leave me alone)\b/i;

type Category = 'interested' | 'question' | 'unsubscribe' | 'other';

function categorise(body: string): Category {
  if (UNSUBSCRIBE.test(body)) return 'unsubscribe';
  if (INTERESTED.test(body)) return 'interested';
  if (/\?/.test(body)) return 'question';
  return 'other';
}

function preview(body: string, max = 280): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function startReplyDigest(opts: ReplyDigestOptions): ReplyDigestHandle {
  const resend = new Resend(opts.resendApiKey);
  const interval = opts.intervalMs ?? 60 * 60 * 1000;
  const digestEvery = opts.digestEveryMs ?? 24 * 60 * 60 * 1000;
  const panelBase = opts.panelBaseUrl ?? 'https://panel.aigenway.com';

  let lastDigestMs = 0;
  let stopped = false;

  async function runOnce(): Promise<void> {
    const sinceTs = lastDigestMs === 0 ? Date.now() - 24 * 60 * 60 * 1000 : lastDigestMs;
    const since = new Date(sinceTs);

    const messages = await opts.prisma.message.findMany({
      where: {
        direction: 'INBOUND',
        sentAt: { gte: since },
      },
      include: {
        conversation: { include: { lead: true } },
      },
      orderBy: { sentAt: 'asc' },
    });

    if (messages.length === 0) {
      console.log('[worker] reply-digest: 0 new replies, skip send');
      lastDigestMs = Date.now();
      return;
    }

    const buckets: Record<Category, typeof messages> = {
      interested: [],
      question: [],
      unsubscribe: [],
      other: [],
    };
    for (const m of messages) buckets[categorise(m.body)].push(m);

    const lines: string[] = [];
    lines.push(`${messages.length} new replies in the last 24 hours.`);
    lines.push('');
    lines.push('Breakdown:');
    lines.push(`  Interested:  ${buckets.interested.length}`);
    lines.push(`  Questions:   ${buckets.question.length}`);
    lines.push(`  Unsubscribe: ${buckets.unsubscribe.length}`);
    lines.push(`  Other:       ${buckets.other.length}`);
    lines.push('');

    const order: Category[] = ['interested', 'question', 'other', 'unsubscribe'];
    for (const cat of order) {
      const bucket = buckets[cat];
      if (bucket.length === 0) continue;
      lines.push(`=== ${cat.toUpperCase()} (${bucket.length}) ===`);
      for (const m of bucket) {
        const lead = m.conversation.lead;
        const who = lead.ownerName
          ? `${lead.ownerName} <${lead.ownerEmail ?? '?'}>`
          : (lead.ownerEmail ?? '(no email)');
        lines.push(`• ${lead.name} — ${who}`);
        lines.push(`  ${preview(m.body)}`);
        lines.push(`  ${panelBase}/crm/leads/${lead.id}`);
        lines.push('');
      }
    }

    const sendRes = await resend.emails.send({
      from: opts.fromAddress,
      to: opts.digestRecipient,
      subject: `[Outreach digest] ${messages.length} new replies`,
      text: lines.join('\n'),
    });
    if (sendRes.error) {
      console.warn(
        `[worker] reply-digest send failed: ${sendRes.error.message ?? sendRes.error}`,
      );
      return;
    }
    console.log(
      `[worker] reply-digest: sent ${messages.length} replies → ${opts.digestRecipient}`,
    );
    lastDigestMs = Date.now();
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    const now = Date.now();
    if (lastDigestMs !== 0 && now - lastDigestMs < digestEvery) return;
    try {
      await runOnce();
    } catch (err) {
      console.warn(
        `[worker] reply-digest tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // First run shortly after boot — handles any replies that came in while the
  // worker was down. Subsequent runs every `intervalMs` (default 1h) with a
  // 24h minimum between actual sends.
  const bootTimer: NodeJS.Timeout = setTimeout(() => void tick(), 30_000);
  const pollTimer: NodeJS.Timeout = setInterval(() => void tick(), interval);

  return {
    close: async () => {
      stopped = true;
      clearTimeout(bootTimer);
      clearInterval(pollTimer);
    },
  };
}
