import { Skeleton } from '@/components/ui';

/**
 * Route-level loading state.
 *
 * A skeleton that mirrors the shape of a typical page, so the layout does not
 * jump when the real content arrives. `aria-busy` tells assistive technology
 * that content is on its way rather than missing.
 */
export default function Loading() {
  return (
    <div className="container-page py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="max-w-2xl space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border p-4">
            <Skeleton className="aspect-[16/9] w-full" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
