'use client';

import { useMemo, useState } from 'react';

/**
 * Enrollment sparkline.
 *
 * Hand-drawn SVG rather than a charting library: the shape is a single series
 * of at most 30 points, and pulling in a chart dependency for that would add
 * far more bundle weight than the feature is worth.
 *
 * Accessibility: the SVG is decorative and the same numbers are available in a
 * visually-hidden table, so the data is reachable without sight or a pointer.
 */
export function EnrollmentTrendChart({
  data,
  locale,
}: {
  data: { date: string; count: number }[];
  locale: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const { points, areaPath, linePath, max } = useMemo(() => {
    const width = 100;
    const height = 100;
    const maxCount = Math.max(1, ...data.map((entry) => entry.count));

    const computed = data.map((entry, index) => ({
      x: data.length > 1 ? (index / (data.length - 1)) * width : width / 2,
      // SVG y grows downward, so the value is inverted.
      y: height - (entry.count / maxCount) * (height - 8) - 4,
      ...entry,
    }));

    const line = computed
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' ');

    const area =
      computed.length > 0
        ? `${line} L${width},${height} L0,${height} Z`
        : '';

    return { points: computed, linePath: line, areaPath: area, max: maxCount };
  }, [data]);

  if (data.length === 0) {
    return <p className="mt-6 text-sm text-text-muted">No enrollment data yet.</p>;
  }

  const active = hovered !== null ? points[hovered] : null;

  return (
    <div className="mt-5">
      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-40 w-full"
          role="img"
          aria-label={`Enrollment trend over ${data.length} days, peaking at ${max}`}
        >
          <defs>
            <linearGradient id="enrollment-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {areaPath ? <path d={areaPath} fill="url(#enrollment-area)" /> : null}

          <path
            d={linePath}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
            // Keeps the stroke a constant visual width despite the non-uniform
            // viewBox scaling.
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {active ? (
            <circle
              cx={active.x}
              cy={active.y}
              r="2"
              fill="var(--color-primary)"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {/* Invisible hover targets, one per day. */}
        <div className="absolute inset-0 flex" aria-hidden="true">
          {points.map((point, index) => (
            <button
              key={point.date}
              type="button"
              tabIndex={-1}
              className="h-full flex-1"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </div>

        {active ? (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs shadow-raised">
            <span className="font-semibold text-text-primary">{active.count}</span>{' '}
            <span className="text-text-muted">
              on {new Date(active.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-2xs text-text-muted">
        <span>
          {new Date(data[0]!.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
        </span>
        <span>
          {new Date(data[data.length - 1]!.date).toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>

      <table className="sr-only">
        <caption>Enrollments per day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Enrollments</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.date}>
              <td>{entry.date}</td>
              <td>{entry.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
