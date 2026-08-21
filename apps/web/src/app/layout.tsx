import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Root layout.
 *
 * Deliberately minimal: the locale layout below it owns `<html lang>`, the
 * providers and the page chrome. This one exists because Next requires a root,
 * and to hold the document-level metadata defaults.
 */

export const metadata: Metadata = {
  title: {
    default: 'Academy',
    template: '%s · Academy',
  },
  description: 'Practical IT courses with progress tracking.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is left unrestricted: capping it breaks the platform for anyone who
  // needs to magnify text.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#060c22' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
