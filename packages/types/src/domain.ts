import type {
  CourseAccessType,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  MediaKind,
  MenuLinkType,
  OrderStatus,
  ProductType,
  PublishStatus,
  SectionType,
  UserStatus,
} from './enums.js';
import type { Permission } from './permissions.js';
import type { RichTextDocument } from './content.js';

/* ------------------------------------------------------------------ identity */

export interface RoleDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerified: boolean;
  locale: string;
  roles: { id: string; slug: string; name: string }[];
  permissions: Permission[];
  isSuperAdmin: boolean;
  /** True when the account is allowed to open the admin panel at all. */
  canAccessAdmin: boolean;
}

export interface UserSummaryDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerified: boolean;
  locale: string;
  roles: { id: string; slug: string; name: string }[];
  createdAt: string;
  lastLoginAt: string | null;
  enrollmentCount: number;
}

export interface UserDetailDto extends UserSummaryDto {
  headline: string | null;
  bio: string | null;
  updatedAt: string;
  deletedAt: string | null;
  authProviders: { provider: string; connectedAt: string }[];
  stats: LearningStatsDto;
}

export interface AuthTokensDto {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface AuthResultDto extends AuthTokensDto {
  user: SessionUserDto;
}

/* ------------------------------------------------------------------ taxonomy */

export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconName: string | null;
  imageUrl: string | null;
  colorHex: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  courseCount: number;
  children?: CategoryDto[];
  seo?: SeoDto | null;
}

/* ------------------------------------------------------------------- courses */

export interface InstructorDto {
  id: string;
  userId: string | null;
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  links: { label: string; url: string }[];
  courseCount?: number;
}

export interface CourseCardDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  level: CourseLevel;
  accessType: CourseAccessType;
  priceCents: number | null;
  currency: string | null;
  durationMinutes: number | null;
  lessonCount: number;
  enrollmentCount: number;
  ratingAverage: number | null;
  status: CourseStatus;
  isFeatured: boolean;
  publishedAt: string | null;
  category: Pick<CategoryDto, 'id' | 'slug' | 'name'> | null;
  instructors: Pick<InstructorDto, 'id' | 'slug' | 'name' | 'avatarUrl'>[];
  tags: string[];
}

export interface LessonSummaryDto {
  id: string;
  slug: string;
  title: string;
  type: LessonType;
  durationMinutes: number | null;
  sortOrder: number;
  isPreview: boolean;
  isPublished: boolean;
}

export interface ModuleSummaryDto {
  id: string;
  title: string;
  summary: string | null;
  sortOrder: number;
  lessons: LessonSummaryDto[];
}

export interface CourseDetailDto extends CourseCardDto {
  description: RichTextDocument | null;
  learningOutcomes: string[];
  requirements: string[];
  language: string;
  modules: ModuleSummaryDto[];
  seo: SeoDto | null;
  updatedAt: string;
  /** Viewer specific state; null for anonymous visitors. */
  viewer: {
    isEnrolled: boolean;
    enrollmentStatus: EnrollmentStatus | null;
    progressPercent: number;
    resumeLessonId: string | null;
  } | null;
}

export interface LessonAttachmentDto {
  id: string;
  label: string;
  mediaId: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface LessonDetailDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  type: LessonType;
  durationMinutes: number | null;
  sortOrder: number;
  isPreview: boolean;
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  body: RichTextDocument | null;
  video: {
    url: string;
    provider: 'file' | 'youtube' | 'vimeo';
    posterUrl: string | null;
    durationSeconds: number | null;
  } | null;
  attachments: LessonAttachmentDto[];
  /** Original source PDF, kept downloadable after a PDF import. */
  sourcePdfUrl: string | null;
  previousLessonId: string | null;
  nextLessonId: string | null;
  progress: LessonProgressDto | null;
}

/* ------------------------------------------------------------------ progress */

export interface LessonProgressDto {
  lessonId: string;
  isCompleted: boolean;
  completedAt: string | null;
  lastPositionSeconds: number;
  updatedAt: string;
}

export interface CourseProgressDto {
  courseId: string;
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
  lastLessonId: string | null;
  lastAccessedAt: string | null;
  completedAt: string | null;
}

export interface EnrollmentDto {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  course: CourseCardDto;
  progress: CourseProgressDto;
}

export interface LearningStatsDto {
  totalCourses: number;
  inProgress: number;
  completed: number;
  notStarted: number;
  lessonsCompleted: number;
  totalLessons: number;
  overallProgressPercent: number;
  currentStreakDays: number;
  minutesLearned: number;
}

/* ----------------------------------------------------------------------- CMS */

