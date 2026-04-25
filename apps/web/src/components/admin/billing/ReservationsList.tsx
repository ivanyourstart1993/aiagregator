'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  captureReservationAction,
  releaseReservationAction,
} from '@/app/[locale]/(admin)/admin/users/[userId]/actions';
import { formatNanoToUSD } from '@/lib/money';
import type { ReservationView } from '@/lib/server-api';

interface Props {
  userId: string;
  reservations: ReservationView[];
}

export function ReservationsList({ userId, reservations }: Props) {
  const t = useTranslations('admin.billing.userPanel');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [captureOpen, setCaptureOpen] = useState<ReservationView | null>(null);
  const [captureUsd, setCaptureUsd] = useState('');

  function release(rid: string) {
    startTransition(async () => {
      const res = await releaseReservationAction({ userId, reservationId: rid });
      if (!res.ok) {
        toast.error(t('actionFailed'));
        return;
      }
      toast.success(t('actionSuccess'));
    });
  }

  function submitCapture() {
    if (!captureOpen) return;
    const reservation = captureOpen;
    const amount = captureUsd.trim() === '' ? undefined : Number(captureUsd);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error(t('actionFailed'));
      return;
    }
    startTransition(async () => {
      const res = await captureReservationAction({
        userId,
        reservationId: reservation.id,
        captureUsd: amount,
      });
      if (!res.ok) {
        toast.error(t('actionFailed'));
        return;
      }
      toast.success(t('actionSuccess'));
      setCaptureOpen(null);
      setCaptureUsd('');
    });
  }

  if (reservations.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        {t('noReservations')}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{t('reservationAmount')}</TableHead>
              <TableHead>{t('reservationStatus')}</TableHead>
              <TableHead>{t('reservationExpires')}</TableHead>
              <TableHead className="w-48 text-right">{t('reservationActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-right font-mono">
                  ${formatNanoToUSD(r.amountUnits)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format.dateTime(new Date(r.expiresAt), 'short')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || r.status !== 'PENDING'}
                      onClick={() => {
                        setCaptureOpen(r);
                        setCaptureUsd('');
                      }}
                    >
                      {t('capture')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending || r.status !== 'PENDING'}
                      onClick={() => release(r.id)}
                    >
                      {t('release')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={captureOpen !== null} onOpenChange={(o) => (!o ? setCaptureOpen(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('capture')}</DialogTitle>
            <DialogDescription>{t('captureUnitsHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="capture-amount">{t('captureUnits')}</Label>
            <Input
              id="capture-amount"
              type="number"
              step="0.01"
              min="0"
              value={captureUsd}
              onChange={(e) => setCaptureUsd(e.target.value)}
              placeholder=""
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCaptureOpen(null)}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="button" onClick={submitCapture} disabled={pending}>
              {t('capture')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
