'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { updateSettingAction } from '@/app/[locale]/(admin)/admin/settings/actions';

interface Props {
  settingKey: string;
  value: unknown;
}

export function SettingValueEditor({ settingKey, value }: Props) {
  const t = useTranslations('admin.settings');
  const tForm = useTranslations('admin.coupons.form');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [comment, setComment] = useState('');
  const [pending, startTransition] = useTransition();

  function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error(tForm('jsonInvalid'));
      return;
    }
    startTransition(async () => {
      const res = await updateSettingAction(settingKey, parsed, comment.trim() || undefined);
      if (res.ok) {
        toast.success(t('saved'));
        setEditing(false);
      } else {
        toast.error(t('saveFailed'));
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <pre className="flex-1 overflow-auto rounded bg-muted/40 p-2 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {t('edit')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="font-mono text-xs"
      />
      <Input
        placeholder={t('comment')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          {t('cancel')}
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
