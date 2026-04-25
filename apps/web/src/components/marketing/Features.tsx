import { useTranslations } from 'next-intl';
import { Plug, Wallet, Sliders, ListChecks, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Feature {
  icon: LucideIcon;
  titleKey: 'feature1Title' | 'feature2Title' | 'feature3Title' | 'feature4Title';
  bodyKey: 'feature1Description' | 'feature2Description' | 'feature3Description' | 'feature4Description';
}

const FEATURES: Feature[] = [
  { icon: Plug, titleKey: 'feature1Title', bodyKey: 'feature1Description' },
  { icon: Wallet, titleKey: 'feature2Title', bodyKey: 'feature2Description' },
  { icon: Sliders, titleKey: 'feature3Title', bodyKey: 'feature3Description' },
  { icon: ListChecks, titleKey: 'feature4Title', bodyKey: 'feature4Description' },
];

export function Features() {
  const t = useTranslations('marketing');
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-center text-3xl font-semibold">{t('featuresTitle')}</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, titleKey, bodyKey }) => (
          <Card key={titleKey}>
            <CardHeader>
              <Icon className="h-6 w-6 text-primary" />
              <CardTitle className="text-lg">{t(titleKey)}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{t(bodyKey)}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
