'use client';

import { useState, useTransition, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  type LeadKanbanCardView,
  type LeadStatus,
  type LeadsKanban,
} from '@/lib/server-api';
import { moveLeadAction } from '@/app/[locale]/(panel)/crm/actions';
import { cn } from '@/lib/utils';

const STATUS_ORDER: LeadStatus[] = [
  'NEW',
  'ENRICHED',
  'READY',
  'CONTACTED',
  'REPLIED',
  'IN_DIALOG',
  'DEMO',
  'WON',
  'LOST_NO_REPLY',
  'LOST_REJECTED',
  'BLOCKED',
];

const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: 'border-l-slate-500',
  ENRICHED: 'border-l-blue-500',
  READY: 'border-l-cyan-500',
  CONTACTED: 'border-l-amber-500',
  REPLIED: 'border-l-yellow-500',
  IN_DIALOG: 'border-l-purple-500',
  DEMO: 'border-l-fuchsia-500',
  WON: 'border-l-emerald-500',
  LOST_NO_REPLY: 'border-l-zinc-500',
  LOST_REJECTED: 'border-l-rose-500',
  BLOCKED: 'border-l-red-600',
};

interface Props {
  initial: LeadsKanban;
}

export function KanbanBoard({ initial }: Props) {
  const t = useTranslations('crm');
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic local state. Server is source of truth — refreshed via revalidate.
  const [data, setData] = useState<LeadsKanban>(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<LeadStatus | null>(null);

  function handleDragStart(e: DragEvent, leadId: string) {
    setDraggingId(leadId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  }

  function handleDragOver(e: DragEvent, status: LeadStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverStatus !== status) setHoverStatus(status);
  }

  function handleDragLeave() {
    setHoverStatus(null);
  }

  function moveLeadOptimistic(leadId: string, toStatus: LeadStatus) {
    setData((prev) => {
      let card: LeadKanbanCardView | undefined;
      const cleared = prev.columns.map((col) => {
        const idx = col.items.findIndex((c) => c.id === leadId);
        if (idx === -1) return col;
        card = { ...col.items[idx], status: toStatus };
        const items = [...col.items];
        items.splice(idx, 1);
        return { ...col, items, total: Math.max(0, col.total - 1) };
      });
      if (!card) return prev;
      const moved: LeadKanbanCardView = card;
      return {
        columns: cleared.map((col) => {
          if (col.status !== toStatus) return col;
          return { ...col, items: [moved, ...col.items], total: col.total + 1 };
        }),
      };
    });
  }

  async function handleDrop(e: DragEvent, toStatus: LeadStatus) {
    e.preventDefault();
    setHoverStatus(null);
    const leadId = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    if (!leadId) return;
    const fromCol = data.columns.find((c) => c.items.some((i) => i.id === leadId));
    if (!fromCol || fromCol.status === toStatus) return;
    moveLeadOptimistic(leadId, toStatus);
    startTransition(async () => {
      const r = await moveLeadAction(leadId, toStatus);
      if (!r.ok) {
        toast.error(`Не удалось перенести лид: ${r.code ?? 'error'}`);
        // Refresh to recover from optimistic state.
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex min-w-full gap-3">
        {STATUS_ORDER.map((status) => {
          const col = data.columns.find((c) => c.status === status);
          const items = col?.items ?? [];
          const total = col?.total ?? 0;
          const isHover = hoverStatus === status;
          return (
            <div
              key={status}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
              className={cn(
                'flex w-72 shrink-0 flex-col rounded-md border bg-card transition-colors',
                isHover ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      STATUS_COLORS[status].replace('border-l-', 'bg-'),
                    )}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {t(`status.${status}`)}
                  </span>
                </div>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {total}
                </span>
              </div>

              <div className="flex max-h-[calc(100vh-260px)] flex-col gap-2 overflow-y-auto p-2">
                {items.length === 0 ? (
                  <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                    {t('leads.noLeads')}
                  </div>
                ) : (
                  items.map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      isDragging={draggingId === card.id}
                    />
                  ))
                )}
                {col && col.total > items.length ? (
                  <div className="px-2 py-1 text-center text-xs text-muted-foreground">
                    +{col.total - items.length} more
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  card,
  onDragStart,
  isDragging,
}: {
  card: LeadKanbanCardView;
  onDragStart: (e: DragEvent) => void;
  isDragging: boolean;
}) {
  const subtitle =
    card.telegramUsername
      ? `@${card.telegramUsername.replace(/^@/, '')}`
      : card.ownerEmail ?? '';
  return (
    <Link
      href={`/crm/leads/${card.id}`}
      draggable
      onDragStart={onDragStart}
      className={cn(
        'group block rounded-md border-l-2 border-y border-r border-border bg-background p-2.5 text-left transition-all',
        STATUS_COLORS[card.status],
        isDragging
          ? 'opacity-40 ring-2 ring-primary'
          : 'hover:border-primary/50 hover:shadow-md',
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="line-clamp-2 text-sm font-medium leading-tight">
          {card.name}
        </div>
        {card.score > 0 ? (
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
            {card.score}
          </span>
        ) : null}
      </div>
      {subtitle ? (
        <div className="mb-1 truncate font-mono text-xs text-muted-foreground">
          {subtitle}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">
          {card.source?.name ?? card.type.replace(/_/g, ' ').toLowerCase()}
        </span>
        <span className="shrink-0">
          {new Date(card.statusChangedAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
