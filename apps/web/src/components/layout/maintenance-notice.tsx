import { Wrench } from 'lucide-react';

/**
 * Maintenance screen for public visitors.
 *
 * Rendered instead of the whole layout when maintenance mode is on and the
 * viewer is not staff. The API enforces the same rule independently, so this is
 * the presentation of a decision, not the decision itself.
 */
export function MaintenanceNotice({
  siteName,
  message,
}: {
  siteName: string;
  message: string | null;
}) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="max-w-md space-y-5 text-center">
        <span
          className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary"
          aria-hidden="true"
        >
          <Wrench className="size-7" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text-primary">
            {siteName} is briefly offline
          </h1>
          <p className="text-text-secondary">
            {message ?? 'We are performing maintenance and will be back shortly.'}
          </p>
        </div>
      </div>
    </div>
  );
}
