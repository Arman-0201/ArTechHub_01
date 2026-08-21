import type { Metadata } from 'next';
import { FeaturesClient } from '@/components/admin/features-client';

export const metadata: Metadata = {
  title: 'Features',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <FeaturesClient />;
}
