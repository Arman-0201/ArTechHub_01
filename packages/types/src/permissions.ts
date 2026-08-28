/**
 * The permission catalogue is the single source of truth for authorization.
 * Roles are dynamic (admins create them at runtime) but the *permissions* they
 * can hold are a fixed, code-defined list — otherwise a compromised admin could
 * invent permission strings that no middleware ever checks.
 */

export const PERMISSIONS = {
  // Users
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  // Roles & permissions
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  // Courses
  COURSES_READ: 'courses.read',
  COURSES_CREATE: 'courses.create',
  COURSES_UPDATE: 'courses.update',
  COURSES_DELETE: 'courses.delete',
  COURSES_PUBLISH: 'courses.publish',
  // Categories
  CATEGORIES_READ: 'categories.read',
  CATEGORIES_MANAGE: 'categories.manage',
  // CMS pages / sections / menus
  PAGES_READ: 'pages.read',
  PAGES_CREATE: 'pages.create',
  PAGES_UPDATE: 'pages.update',
  PAGES_DELETE: 'pages.delete',
  PAGES_PUBLISH: 'pages.publish',
  MENUS_MANAGE: 'menus.manage',
  // Blog
  BLOG_READ: 'blog.read',
  BLOG_MANAGE: 'blog.manage',
  // Reference collections (encyclopedia-style entries)
  COLLECTIONS_READ: 'collections.read',
  COLLECTIONS_MANAGE: 'collections.manage',
  // Media
  MEDIA_READ: 'media.read',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',
  // i18n
  LANGUAGES_MANAGE: 'languages.manage',
  TRANSLATIONS_MANAGE: 'translations.manage',
  // SEO
  SEO_MANAGE: 'seo.manage',
  // Feature flags + settings
  FEATURES_MANAGE: 'features.manage',
  SETTINGS_MANAGE: 'settings.manage',
  // Legal
  LEGAL_MANAGE: 'legal.manage',
  // Commerce
  PRODUCTS_READ: 'products.read',
  PRODUCTS_MANAGE: 'products.manage',
  ORDERS_READ: 'orders.read',
  ORDERS_MANAGE: 'orders.manage',
  // Observability
  ANALYTICS_READ: 'analytics.read',
  AUDIT_READ: 'audit.read',
  // Enrollment administration
  ENROLLMENTS_READ: 'enrollments.read',
  ENROLLMENTS_MANAGE: 'enrollments.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: Permission; label: string }[];
}

/** Grouping used by the admin role editor UI. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'users',
    label: 'Users',
    permissions: [
      { key: PERMISSIONS.USERS_READ, label: 'View users' },
      { key: PERMISSIONS.USERS_CREATE, label: 'Create users' },
      { key: PERMISSIONS.USERS_UPDATE, label: 'Update users' },
      { key: PERMISSIONS.USERS_DELETE, label: 'Delete users' },
    ],
  },
  {
    key: 'access',
    label: 'Roles & permissions',
    permissions: [
      { key: PERMISSIONS.ROLES_READ, label: 'View roles' },
      { key: PERMISSIONS.ROLES_MANAGE, label: 'Manage roles & permissions' },
    ],
  },
  {
    key: 'courses',
    label: 'Courses',
    permissions: [
      { key: PERMISSIONS.COURSES_READ, label: 'View courses' },
      { key: PERMISSIONS.COURSES_CREATE, label: 'Create courses' },
      { key: PERMISSIONS.COURSES_UPDATE, label: 'Update courses' },
      { key: PERMISSIONS.COURSES_DELETE, label: 'Delete courses' },
      { key: PERMISSIONS.COURSES_PUBLISH, label: 'Publish / unpublish courses' },
      { key: PERMISSIONS.CATEGORIES_READ, label: 'View categories' },
      { key: PERMISSIONS.CATEGORIES_MANAGE, label: 'Manage categories' },
      { key: PERMISSIONS.ENROLLMENTS_READ, label: 'View enrollments' },
      { key: PERMISSIONS.ENROLLMENTS_MANAGE, label: 'Manage enrollments' },
    ],
  },
  {
    key: 'content',
    label: 'Content & CMS',
    permissions: [
      { key: PERMISSIONS.PAGES_READ, label: 'View pages' },
      { key: PERMISSIONS.PAGES_CREATE, label: 'Create pages' },
      { key: PERMISSIONS.PAGES_UPDATE, label: 'Update pages & sections' },
      { key: PERMISSIONS.PAGES_DELETE, label: 'Delete pages' },
      { key: PERMISSIONS.PAGES_PUBLISH, label: 'Publish pages' },
      { key: PERMISSIONS.MENUS_MANAGE, label: 'Manage menus & footer' },
      { key: PERMISSIONS.BLOG_READ, label: 'View blog posts' },
      { key: PERMISSIONS.BLOG_MANAGE, label: 'Manage blog posts' },
      { key: PERMISSIONS.LEGAL_MANAGE, label: 'Manage legal documents' },
      { key: PERMISSIONS.COLLECTIONS_READ, label: 'View reference collections' },
      { key: PERMISSIONS.COLLECTIONS_MANAGE, label: 'Manage reference collections' },
    ],
  },
  {
    key: 'media',
    label: 'Media',
    permissions: [
      { key: PERMISSIONS.MEDIA_READ, label: 'Browse media library' },
      { key: PERMISSIONS.MEDIA_UPLOAD, label: 'Upload media' },
      { key: PERMISSIONS.MEDIA_DELETE, label: 'Delete media' },
    ],
  },
  {
    key: 'i18n',
    label: 'Localization & SEO',
    permissions: [
      { key: PERMISSIONS.LANGUAGES_MANAGE, label: 'Manage languages' },
      { key: PERMISSIONS.TRANSLATIONS_MANAGE, label: 'Manage translations' },
      { key: PERMISSIONS.SEO_MANAGE, label: 'Manage SEO metadata' },
    ],
  },
  {
    key: 'commerce',
    label: 'E-commerce',
    permissions: [
      { key: PERMISSIONS.PRODUCTS_READ, label: 'View products' },
      { key: PERMISSIONS.PRODUCTS_MANAGE, label: 'Manage products' },
      { key: PERMISSIONS.ORDERS_READ, label: 'View orders' },
      { key: PERMISSIONS.ORDERS_MANAGE, label: 'Manage orders' },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    permissions: [
      { key: PERMISSIONS.FEATURES_MANAGE, label: 'Manage feature flags' },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Manage settings' },
      { key: PERMISSIONS.ANALYTICS_READ, label: 'View analytics' },
      { key: PERMISSIONS.AUDIT_READ, label: 'View audit logs' },
    ],
  },
];

/** Reserved role slugs the system relies on and refuses to delete. */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  CONTENT_MANAGER: 'content-manager',
  INSTRUCTOR: 'instructor',
  SUPPORT: 'support',
  STUDENT: 'student',
} as const;

export type SystemRoleSlug = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/** Any user holding this role bypasses individual permission checks. */
export const SUPER_ADMIN_ROLE = SYSTEM_ROLES.SUPER_ADMIN;
