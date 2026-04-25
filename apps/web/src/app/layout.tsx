import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI API Aggregator',
  description: 'Single API gateway over external AI providers.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
