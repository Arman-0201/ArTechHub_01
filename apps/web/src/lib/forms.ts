import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ApiFieldErrors } from '@academy/types';

/**
 * Maps the API's field errors onto a React Hook Form instance.
 *
 * The server is the authority on validation, so when it rejects a submission
 * the errors are shown next to the offending inputs rather than as one opaque
 * banner. Errors for paths the form does not have are collected into the root,
 * so nothing the server said is silently discarded.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  fields: ApiFieldErrors,
  setError: UseFormSetError<T>,
  knownFields?: string[],
): void {
  for (const [path, messages] of Object.entries(fields)) {
    const message = messages[0];
    if (!message) continue;

    if (path === '_root' || (knownFields && !knownFields.includes(path))) {
      setError('root' as Path<T>, { type: 'server', message });
      continue;
    }

    setError(path as Path<T>, { type: 'server', message });
  }
}

/** Extracts a single readable message from an API error payload. */
export function firstFieldError(fields: ApiFieldErrors | undefined): string | null {
  if (!fields) return null;
  for (const messages of Object.values(fields)) {
    if (messages[0]) return messages[0];
  }
  return null;
}
