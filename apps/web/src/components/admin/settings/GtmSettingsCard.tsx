'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateGtmAction } from '@/app/[locale]/(admin)/admin/settings/actions';

interface Props {
  initialContainerId: string;
  initialEnabled: boolean;
}

export function GtmSettingsCard({ initialContainerId, initialEnabled }: Props) {
  const [containerId, setContainerId] = useState(initialContainerId);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateGtmAction(containerId, enabled);
      if (res.ok) {
        toast.success('Google Tag Manager настройки сохранены');
      } else if (res.code === 'invalid_container_id') {
        toast.error('Неверный формат ID. Ожидается GTM-XXXXXXX');
      } else {
        toast.error('Не удалось сохранить настройки');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Tag Manager</CardTitle>
        <p className="text-sm text-muted-foreground">
          Container ID применяется ко всем страницам (публичные, dashboard, админка).
          Изменения подхватываются на следующем рендере страницы.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="gtm-container-id">Container ID</Label>
          <Input
            id="gtm-container-id"
            placeholder="GTM-XXXXXXX"
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={pending || containerId.trim().length === 0}
          />
          <Label>Включён</Label>
        </div>

        <div>
          <Button onClick={save} disabled={pending}>
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
