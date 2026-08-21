import { describe, expect, it } from 'vitest';
import '../setup.js';
import {
  linkTargetSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  richTextDocumentSchema,
  slugSchema,
  listQuerySchema,
  checkoutSchema,
} from '@academy/validation';
import { resolveLocaleChain, PERMISSION_GROUPS, ALL_PERMISSIONS } from '@academy/types';
import { slugify } from '../../src/lib/slug.js';
import { estimateReadingMinutes } from '../../src/modules/lessons/lessons.service.js';

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordSchema.safeParse('Str0ngPassword').success).toBe(true);
  });

  it('rejects short, single-case and digit-free passwords', () => {
    expect(passwordSchema.safeParse('Short1').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase1').success).toBe(false);
    expect(passwordSchema.safeParse('ALLUPPERCASE1').success).toBe(false);
    expect(passwordSchema.safeParse('NoDigitsHere').success).toBe(false);
  });

  it('rejects a password beyond bcrypt truncation length', () => {
    // Anything past 72 bytes is silently ignored by bcrypt, so accepting it
    // would give a false sense of strength.
    expect(passwordSchema.safeParse(`A1${'a'.repeat(80)}`).success).toBe(false);
  });
});

describe('registration schema', () => {
  const valid = {
    name: 'Ada Lovelace',
    email: 'Ada@Example.COM',
    password: 'Str0ngPassword',
    confirmPassword: 'Str0ngPassword',
    acceptedTerms: true,
    acceptedPrivacy: true,
    marketingOptIn: false,
  };

  it('normalises the email to lowercase', () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('ada@example.com');
  });

  it('requires the passwords to match', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'Different1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('confirmPassword'))).toBe(true);
    }
  });

  it('requires both legal acceptances', () => {
    expect(registerSchema.safeParse({ ...valid, acceptedTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, acceptedPrivacy: false }).success).toBe(false);
  });
});

describe('login schema', () => {
  it('does not enforce the password policy on sign-in', () => {
    // Existing accounts may predate a policy change; only registration and
    // reset should enforce it.
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'old' }).success).toBe(true);
  });
});

describe('slug validation', () => {
  it('accepts lowercase hyphenated slugs', () => {
    expect(slugSchema.safeParse('react-from-zero').success).toBe(true);
  });

  it('rejects paths, uppercase and double hyphens', () => {
    expect(slugSchema.safeParse('../etc/passwd').success).toBe(false);
    expect(slugSchema.safeParse('React').success).toBe(false);
    expect(slugSchema.safeParse('a--b').success).toBe(false);
    expect(slugSchema.safeParse('-leading').success).toBe(false);
  });
});

describe('slug generation', () => {
  it('slugifies Latin text', () => {
    expect(slugify('Networking Fundamentals from Zero')).toBe(
      'networking-fundamentals-from-zero',
    );
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Créer une application')).toBe('creer-une-application');
  });

  it('transliterates Armenian and Cyrillic instead of producing an empty slug', () => {
    expect(slugify('Ցանցեր')).not.toBe('');
    expect(slugify('Основы сетей')).not.toBe('');
    expect(slugify('Основы сетей')).toMatch(/^[a-z0-9-]+$/);
  });

  it('never emits leading or trailing hyphens', () => {
    const result = slugify('  ***Hello, World!!!  ');
    expect(result).toBe('hello-world');
  });
});

describe('link target validation', () => {
  it('accepts site-relative paths and http(s) URLs', () => {
    expect(linkTargetSchema.safeParse('/courses').success).toBe(true);
    expect(linkTargetSchema.safeParse('https://example.com').success).toBe(true);
    expect(linkTargetSchema.safeParse('#section').success).toBe(true);
  });

  it('rejects javascript: and other schemes', () => {
    // This is the check that stops a stored CMS link becoming an XSS sink.
    expect(linkTargetSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(linkTargetSchema.safeParse('data:text/html,x').success).toBe(false);
    expect(linkTargetSchema.safeParse('file:///etc/passwd').success).toBe(false);
  });
});

describe('rich text validation', () => {
  it('accepts a well-formed document', () => {
    const document = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] },
        { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: 'ls' }] },
      ],
    };
    expect(richTextDocumentSchema.safeParse(document).success).toBe(true);
  });

  it('rejects a javascript: link mark', () => {
    const document = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'click', marks: [{ type: 'link', href: 'javascript:alert(1)' }] },
          ],
        },
      ],
    };
    expect(richTextDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects an image with an unsafe source', () => {
    const document = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }],
    };
    expect(richTextDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects an unknown node type', () => {
    const document = { type: 'doc', content: [{ type: 'script', content: [] }] };
    expect(richTextDocumentSchema.safeParse(document).success).toBe(false);
  });
});

describe('list query', () => {
  it('applies defaults and coerces strings', () => {
    const result = listQuerySchema.safeParse({ page: '2', pageSize: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
      expect(result.data.order).toBe('desc');
    }
  });

  it('caps the page size so one request cannot pull the whole table', () => {
    expect(listQuerySchema.safeParse({ pageSize: '5000' }).success).toBe(false);
  });

  it('rejects a sort field containing SQL-ish characters', () => {
    expect(listQuerySchema.safeParse({ sort: 'name; DROP TABLE users' }).success).toBe(false);
  });
});

describe('checkout schema', () => {
  it('requires at least one line', () => {
    const result = checkoutSchema.safeParse({
      lines: [],
      customer: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts ids and quantities only — never prices', () => {
    const result = checkoutSchema.safeParse({
      lines: [{ productId: 'p1', quantity: 2, unitPriceCents: 1 }],
      customer: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // A price smuggled into the payload is stripped, so it can never
      // influence the order total.
      expect(result.data.lines[0]).not.toHaveProperty('unitPriceCents');
    }
  });
});

describe('locale fallback chain', () => {
  it('falls back from a variant to its base language, then the default', () => {
    expect(resolveLocaleChain('en-GB')).toEqual(['en-GB', 'en']);
  });

  it('falls back from a non-default language to English', () => {
    expect(resolveLocaleChain('hy')).toEqual(['hy', 'en']);
  });

  it('returns just the default for the default', () => {
    expect(resolveLocaleChain('en')).toEqual(['en']);
  });
});

describe('permission catalogue', () => {
  it('lists every permission in exactly one group', () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) =>
      group.permissions.map((entry) => entry.key),
    );

    expect(new Set(grouped).size).toBe(grouped.length);
    for (const permission of ALL_PERMISSIONS) {
      expect(grouped).toContain(permission);
    }
  });
});

describe('reading time estimation', () => {
  it('returns at least one minute for short content', () => {
    expect(estimateReadingMinutes({ type: 'doc', content: [] })).toBe(1);
    expect(estimateReadingMinutes(null)).toBe(1);
  });

  it('scales with word count at roughly 200 words per minute', () => {
    const words = Array.from({ length: 600 }, () => 'word').join(' ');
    const document = {
      type: 'doc' as const,
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: words }] }],
    };
    expect(estimateReadingMinutes(document)).toBe(3);
  });
});
