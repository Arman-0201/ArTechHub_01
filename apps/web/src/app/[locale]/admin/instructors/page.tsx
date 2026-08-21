import type { Metadata } from 'next';
import { InstructorsClient } from '@/components/admin/instructors-client';

export const metadata: Metadata = {
  title: 'Instructors',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <InstructorsClient />;
}
