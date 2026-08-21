import type { Metadata } from 'next';
import { MenusClient } from '@/components/admin/menus-client';

export const metadata: Metadata = {
  title: 'Navigation',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MenusClient />;
}
