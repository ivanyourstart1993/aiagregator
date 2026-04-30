import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI API Aggregator — Panel',
  description: 'Admin panel for AI API Aggregator.',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