export interface SeoDto {
  title: string | null;
  description: string | null;
  keywords: string[];
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  twitterCard: string | null;
  robots: string | null;
  structuredData: Record<string, unknown> | null;
}

export interface PageSectionDto {
  id: string;
  type: SectionType;
  sortOrder: number;
  isVisible: boolean;
  /** Layout and behaviour knobs: background, alignment, item limits. */
  settings: Record<string, unknown>;
  /** Translatable copy and media references for the section. */
  content: Record<string, unknown>;
}

export interface PageDto {
  id: string;
  slug: string;
  title: string;
  status: PublishStatus;
  isEnabled: boolean;
  isSystem: boolean;
  template: string;
  sections: PageSectionDto[];
  seo: SeoDto | null;
  updatedAt: string;
  publishedAt: string | null;
}

export interface MenuItemDto {
  id: string;
  label: string;
  url: string;
  linkType: MenuLinkType;
  target: '_self' | '_blank';
  iconName: string | null;
  sortOrder: number;
  isVisible: boolean;
  /** Empty array means visible to everyone. */
  visibleForRoles: string[];
  visibleForLocales: string[];
  children: MenuItemDto[];
}

export interface MenuDto {
  id: string;
  slug: string;
  name: string;
  items: MenuItemDto[];
}

export interface BlogPostCardDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  status: PublishStatus;
  publishedAt: string | null;
  readingMinutes: number;
  tags: string[];
  author: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface BlogPostDto extends BlogPostCardDto {
  body: RichTextDocument | null;
  seo: SeoDto | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ platform */

export interface MediaDto {
  id: string;
  kind: MediaKind;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
  folder: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

export interface SiteSettingsDto {
  siteName: string;
  siteTagline: string | null;
  siteDescription: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  socialLinks: { platform: string; url: string }[];
  defaultLocale: string;
  availableLocales: string[];
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  footerNote: string | null;
  defaultSeo: SeoDto | null;
}

export interface LanguageDto {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  flag: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  fallbackCode: string | null;
  /** Percentage of UI keys that have a translation. */
  completeness?: number;
}

export interface FeatureFlagDto {
  key: string;
  label: string;
  description: string | null;
  isEnabled: boolean;
  updatedAt: string;
}

export interface LegalDocumentDto {
  id: string;
  slug: string;
  title: string;
  requiresAcceptance: boolean;
  currentVersion: {
    id: string;
    version: string;
    body: RichTextDocument | null;
    effectiveAt: string;
  } | null;
  updatedAt: string;
}

export interface AuditLogDto {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

/* ------------------------------------------------------------------ commerce */

export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: RichTextDocument | null;
  type: ProductType;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  stock: number | null;
  isActive: boolean;
  images: { url: string; alt: string | null }[];
  category: { id: string; slug: string; name: string } | null;
  seo: SeoDto | null;
}

export interface CartLineDto {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  currency: string;
}

export interface CartDto {
  lines: CartLineDto[];
  subtotalCents: number;
  currency: string;
  itemCount: number;
}

export interface OrderDto {
  id: string;
  reference: string;
  status: OrderStatus;
  subtotalCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
  customer: { name: string; email: string } | null;
  items: {
    id: string;
    productId: string | null;
    name: string;
    unitPriceCents: number;
    quantity: number;
    totalCents: number;
  }[];
}

/* ----------------------------------------------------------------- analytics */

export interface AdminOverviewDto {
  users: { total: number; newLast30Days: number; activeLast30Days: number };
  courses: { total: number; published: number; draft: number; archived: number };
  enrollments: { total: number; last30Days: number; completions: number };
  content: { pages: number; blogPosts: number; media: number };
  commerce: { products: number; orders: number; revenueCents: number } | null;
  enrollmentTrend: { date: string; count: number }[];
  topCourses: { id: string; title: string; slug: string; enrollments: number }[];
  recentActivity: AuditLogDto[];
}

/* ----------------------------------------------------------------- bootstrap */

/**
 * Single request that gives the web app everything it needs to render chrome:
 * settings, active languages, feature flags, navigation and footer.
 */
export interface SiteBootstrapDto {
  settings: SiteSettingsDto;
  languages: LanguageDto[];
  features: Record<string, boolean>;
  menus: Record<string, MenuDto | null>;
  footer: {
    groups: {
      id: string;
      title: string;
      links: { id: string; label: string; url: string; target: '_self' | '_blank' }[];
    }[];
    socialLinks: { platform: string; url: string }[];
    copyright: string | null;
  };
  legalLinks: { slug: string; title: string }[];
}
