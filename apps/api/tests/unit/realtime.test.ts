import { describe, expect, it } from 'vitest';
import '../setup.js';
import {
  FEATURE_DEFINITIONS,
  FEATURE_KEYS,
  PERMISSIONS,
  REALTIME_RESOURCES,
  REALTIME_RESOURCE_PERMISSION,
  type RealtimeResource,
} from '@academy/types';
import { resourcesForAction } from '../../src/realtime/events.js';
import { AUDIT_ACTIONS } from '../../src/modules/audit/audit.service.js';
import { parseRange } from '../../src/lib/range.js';

/**
 * The two mechanisms behind live admin data and in-browser reading.
 *
 * Both fail quietly when they are wrong — an unmapped audit action leaves a
 * screen stale rather than throwing, and a mis-parsed range serves the wrong
 * bytes rather than an error — so they are worth pinning down directly.
 */

describe('realtime event mapping', () => {
  it('maps every audit action to at least one screen', () => {
    for (const action of Object.values(AUDIT_ACTIONS)) {
      const resources = resourcesForAction(action);
      expect(resources.length, `no resources mapped for ${action}`).toBeGreaterThan(0);
    }
  });

  it('routes each audit action to the screen that shows it', () => {
    expect(resourcesForAction(AUDIT_ACTIONS.USER_CREATED)).toContain(REALTIME_RESOURCES.USERS);
    expect(resourcesForAction(AUDIT_ACTIONS.ORDER_STATUS_CHANGED)).toContain(
      REALTIME_RESOURCES.ORDERS,
    );
    // A lesson is not its own screen; it moves the course it belongs to.
    expect(resourcesForAction(AUDIT_ACTIONS.LESSON_UPDATED)).toContain(REALTIME_RESOURCES.COURSES);
  });

  it('treats every change as also moving the audit log and the dashboard', () => {
    const resources = resourcesForAction(AUDIT_ACTIONS.SETTINGS_UPDATED);
    expect(resources).toContain(REALTIME_RESOURCES.AUDIT);
    expect(resources).toContain(REALTIME_RESOURCES.OVERVIEW);
  });

  it('degrades to the always-on resources for an action it does not know', () => {
    // A new module that adds an audit action without touching this map still
    // updates the audit log, rather than silently broadcasting nothing.
    expect(resourcesForAction('warehouse.restocked')).toEqual([
      REALTIME_RESOURCES.AUDIT,
      REALTIME_RESOURCES.OVERVIEW,
    ]);
  });

  it('never repeats a resource, so a client invalidates each key once', () => {
    for (const action of Object.values(AUDIT_ACTIONS)) {
      const resources = resourcesForAction(action);
      expect(new Set(resources).size).toBe(resources.length);
    }
  });

  it('gates every resource behind a permission that exists', () => {
    const known = new Set<string>(Object.values(PERMISSIONS));

    for (const resource of Object.values(REALTIME_RESOURCES) as RealtimeResource[]) {
      const permission = REALTIME_RESOURCE_PERMISSION[resource];
      expect(permission, `${resource} has no permission`).toBeDefined();
      expect(known.has(permission), `${resource} is gated by an unknown permission`).toBe(true);
    }
  });
});

describe('feature flags', () => {
  it('defines the PDF reader flag the stream route is gated on', () => {
    const definition = FEATURE_DEFINITIONS.find(
      (entry) => entry.key === FEATURE_KEYS.PDF_READER,
    );

    expect(definition).toBeDefined();
    expect(definition?.label).toBeTruthy();
  });
});

describe('byte range parsing', () => {
  const SIZE = 1000;

  it('treats a missing or unparseable header as a request for the whole file', () => {
    expect(parseRange(undefined, SIZE)).toBeNull();
    expect(parseRange('pages=1-2', SIZE)).toBeNull();
    expect(parseRange('bytes=-', SIZE)).toBeNull();
  });

  it('reads a closed range inclusively at both ends', () => {
    expect(parseRange('bytes=0-99', SIZE)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=500-999', SIZE)).toEqual({ start: 500, end: 999 });
  });

  it('reads an open range as running to the last byte', () => {
    expect(parseRange('bytes=900-', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('reads a suffix range from the end, which is how a PDF trailer is found', () => {
    expect(parseRange('bytes=-100', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('clamps a suffix longer than the file rather than reading before its start', () => {
    expect(parseRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('clamps an end past the last byte, as RFC 9110 requires', () => {
    expect(parseRange('bytes=990-5000', SIZE)).toEqual({ start: 990, end: 999 });
  });

  it('rejects a start at or past the end of the file', () => {
    expect(parseRange('bytes=1000-1100', SIZE)).toBe('unsatisfiable');
    expect(parseRange('bytes=5000-', SIZE)).toBe('unsatisfiable');
  });

  it('rejects an inverted range', () => {
    expect(parseRange('bytes=500-100', SIZE)).toBe('unsatisfiable');
  });

  it('never returns a range outside the file, whatever the header says', () => {
    const headers = [
      'bytes=0-0',
      'bytes=0-',
      'bytes=-1',
      'bytes=999-999',
      'bytes=1-999999',
      'bytes=-999999',
    ];

    for (const header of headers) {
      const range = parseRange(header, SIZE);
      expect(range, header).not.toBe('unsatisfiable');
      if (range && range !== 'unsatisfiable') {
        expect(range.start, header).toBeGreaterThanOrEqual(0);
        expect(range.end, header).toBeLessThan(SIZE);
        expect(range.end, header).toBeGreaterThanOrEqual(range.start);
      }
    }
  });
});
