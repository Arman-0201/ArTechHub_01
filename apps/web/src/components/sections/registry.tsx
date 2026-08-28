import type { ComponentType } from 'react';
import type { PageDto, SectionType } from '@academy/types';
import type { SectionData, SectionProps } from './types';
import {
  BlogGridSection,
  CategoryGridSection,
  CourseGridSection,
  CtaSection,
  FaqSection,
  FeatureGridSection,
  HeroSection,
  HtmlSection,
  ImageSection,
  ImageTextSection,
  InstructorListSection,
  LogoCarouselSection,
  NewsletterSection,
  RichTextSection,
  StatsSection,
  TeamSection,
  TestimonialsSection,
  TextSection,
  VideoSection,
} from './blocks';
// Imported from its own module rather than re-exported through `blocks`: the
// gallery section imports `SectionShell` from there, and routing it back
// through the same barrel would close an import cycle for no gain.
import { PdfGallerySection } from './pdf-gallery-section';
import { CollectionGridSection } from './collection-grid-section';

/**
 * Section registry.
 *
 * The page builder's rendering half: a type-to-component map, so `PageRenderer`
 * is a loop rather than a chain of conditionals. Adding a section type is two
 * changes — the enum in `@academy/types` and one entry here.
 *
 * A section whose type has no entry is skipped silently. That matters during a
 * rolling deploy: content authored against a newer build must not crash an
 * older one.
 */
const REGISTRY: Partial<Record<SectionType, ComponentType<SectionProps>>> = {
  HERO: HeroSection,
  TEXT: TextSection,
  RICH_TEXT: RichTextSection,
  IMAGE: ImageSection,
  IMAGE_TEXT: ImageTextSection,
  FEATURE_GRID: FeatureGridSection,
  COURSE_GRID: CourseGridSection,
  CATEGORY_GRID: CategoryGridSection,
  STATS: StatsSection,
  TESTIMONIALS: TestimonialsSection,
  FAQ: FaqSection,
  CTA: CtaSection,
  CAROUSEL: LogoCarouselSection,
  LOGO_CAROUSEL: LogoCarouselSection,
  VIDEO: VideoSection,
  PDF_GALLERY: PdfGallerySection,
  NEWSLETTER: NewsletterSection,
  TEAM: TeamSection,
  INSTRUCTOR_LIST: InstructorListSection,
  BLOG_GRID: BlogGridSection,
  COLLECTION_GRID: CollectionGridSection,
  HTML: HtmlSection,
};

export function isRenderableSection(type: string): boolean {
  return type in REGISTRY;
}

/** Section types that need catalogue data resolved before rendering. */
export const DATA_DEPENDENT_SECTIONS = {
  courses: ['COURSE_GRID'] as const,
  categories: ['CATEGORY_GRID'] as const,
  instructors: ['INSTRUCTOR_LIST', 'TEAM'] as const,
  posts: ['BLOG_GRID'] as const,
  collections: ['COLLECTION_GRID'] as const,
};

export function PageRenderer({
  page,
  locale,
  data,
}: {
  page: PageDto;
  locale: string;
  data: SectionData;
}) {
  return (
    <>
      {page.sections.map((section) => {
        const Component = REGISTRY[section.type];
        if (!Component) return null;
        return <Component key={section.id} section={section} locale={locale} data={data} />;
      })}
    </>
  );
}

export const EMPTY_SECTION_DATA: SectionData = {
  featuredCourses: [],
  categories: [],
  instructors: [],
  latestPosts: [],
  collections: {},
};

export type { SectionData, SectionProps };
