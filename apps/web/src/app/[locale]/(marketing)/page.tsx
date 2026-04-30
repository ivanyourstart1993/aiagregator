import { Hero } from '@/components/marketing/Hero';
import { Providers } from '@/components/marketing/Providers';
import { Features } from '@/components/marketing/Features';
import { CodeExample } from '@/components/marketing/CodeExample';
import { Pricing } from '@/components/marketing/Pricing';
import { CTABand } from '@/components/marketing/CTABand';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Providers />
      <Features />
      <CodeExample />
      <Pricing />
      <CTABand />
    </>
  );
}
