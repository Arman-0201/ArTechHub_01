import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthenticationError } from './errors.js';

/**
 * Access-token claims.
 *
 * Deliberately minimal: only what every request needs. Permissions are NOT in
 * the token — they are loaded per request from the database, so a role change
 * takes effect immediately instead of at the next token refresh.
 *
 * `ver` mirrors `User.tokenVersion`; bumping that column invalidates every
 * outstanding access token for the user (logout-everywhere, password change).
 */
export interface AccessTokenClaims {
  sub: string;
  ver: number;
  typ: 'access';
}

const ISSUER = 'academy-api';
const AUDIENCE = 'academy-web';

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export function signAccessToken(userId: string, tokenVersion: number): IssuedAccessToken {
  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: userId,
  };

  const token = jwt.sign({ ver: tokenVersion, typ: 'access' }, env.JWT_ACCESS_SECRET, options);
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 900_000);

  return { token, expiresAt };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload;

    if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
      throw new AuthenticationError('Invalid access token');
    }

    return {
      sub: payload.sub,
      ver: typeof payload.ver === 'number' ? payload.ver : 0,
      typ: 'access',
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Session expired');
    }
    throw new AuthenticationError('Invalid access token');
  }
}
