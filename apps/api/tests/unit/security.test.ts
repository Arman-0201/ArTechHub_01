import { describe, expect, it } from 'vitest';
import '../setup.js';
import {
  generateOtpCode,
  generateOpaqueToken,
  hashPassword,
  hashToken,
  safeCompare,
  signStatePayload,
  verifyPassword,
  verifyStatePayload,
} from '../../src/lib/crypto.js';
import { signAccessToken, verifyAccessToken } from '../../src/lib/jwt.js';
import { AuthenticationError } from '../../src/lib/errors.js';
import { sanitizeRichHtml } from '../../src/lib/sanitize.js';

/**
 * Security primitives.
 *
 * These are the pieces that, if wrong, are wrong silently — a token that
 * verifies when it should not, or a sanitiser that lets a payload through.
 */

describe('password hashing', () => {
  it('produces a verifiable hash that is not the plaintext', async () => {
    const hash = await hashPassword('Correct-Horse-9');

    expect(hash).not.toContain('Correct-Horse-9');
    expect(hash.startsWith('$2')).toBe(true);
    await expect(verifyPassword('Correct-Horse-9', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('Correct-Horse-9');
    await expect(verifyPassword('Correct-Horse-8', hash)).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [first, second] = await Promise.all([
      hashPassword('Correct-Horse-9'),
      hashPassword('Correct-Horse-9'),
    ]);
    expect(first).not.toBe(second);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    await expect(verifyPassword('anything', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });
});

describe('token hashing', () => {
  it('is deterministic and does not reveal the token', () => {
    const token = generateOpaqueToken();
    const hash = hashToken(token);

    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('OTP generation', () => {
  it('always produces six digits, including with leading zeros', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateOtpCode()).toMatch(/^[0-9]{6}$/);
    }
  });
});

describe('constant-time comparison', () => {
  it('matches identical strings and rejects different ones', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true);
    expect(safeCompare('abc123', 'abc124')).toBe(false);
    // Different lengths must not throw.
    expect(safeCompare('abc', 'abcdef')).toBe(false);
  });
});

describe('signed state payloads', () => {
  it('round-trips a payload', () => {
    const state = signStatePayload({ provider: 'google', redirectTo: '/dashboard' });
    const parsed = verifyStatePayload<{ provider: string; redirectTo: string }>(state);

    expect(parsed?.provider).toBe('google');
    expect(parsed?.redirectTo).toBe('/dashboard');
  });

  it('rejects a tampered payload', () => {
    const state = signStatePayload({ provider: 'google', redirectTo: '/dashboard' });
    const [encoded, signature] = state.split('.');

    // Re-encode a different redirect while keeping the original signature.
    const forged = Buffer.from(
      JSON.stringify({
        provider: 'google',
        redirectTo: 'https://evil.example',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
      'utf8',
    ).toString('base64url');

    expect(verifyStatePayload(`${forged}.${signature}`)).toBeNull();
    expect(verifyStatePayload(`${encoded}.deadbeef`)).toBeNull();
    expect(verifyStatePayload('not-a-state')).toBeNull();
  });

  it('rejects an expired payload', () => {
    const state = signStatePayload({ provider: 'google' }, -1);
    expect(verifyStatePayload(state)).toBeNull();
  });
});

describe('access tokens', () => {
  it('round-trips subject and version', () => {
    const { token } = signAccessToken('user-123', 7);
    const claims = verifyAccessToken(token);

    expect(claims.sub).toBe('user-123');
    expect(claims.ver).toBe(7);
    expect(claims.typ).toBe('access');
  });

  it('rejects a token signed with a different secret', () => {
    // A token from another deployment must never verify here.
    const foreign =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjAsInR5cCI6ImFjY2VzcyIsInN1YiI6ImF0dGFja2VyIn0.' +
      'ZmFrZS1zaWduYXR1cmU';
    expect(() => verifyAccessToken(foreign)).toThrow(AuthenticationError);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyAccessToken('garbage')).toThrow(AuthenticationError);
  });
});

describe('HTML sanitiser', () => {
  it('strips script tags and their content', () => {
    const output = sanitizeRichHtml('<p>Safe</p><script>alert(1)</script>');
    expect(output).toContain('Safe');
    expect(output).not.toContain('script');
    expect(output).not.toContain('alert');
  });

  it('strips inline event handlers', () => {
    const output = sanitizeRichHtml('<img src="https://example.com/a.png" onerror="alert(1)">');
    expect(output).not.toContain('onerror');
    expect(output).not.toContain('alert');
  });

  it('drops javascript: and data: URLs', () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
    expect(sanitizeRichHtml('<a href="data:text/html,<script>">x</a>')).not.toContain('data:');
  });

  it('removes iframes, objects and forms', () => {
    const output = sanitizeRichHtml(
      '<iframe src="https://evil.example"></iframe><object></object><form><input></form>',
    );
    expect(output).not.toContain('iframe');
    expect(output).not.toContain('object');
    expect(output).not.toContain('<form');
    expect(output).not.toContain('<input');
  });

  it('keeps safe formatting and links', () => {
    const output = sanitizeRichHtml(
      '<h2>Title</h2><p><strong>Bold</strong> and <a href="https://example.com">a link</a></p>',
    );
    expect(output).toContain('<h2>Title</h2>');
    expect(output).toContain('<strong>Bold</strong>');
    expect(output).toContain('href="https://example.com"');
  });

  it('adds noopener to links that open in a new tab', () => {
    const output = sanitizeRichHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(output).toContain('rel="noopener noreferrer"');
  });
});
