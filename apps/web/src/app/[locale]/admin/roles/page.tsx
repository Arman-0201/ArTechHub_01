import type { Metadata } from 'next';
import { RolesClient } from '@/components/admin/roles-client';

export const metadata: Metadata = {
  title: 'Roles',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <RolesClient />;
}
