import {
  Plug,
  Wallet,
  Sliders,
  ListChecks,
  ShieldCheck,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Feature {
  icon: LucideIcon;
  titleKey:
    | 'feature1Title'
    | 'feature2Title'
    | 'feature3Title'
    | 'feature4Title'
    | 'feature5Title'
    | 'feature6Title';
  bodyKey:
    | 'feature1Description'
    | 'feature2Description'
    | 'feature3Description'
    | 'feature4Description'
    | 'feature5Description'
    | 'feature6Description';
  tone: 'info' | 'success' | 'warning' | 'default';
}

const FEATURES: Feature[] = [
  { icon: Plug, titleKey: 'feature1Title', bodyKey: 'feature1Description', tone: 'info' },
  { icon: Wallet, titleKey: 'feature2Title', bodyKey: 'feature2Description', tone: 'success' },
  { icon: Sliders, titleKey: 'feature3Title', bodyKey: 'feature3Description', tone: 'default' },
  { icon: ListChecks, titleKey: 'feature4Title', bodyKey: 'feature4Description', tone: 'info' },
  { icon: Webhook, titleKey: 'feature5Title', bodyKey: 'feature5Description', tone: 'warning' },
  { icon: ShieldCheck, titleKey: 'feature6Title', bodyKey: 'feature6Description', tone: 'success' },
];

const TONE_BG: Record<Feature['tone'], string> = {
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  default: 'bg-muted text-foreground/80',
};

export function Features() {
  const t = useTranslations('marketing');
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-info">{t('featuresEyebrow')}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('featuresTitle')}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t('featuresSubtitle')}
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, titleKey, bodyKey, tone }) => (
          <article
            key={titleKey}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-border hover:bg-card"
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONE_BG[tone]}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{t(titleKey)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
