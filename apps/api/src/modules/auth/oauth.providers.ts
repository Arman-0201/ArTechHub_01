import { env } from '../../config/env.js';
import { BadRequestError } from '../../lib/errors.js';
import type { OAuthProfile } from './auth.service.js';

/**
 * OAuth provider registry.
 *
 * Each provider is described by data plus two small functions, so adding a
 * third (GitLab, Microsoft, LinkedIn) means adding one entry here — no changes
 * to the controller, routes or service.
 *
 * The flow is the standard authorization-code grant executed entirely
 * server-side: the client secret and the exchanged tokens never reach the
 * browser, and the browser only ever receives the resulting session cookie.
 */

export type OAuthProviderId = 'google' | 'github';

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  isEnabled: () => boolean;
  clientId: () => string;
  clientSecret: () => string;
  /** Extra parameters appended to the authorization request. */
  extraAuthParams?: Record<string, string>;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new BadRequestError('The sign-in provider rejected the request');
  }
  return (await response.json()) as T;
}

const google: OAuthProviderConfig = {
  id: 'google',
  label: 'Google',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'openid email profile',
  extraAuthParams: { access_type: 'online', prompt: 'select_account' },
  isEnabled: () => env.oauth.google.enabled,
  clientId: () => env.oauth.google.clientId ?? '',
  clientSecret: () => env.oauth.google.clientSecret ?? '',
  async fetchProfile(accessToken) {
    const profile = await fetchJson<{
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    }>('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    return {
      provider: 'google',
      providerUserId: profile.sub,
      email: profile.email ?? null,
      name: profile.name ?? profile.email?.split('@')[0] ?? 'Learner',
      avatarUrl: profile.picture ?? null,
      emailVerified: profile.email_verified === true,
    };
  },
};

const github: OAuthProviderConfig = {
  id: 'github',
  label: 'GitHub',
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scope: 'read:user user:email',
  isEnabled: () => env.oauth.github.enabled,
  clientId: () => env.oauth.github.clientId ?? '',
  clientSecret: () => env.oauth.github.clientSecret ?? '',
  async fetchProfile(accessToken) {
    const headers = {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'academy-platform',
    };

    const profile = await fetchJson<{
      id: number;
      login: string;
      name?: string | null;
      avatar_url?: string;
    }>('https://api.github.com/user', { headers });

    // GitHub omits the email from /user unless it is public, so the verified
    // primary address is fetched separately. An unverified address is treated
    // as no address at all — see `resolveOAuthUser`.
    const emails = await fetchJson<{ email: string; primary: boolean; verified: boolean }[]>(
      'https://api.github.com/user/emails',
      { headers },
    ).catch(() => []);

    const primary = emails.find((entry) => entry.primary && entry.verified) ?? emails.find((entry) => entry.verified);

    return {
      provider: 'github',
      providerUserId: String(profile.id),
      email: primary?.email ?? null,
      name: profile.name ?? profile.login,
      avatarUrl: profile.avatar_url ?? null,
      emailVerified: Boolean(primary),
    };
  },
};

const PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = { google, github };

export function getOAuthProvider(id: string): OAuthProviderConfig {
  const provider = PROVIDERS[id as OAuthProviderId];
  if (!provider) throw new BadRequestError('Unknown sign-in provider');
  if (!provider.isEnabled()) {
    throw new BadRequestError(`${provider.label} sign-in is not configured`);
  }
  return provider;
}

export function listEnabledProviders(): { id: OAuthProviderId; label: string }[] {
  return Object.values(PROVIDERS)
    .filter((provider) => provider.isEnabled())
    .map((provider) => ({ id: provider.id, label: provider.label }));
}

export function buildCallbackUrl(provider: OAuthProviderId): string {
  return `${env.API_PUBLIC_URL.replace(/\/+$/, '')}/api/v1/auth/oauth/${provider}/callback`;
}

export function buildAuthorizeUrl(provider: OAuthProviderConfig, state: string): string {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set('client_id', provider.clientId());
  url.searchParams.set('redirect_uri', buildCallbackUrl(provider.id));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', provider.scope);
  url.searchParams.set('state', state);
  for (const [key, value] of Object.entries(provider.extraAuthParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function exchangeCodeForToken(
  provider: OAuthProviderConfig,
  code: string,
): Promise<string> {
  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: provider.clientId(),
      client_secret: provider.clientSecret(),
      code,
      redirect_uri: buildCallbackUrl(provider.id),
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!response.ok) {
    throw new BadRequestError('Could not complete sign-in with this provider');
  }

  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!payload.access_token) {
    throw new BadRequestError('Could not complete sign-in with this provider');
  }
  return payload.access_token;
}
