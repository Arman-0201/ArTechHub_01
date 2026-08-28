import type {
  CategoryDto,
  CollectionIndexDto,
  CourseCardDto,
  InstructorDto,
  PageSectionDto,
} from '@academy/types';

/**
 * Props every section component receives.
 *
 * `content` and `settings` are open records because each section type owns its
 * own shape. Components read them through the typed accessors below rather than
 * casting, so a malformed or partially-filled section degrades to a sensible
 * default instead of crashing the page.
 */
export interface SectionProps {
  section: PageSectionDto;
  locale: string;
  /** Data the CMS cannot store inline, resolved once per page. */
  data: SectionData;
}

export interface SectionData {
  featuredCourses: CourseCardDto[];
  categories: CategoryDto[];
  instructors: InstructorDto[];
  latestPosts: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    coverImageUrl: string | null;
    publishedAt: string | null;
    readingMinutes: number;
  }[];
  /**
   * Reference collections a `COLLECTION_GRID` section on this page names,
   * keyed by slug. Absent when the slug no longer resolves to a published
   * collection, which the section treats as nothing to render.
   */
  collections: Record<string, CollectionIndexDto>;
}

export function readString(
  source: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

export function readOptionalString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readNumber(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function readBoolean(
  source: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function readArray<T>(source: Record<string, unknown>, key: string): T[] {
  const value = source[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export interface SectionAction {
  label: string;
  href: string;
}

export function readAction(
  source: Record<string, unknown>,
  key: string,
): SectionAction | undefined {
  const value = source[key];
  if (!value || typeof value !== 'object') return undefined;
  const action = value as Partial<SectionAction>;
  if (typeof action.label !== 'string' || typeof action.href !== 'string') return undefined;
  // Only site-relative and http(s) targets are honoured, so a CMS field can
  // never become a `javascript:` link.
  if (!action.href.startsWith('/') && !/^https?:\/\//i.test(action.href)) return undefined;
  return { label: action.label, href: action.href };
}
