'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  addLeadNoteAction,
  deleteLeadAction,
  moveLeadAction,
} from '@/app/[locale]/(panel)/crm/actions';
import { type LeadStatus } from '@/lib/server-api';

const STATUSES: LeadStatus[] = [
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

export function LeadActionsBar({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: LeadStatus;
}) {
  const t = useTranslations('crm');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [noteText, setNoteText] = useState('');

  function handleMove(toStatus: string) {
    if (toStatus === currentStatus) return;
    startTransition(async () => {
      const r = await moveLeadAction(leadId, toStatus as LeadStatus);
      if (r.ok) {
        toast.success('Статус обновлён');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    startTransition(async () => {
      const r = await addLeadNoteAction(leadId, noteText.trim());
      if (r.ok) {
        toast.success('Заметка добавлена');
        setNoteText('');
        router.refresh();
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const r = await deleteLeadAction(leadId);
      if (r.ok) {
        toast.success('Лид удалён');
        router.push('/crm/leads');
      } else {
        toast.error(`Ошибка: ${r.code ?? 'error'}`);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('leads.moveTo')}
        </label>
        <Select value={currentStatus} onValueChange={handleMove}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('leads.addNote')}
        </label>
        <Textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          placeholder="Заметка для команды…"
        />
        <Button
          type="button"
          size="sm"
          className="mt-2 w-full"
          disabled={!noteText.trim()}
          onClick={handleAddNote}
        >
          Добавить заметку
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="sm" className="w-full">
              Удалить лид
            </Button>
          }
          title="Удалить лид?"
          description="Это удалит карточку и всю переписку. Действие необратимо."
          confirmLabel="Удалить"
          variant="destructive"
          onConfirm={handleDelete}
        />
      </div>
    </div>
  );
}
