/** Domain enumerations mirrored from the Prisma schema. */

export const USER_STATUS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const COURSE_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'DISABLED'] as const;
export type CourseStatus = (typeof COURSE_STATUS)[number];

export const COURSE_LEVEL = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
export type CourseLevel = (typeof COURSE_LEVEL)[number];

export const ACCESS_TYPE = ['FREE', 'PAID', 'INVITE_ONLY', 'PRIVATE'] as const;
export type CourseAccessType = (typeof ACCESS_TYPE)[number];

export const ENROLLMENT_STATUS = ['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[number];

export const LESSON_TYPE = ['ARTICLE', 'VIDEO', 'PDF', 'QUIZ', 'RESOURCE'] as const;
export type LessonType = (typeof LESSON_TYPE)[number];

export const PUBLISH_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PublishStatus = (typeof PUBLISH_STATUS)[number];

export const MEDIA_KIND = ['IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER'] as const;
export type MediaKind = (typeof MEDIA_KIND)[number];

export const ORDER_STATUS = [
  'PENDING',
  'AWAITING_PAYMENT',
  'PAID',
  'FULFILLED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const PRODUCT_TYPE = ['PHYSICAL', 'DIGITAL', 'BUNDLE'] as const;
export type ProductType = (typeof PRODUCT_TYPE)[number];

export const MENU_LINK_TYPE = ['INTERNAL', 'EXTERNAL', 'PAGE', 'COURSE', 'CATEGORY'] as const;
export type MenuLinkType = (typeof MENU_LINK_TYPE)[number];

/**
 * Section types that the frontend section registry knows how to render.
 * Adding a value here is a two-step change: register a renderer in
 * `apps/web/src/components/sections/registry.tsx` as well.
 */
export const SECTION_TYPES = [
  'HERO',
  'TEXT',
  'RICH_TEXT',
  'IMAGE',
  'IMAGE_TEXT',
  'FEATURE_GRID',
  'COURSE_GRID',
  'CATEGORY_GRID',
  'STATS',
  'TESTIMONIALS',
  'FAQ',
  'CTA',
  'CAROUSEL',
  'LOGO_CAROUSEL',
  'VIDEO',
  'PDF_GALLERY',
  'NEWSLETTER',
  'TEAM',
  'INSTRUCTOR_LIST',
  'BLOG_GRID',
  'COLLECTION_GRID',
  'HTML',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * What a reference-collection panel holds.
 *
 * A detail page is a list of panels rather than free-form rich text, because
 * the same handful of shapes repeats across every entry — a description, a
 * checklist of software, a table of vulnerabilities, a column of key/value
 * facts, a set of related links. Naming them keeps every entry consistent
 * without an editor rebuilding the layout each time, and each one renders to a
 * bordered card the author places in the main column or the sidebar.
 */
export const COLLECTION_PANEL_KINDS = ['TEXT', 'LIST', 'FACTS', 'TABLE', 'LINKS'] as const;
export type CollectionPanelKind = (typeof COLLECTION_PANEL_KINDS)[number];

/** Which column a panel is drawn in on an entry's detail page. */
export const COLLECTION_PANEL_COLUMNS = ['MAIN', 'SIDE'] as const;
export type CollectionPanelColumn = (typeof COLLECTION_PANEL_COLUMNS)[number];

/**
 * A panel's accent, and an entry's. Presentation only — it colours a border,
 * an icon and a badge, and carries no meaning the server acts on.
 */
export const COLLECTION_TONES = ['DEFAULT', 'INFO', 'SUCCESS', 'WARNING', 'DANGER'] as const;
export type CollectionTone = (typeof COLLECTION_TONES)[number];
