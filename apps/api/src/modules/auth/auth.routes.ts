import { Router } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyOtpSchema,
} from '@academy/validation';
import { asyncHandler } from '../../lib/http.js';
import { validateBody } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  emailVerificationLimiter,
  loginLimiter,
  otpLimiter,
  passwordResetLimiter,
  refreshLimiter,
  registerLimiter,
} from '../../middleware/rate-limit.js';
import * as controller from './auth.controller.js';

/**
 * Routes are thin wiring: rate limit -> validate -> controller.
 * Every credential-accepting endpoint carries its own limiter, because the
 * global limiter is far too permissive to stop credential stuffing on its own.
 */
export const authRouter: Router = Router();

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  asyncHandler(controller.register),
);

authRouter.post('/login', loginLimiter, validateBody(loginSchema), asyncHandler(controller.login));

authRouter.post('/refresh', refreshLimiter, asyncHandler(controller.refresh));

authRouter.post('/logout', asyncHandler(controller.logout));

authRouter.post('/logout-all', authenticate, asyncHandler(controller.logoutEverywhere));

authRouter.get('/me', authenticate, asyncHandler(controller.me));

// Read-only, cookie-authenticated, no rotation. Used by the Next server to
// identify the visitor while rendering; see `controller.session`.
authRouter.get('/session', asyncHandler(controller.session));

authRouter.post(
  '/verify-email',
  emailVerificationLimiter,
  validateBody(verifyEmailSchema),
  asyncHandler(controller.verifyEmail),
);

authRouter.post(
  '/resend-verification',
  emailVerificationLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(controller.resendVerification),
);

authRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(controller.forgotPassword),
);

authRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(controller.resetPassword),
);

authRouter.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(controller.changePassword),
);

authRouter.post(
  '/otp/request',
  otpLimiter,
  validateBody(requestOtpSchema),
  asyncHandler(controller.requestOtp),
);

authRouter.post(
  '/otp/verify',
  otpLimiter,
  validateBody(verifyOtpSchema),
  asyncHandler(controller.verifyOtp),
);

authRouter.get('/oauth/providers', controller.listProviders);
authRouter.get('/oauth/:provider/start', asyncHandler(controller.oauthStart));
authRouter.get('/oauth/:provider/callback', asyncHandler(controller.oauthCallback));
