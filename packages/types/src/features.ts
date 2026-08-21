/**
 * Feature flags are code-defined keys whose *state* lives in the database.
 * The backend enforces them (see `requireFeature`); the frontend only uses them
 * to avoid rendering links into disabled areas.
 */

export const FEATURE_KEYS = {
  BLOG: 'BLOG_ENABLED',
  SHOP: 'SHOP_ENABLED',
  INSTRUCTORS: 'INSTRUCTORS_ENABLED',
  FAQ: 'FAQ_ENABLED',
  NEWSLETTER: 'NEWSLETTER_ENABLED',
  COMMENTS: 'COMMENTS_ENABLED',
  REGISTRATION: 'REGISTRATION_ENABLED',
  OAUTH_GOOGLE: 'OAUTH_GOOGLE_ENABLED',
  OAUTH_GITHUB: 'OAUTH_GITHUB_ENABLED',
  CERTIFICATES: 'CERTIFICATES_ENABLED',
  SEARCH: 'SEARCH_ENABLED',
  CONTACT_FORM: 'CONTACT_FORM_ENABLED',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
  /** Public route prefixes blocked while the feature is off. */
  routes: string[];
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { key: FEATURE_KEYS.BLOG, label: 'Blog', description: 'Public articles section and blog admin module.', defaultEnabled: true, routes: ['/blog'] },
  { key: FEATURE_KEYS.SHOP, label: 'Shop', description: 'E-commerce storefront, cart and checkout.', defaultEnabled: false, routes: ['/shop', '/cart', '/checkout'] },
  { key: FEATURE_KEYS.INSTRUCTORS, label: 'Instructors', description: 'Public instructor directory and profiles.', defaultEnabled: true, routes: ['/instructors'] },
  { key: FEATURE_KEYS.FAQ, label: 'FAQ', description: 'Public frequently asked questions page.', defaultEnabled: true, routes: ['/faq'] },
  { key: FEATURE_KEYS.NEWSLETTER, label: 'Newsletter', description: 'Newsletter capture form and subscriber list.', defaultEnabled: true, routes: [] },
  { key: FEATURE_KEYS.COMMENTS, label: 'Comments', description: 'Lesson and article discussions.', defaultEnabled: false, routes: [] },
  { key: FEATURE_KEYS.REGISTRATION, label: 'Registration', description: 'Allow new accounts to be created.', defaultEnabled: true, routes: ['/register'] },
  { key: FEATURE_KEYS.OAUTH_GOOGLE, label: 'Google sign-in', description: 'Enable the Google OAuth provider.', defaultEnabled: true, routes: [] },
  { key: FEATURE_KEYS.OAUTH_GITHUB, label: 'GitHub sign-in', description: 'Enable the GitHub OAuth provider.', defaultEnabled: true, routes: [] },
  { key: FEATURE_KEYS.CERTIFICATES, label: 'Certificates', description: 'Issue completion certificates.', defaultEnabled: false, routes: [] },
  { key: FEATURE_KEYS.SEARCH, label: 'Search', description: 'Site-wide search page and API.', defaultEnabled: true, routes: ['/search'] },
  { key: FEATURE_KEYS.CONTACT_FORM, label: 'Contact form', description: 'Public contact form submissions.', defaultEnabled: true, routes: ['/contact'] },
];

export type FeatureFlagMap = Record<string, boolean>;
