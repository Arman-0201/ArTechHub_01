import { z } from 'zod';
import { localeSchema } from './common.js';

/**
 * Password policy.
 *
 * Length is the dominant factor, so the floor is 10 rather than 8, with a
 * character-class requirement to block the most obvious dictionary passwords.
 * The upper bound exists because bcrypt silently truncates beyond 72 bytes —
 * accepting longer input would create a false sense of strength.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => /[a-z]/.test(value), 'Include at least one lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Include at least one uppercase letter')
  .refine((value) => /[0-9]/.test(value), 'Include at least one number');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(255)
  .email('Enter a valid email address');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters');

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    locale: localeSchema.optional(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms of Service' }),
    }),
    acceptedPrivacy: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Privacy Policy' }),
    }),
    marketingOptIn: z.boolean().default(false),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(72),
  rememberMe: z.boolean().default(true),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, 'Invalid reset token').max(256),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(72),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Choose a password you have not used before',
    path: ['newPassword'],
  });

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(256),
});

export const requestOtpSchema = z.object({ email: emailSchema });

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Enter the 6-digit code'),
});

export const oauthProviderSchema = z.enum(['google', 'github']);

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  headline: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  avatarMediaId: z.string().max(64).nullable().optional(),
  locale: localeSchema.optional(),
});

export const updatePreferencesSchema = z.object({
  locale: localeSchema.optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  emailNotifications: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});
