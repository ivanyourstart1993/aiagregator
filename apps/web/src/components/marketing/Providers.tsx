import { Banana, Clapperboard, Image as ImageIcon, Music, Type, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ProviderBadge {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PROVIDERS: ProviderBadge[] = [
  { name: 'Google Banana', icon: Banana },
  { name: 'Google Veo', icon: Video },
  { name: 'Kling AI', icon: Clapperboard },
  { name: 'Imagen', icon: ImageIcon },
  { name: 'Suno', icon: Music },
  { name: 'GPT', icon: Type },
];

export function Providers() {
  const t = useTranslations('marketing.providers');
  return (
    <section id="providers" className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6">
      <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t('label')}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        {PROVIDERS.map(({ name, icon: Icon }) => (
          <div
            key={name}
            className="group flex items-center gap-2 text-sm text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <Icon className="h-4 w-4 transition-colors group-hover:text-info" />
            <span className="font-medium">{name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
