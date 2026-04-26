'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type PriceType,
  type ProviderAdminView,
  type RateCardView,
} from '@/lib/server-api';
import {
  createRateCardAction,
  updateRateCardAction,
} from '@/app/[locale]/(admin)/admin/rate-cards/actions';

interface Props {
  mode: 'create' | 'edit';
  card?: RateCardView;
  providers: ProviderAdminView[];
}

const PRICE_TYPES: PriceType[] = [
  'PER_REQUEST',
  'PER_SECOND',
  'PER_TOKEN_INPUT',
  'PER_TOKEN_OUTPUT',
  'PER_IMAGE',
  'CUSTOM',
];

export function RateCardForm({ mode, card, providers }: Props) {
  const t = useTranslations('admin.rateCards');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [providerId, setProviderId] = useState(card?.providerId ?? providers[0]?.id ?? '');
  const [modelId, setModelId] = useState(card?.modelId ?? '');
  const [methodId, setMethodId] = useState(card?.methodId ?? '');
  const [mode_, setMode] = useState(card?.mode ?? '');
  const [resolution, setResolution] = useState(card?.resolution ?? '');
  const [duration, setDuration] = useState(card?.durationSeconds?.toString() ?? '');
  const [aspect, setAspect] = useState(card?.aspectRatio ?? '');
  const [priceType, setPriceType] = useState<PriceType>(card?.priceType ?? 'PER_REQUEST');
  const [providerCost, setProviderCost] = useState(card?.providerCostUnits ?? '');
  const [perSecond, setPerSecond] = useState(card?.pricePerSecond ?? '');
  const [perImage, setPerImage] = useState(card?.pricePerImage ?? '');
  const [perTokenIn, setPerTokenIn] = useState(card?.pricePerTokenInput ?? '');
  const [perTokenOut, setPerTokenOut] = useState(card?.pricePerTokenOutput ?? '');
  const [isActive, setIsActive] = useState(card?.isActive ?? true);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = {
      providerId,
      modelId: modelId.trim() || undefined,
      methodId: methodId.trim() || undefined,
      mode: mode_.trim() || undefined,
      resolution: resolution.trim() || undefined,
      durationSeconds: duration ? Number(duration) : undefined,
      aspectRatio: aspect.trim() || undefined,
      priceType,
      providerCostUnits: providerCost.trim() || undefined,
      pricePerSecond: perSecond.trim() || undefined,
      pricePerImage: perImage.trim() || undefined,
      pricePerTokenInput: perTokenIn.trim() || undefined,
      pricePerTokenOutput: perTokenOut.trim() || undefined,
      isActive,
    };

    startTransition(async () => {
      const res =
        mode === 'create'
          ? await createRateCardAction(body)
          : await updateRateCardAction(card!.id, body);
      if (res.ok) {
        toast.success(t('saved'));
        router.push('/admin/rate-cards');
      } else {
        toast.error(t('saveFailed'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('fieldProvider')}</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.publicName} ({p.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('fieldModel')}</Label>
          <Input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="model_..." />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldMethod')}</Label>
          <Input value={methodId} onChange={(e) => setMethodId(e.target.value)} placeholder="method_..." />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="space-y-2">
          <Label>{t('fieldMode')}</Label>
          <Input value={mode_} onChange={(e) => setMode(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldResolution')}</Label>
          <Input value={resolution} onChange={(e) => setResolution(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldDuration')}</Label>
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldAspect')}</Label>
          <Input value={aspect} onChange={(e) => setAspect(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('fieldPriceType')}</Label>
        <Select value={priceType} onValueChange={(v) => setPriceType(v as PriceType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRICE_TYPES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('fieldProviderCost')}</Label>
          <Input
            value={providerCost}
            onChange={(e) => setProviderCost(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldPricePerSecond')}</Label>
          <Input value={perSecond} onChange={(e) => setPerSecond(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldPricePerImage')}</Label>
          <Input value={perImage} onChange={(e) => setPerImage(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldPricePerTokenInput')}</Label>
          <Input value={perTokenIn} onChange={(e) => setPerTokenIn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldPricePerTokenOutput')}</Label>
          <Input value={perTokenOut} onChange={(e) => setPerTokenOut(e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4"
        />
        {t('fieldActive')}
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon('loading') : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
