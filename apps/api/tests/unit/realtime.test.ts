import { describe, expect, it } from 'vitest';
import '../setup.js';
import {
  FEATURE_DEFINITIONS,
  FEATURE_KEYS,
  PERMISSIONS,
  REALTIME_PUBLIC_CHANNELS,
  REALTIME_RESOURCES,
  REALTIME_RESOURCE_PERMISSION,
  type RealtimePublicChannel,
  type RealtimeResource,
} from '@academy/types';
import { publicChannelsForAction, resourcesForAction } from '../../src/realtime/events.js';
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
    expect(resourcesForAction(AUDIT_ACTIONS.MESSAGE_HANDLED)).toContain(
      REALTIME_RESOURCES.MESSAGES,
    );
    expect(resourcesForAction(AUDIT_ACTIONS.ORDER_STATUS_CHANGED)).toContain(
      REALTIME_RESOURCES.ORDERS,
    );
    // A lesson is not its own screen; it moves the course it belongs to.
    expect(resourcesForAction(AUDIT_ACTIONS.LESSON_UPDATED)).toContain(REALTIME_RESOURCES.COURSES);
  });

  /**
   * The actions that were once silent.
   *
   * Every one of these is a route that changed the database and told nobody —
   * not the audit log, not an admin screen, not the public site. They are
   * grouped here because the failure mode is quiet: a route that stops calling
   * `recordAudit` looks exactly like a route that never did.
   */
  it('moves the right screen for the changes that used to be silent', () => {
    const cases: [string, string][] = [
      [AUDIT_ACTIONS.MENU_ITEM_CREATED, REALTIME_RESOURCES.MENUS],
      [AUDIT_ACTIONS.MENU_ITEM_UPDATED, REALTIME_RESOURCES.MENUS],
      [AUDIT_ACTIONS.MENU_ITEM_DELETED, REALTIME_RESOURCES.MENUS],
      // The footer is navigation: same resource, no second mapping to drift.
      [AUDIT_ACTIONS.FOOTER_GROUP_CREATED, REALTIME_RESOURCES.MENUS],
      [AUDIT_ACTIONS.FOOTER_LINK_DELETED, REALTIME_RESOURCES.MENUS],
      // A module belongs to a course, and the course list shows its counts.
      [AUDIT_ACTIONS.MODULE_CREATED, REALTIME_RESOURCES.COURSES],
      [AUDIT_ACTIONS.MODULE_REORDERED, REALTIME_RESOURCES.COURSES],
      [AUDIT_ACTIONS.LESSON_REORDERED, REALTIME_RESOURCES.COURSES],
      [AUDIT_ACTIONS.INSTRUCTOR_UPDATED, REALTIME_RESOURCES.INSTRUCTORS],
      [AUDIT_ACTIONS.BLOG_CREATED, REALTIME_RESOURCES.BLOG],
      [AUDIT_ACTIONS.BLOG_DELETED, REALTIME_RESOURCES.BLOG],
      [AUDIT_ACTIONS.SECTION_DUPLICATED, REALTIME_RESOURCES.PAGES],
      [AUDIT_ACTIONS.LEGAL_UPDATED, REALTIME_RESOURCES.LEGAL],
      [AUDIT_ACTIONS.SEO_UPDATED, REALTIME_RESOURCES.SEO],
      [AUDIT_ACTIONS.MEDIA_UPDATED, REALTIME_RESOURCES.MEDIA],
      [AUDIT_ACTIONS.COLLECTION_CATEGORY_UPDATED, REALTIME_RESOURCES.COLLECTIONS],
    ];

    for (const [action, resource] of cases) {
      expect(resourcesForAction(action), `${action} does not move ${resource}`).toContain(resource);
    }
  });

  it('sends the visitor-facing ones to the public channel as well', () => {
    // Toggling a menu item's visibility is the case that motivated this: it
    // changes the navigation every anonymous visitor is looking at.
    expect(publicChannelsForAction(AUDIT_ACTIONS.MENU_ITEM_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.NAVIGATION,
    );
    expect(publicChannelsForAction(AUDIT_ACTIONS.FOOTER_LINK_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.NAVIGATION,
    );
    expect(publicChannelsForAction(AUDIT_ACTIONS.BLOG_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.CONTENT,
    );
    expect(publicChannelsForAction(AUDIT_ACTIONS.MODULE_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.CATALOG,
    );
    expect(publicChannelsForAction(AUDIT_ACTIONS.INSTRUCTOR_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.CATALOG,
    );
    // Metadata, but it is rendered into the page a visitor has open.
    expect(publicChannelsForAction(AUDIT_ACTIONS.SEO_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.CONTENT,
    );
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

/**
 * The public half of the feed reaches anonymous visitors, so what it declines
 * to say matters more than what it says. These pin the boundary: which actions
 * produce a public event at all, and that the ones which reveal internal
 * activity produce none.
 */
describe('public realtime channels', () => {
  const PUBLIC_CHANNELS = new Set<string>(Object.values(REALTIME_PUBLIC_CHANNELS));

  it('only ever emits channels the contract defines', () => {
    for (const action of Object.values(AUDIT_ACTIONS)) {
      for (const channel of publicChannelsForAction(action)) {
        expect(PUBLIC_CHANNELS.has(channel), `${action} emits unknown channel ${channel}`).toBe(
          true,
        );
      }
    }
  });

  it('tells visitors when something they can see moved', () => {
    expect(publicChannelsForAction(AUDIT_ACTIONS.COURSE_STATUS_CHANGED)).toContain(
      REALTIME_PUBLIC_CHANNELS.CATALOG,
    );
    // A section is part of a page, and a page is content.
    expect(publicChannelsForAction(AUDIT_ACTIONS.SECTION_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.CONTENT,
    );
    expect(publicChannelsForAction(AUDIT_ACTIONS.MENU_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.NAVIGATION,
    );
    expect(publicChannelsForAction(AUDIT_ACTIONS.PRODUCT_UPDATED)).toContain(
      REALTIME_PUBLIC_CHANNELS.COMMERCE,
    );
    // Turning a feature off changes what the site offers everyone.
    expect(publicChannelsForAction(AUDIT_ACTIONS.FEATURE_TOGGLED)).toContain(
      REALTIME_PUBLIC_CHANNELS.PLATFORM,
    );
  });

  it('says nothing to visitors about purely internal activity', () => {
    // Each of these would tell a stranger that staff are working, and on what.
    // None of them changes a single byte of what a visitor can read.
    const internal = [
      AUDIT_ACTIONS.USER_CREATED,
      AUDIT_ACTIONS.USER_ROLES_CHANGED,
      AUDIT_ACTIONS.USER_STATUS_CHANGED,
      AUDIT_ACTIONS.ROLE_UPDATED,
      AUDIT_ACTIONS.MEDIA_UPLOADED,
      AUDIT_ACTIONS.MEDIA_DELETED,
      AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
      AUDIT_ACTIONS.ENROLLMENT_CREATED,
      AUDIT_ACTIONS.ENROLLMENT_CANCELLED,
    ];

    for (const action of internal) {
      expect(publicChannelsForAction(action), `${action} leaked to the public feed`).toEqual([]);
    }
  });

  it('stays silent for an action it does not know', () => {
    // The opposite default to the admin map, and deliberately so: waking every
    // open page for a change nobody can see is worse than leaving it alone.
    expect(publicChannelsForAction('warehouse.restocked')).toEqual([]);
    expect(publicChannelsForAction('')).toEqual([]);
  });

  it('keeps the support inbox off the public feed entirely', () => {
    // Clearing a contact message is staff work on staff-only data. Telling a
    // visitor that the inbox moved would reveal something no public page shows,
    // and would re-render every open page to show them nothing.
    expect(publicChannelsForAction(AUDIT_ACTIONS.MESSAGE_HANDLED)).toEqual([]);
  });

  it('never repeats a channel, so one change refreshes a page once', () => {
    for (const action of Object.values(AUDIT_ACTIONS)) {
      const channels: RealtimePublicChannel[] = publicChannelsForAction(action);
      expect(new Set(channels).size, action).toBe(channels.length);
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
