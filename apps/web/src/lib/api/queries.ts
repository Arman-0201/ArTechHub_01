import 'server-only';
import { cache } from 'react';
import type {
  BlogPostCardDto,
  BlogPostDto,
  CategoryDto,
  CollectionDto,
  CollectionEntryDto,
  CollectionIndexDto,
  CourseCardDto,
  CourseDetailDto,
  InstructorDto,
  LegalDocumentDto,
  LessonDetailDto,
  PageDto,
  PaginationMeta,
  ProductDto,
  SessionUserDto,
  SiteBootstrapDto,
} from '@academy/types';
import { serverFetch, serverFetchOptional, serverRequest } from './server';
import { ApiError } from './types';

/**
 * Server-side data access, one function per read the pages need.
 *
 * `cache()` deduplicates within a single render pass: a layout and three
 * nested components can all call `getBootstrap()` and only one request is made.
 */

export const getBootstrap = cache(async (locale: string): Promise<SiteBootstrapDto> => {
  return serverFetch<SiteBootstrapDto>('/site/bootstrap', { locale });
});

export const getTranslations = cache(async (locale: string): Promise<Record<string, string>> => {
  try {
    return await serverFetch<Record<string, string>>(`/site/translations/${locale}`, { locale });
  } catch {
    // A missing catalogue must not blank the site — the compiled dictionaries
    // are a complete fallback.
    return {};
  }
});

/**
 * The signed-in user for a server render, or null.
 *
 * Uses `/auth/session`, not `/auth/me`: the server holds only cookies — the
 * access token lives in browser memory and never reaches it — so it
 * authenticates from the refresh cookie. The endpoint is read-only and does not
 * rotate the token, which is what makes it safe to call on every render.
 *
 * Returns null rather than throwing, so a public page renders normally for an
 * anonymous visitor.
 */
export const getSessionUser = cache(async (): Promise<SessionUserDto | null> => {
  try {
    return await serverFetch<SessionUserDto | null>('/auth/session');
  } catch (error) {
    if (error instanceof ApiError && error.isAuthError) return null;
    return null;
  }
});

/* ------------------------------------------------------------------- CMS */

export const getPage = cache(async (slug: string, locale: string): Promise<PageDto | null> => {
  return serverFetchOptional<PageDto>(`/pages/${slug}`, { locale });
});

/* --------------------------------------------------------------- courses */

export interface CourseListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  level?: string;
  tag?: string;
  instructor?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export async function getCourses(
  locale: string,
  params: CourseListParams = {},
): Promise<{ items: CourseCardDto[]; meta: PaginationMeta | undefined }> {
  const result = await serverRequest<CourseCardDto[]>('/courses', {
    locale,
    query: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 12,
      search: params.search,
      category: params.category,
      level: params.level,
      tag: params.tag,
      instructor: params.instructor,
      sort: params.sort,
      order: params.order,
    },
  });
  return { items: result.data, meta: result.meta };
}

export const getFeaturedCourses = cache(
  async (locale: string, limit = 6): Promise<CourseCardDto[]> => {
    try {
      return await serverFetch<CourseCardDto[]>('/courses/featured', {
        locale,
        query: { limit },
        revalidate: 300,
      });
    } catch {
      return [];
    }
  },
);

export const getCourse = cache(
  async (slug: string, locale: string): Promise<CourseDetailDto | null> => {
    return serverFetchOptional<CourseDetailDto>(`/courses/${slug}`, { locale });
  },
);

export const getLesson = cache(
  async (courseSlug: string, lessonSlug: string, locale: string): Promise<LessonDetailDto> => {
    return serverFetch<LessonDetailDto>(`/courses/${courseSlug}/lessons/${lessonSlug}`, { locale });
  },
);

/* ------------------------------------------------------------ categories */

export const getCategories = cache(async (locale: string): Promise<CategoryDto[]> => {
  try {
    return await serverFetch<CategoryDto[]>('/categories', {
      locale,
      query: { tree: true },
      revalidate: 300,
    });
  } catch {
    return [];
  }
});

export const getCategory = cache(
  async (slug: string, locale: string): Promise<CategoryDto | null> => {
    return serverFetchOptional<CategoryDto>(`/categories/${slug}`, { locale });
  },
);

/* ----------------------------------------------------------- instructors */

export const getInstructors = cache(async (locale: string): Promise<InstructorDto[]> => {
  try {
    return await serverFetch<InstructorDto[]>('/instructors', { locale, revalidate: 300 });
  } catch {
    return [];
  }
});

export const getInstructor = cache(
  async (
    slug: string,
    locale: string,
  ): Promise<{ instructor: InstructorDto; courses: CourseCardDto[] } | null> => {
    return serverFetchOptional<{ instructor: InstructorDto; courses: CourseCardDto[] }>(
      `/instructors/${slug}`,
      { locale },
    );
  },
);

/* ----------------------------------------------------- reference collections */

export const getCollections = cache(async (locale: string): Promise<CollectionDto[]> => {
  try {
    return await serverFetch<CollectionDto[]>('/collections', { locale, revalidate: 300 });
  } catch {
    return [];
  }
});

export const getCollection = cache(
  async (slug: string, locale: string): Promise<CollectionIndexDto | null> => {
    return serverFetchOptional<CollectionIndexDto>(`/collections/${slug}`, { locale });
  },
);

export const getCollectionEntry = cache(
  async (
    collectionSlug: string,
    entrySlug: string,
    locale: string,
  ): Promise<{ collection: CollectionDto; entry: CollectionEntryDto } | null> => {
    return serverFetchOptional<{ collection: CollectionDto; entry: CollectionEntryDto }>(
      `/collections/${collectionSlug}/entries/${entrySlug}`,
      { locale },
    );
  },
);

/* ------------------------------------------------------------------ blog */

export async function getBlogPosts(
  locale: string,
  params: { page?: number; pageSize?: number; tag?: string; search?: string } = {},
): Promise<{ items: BlogPostCardDto[]; meta: PaginationMeta | undefined }> {
  try {
    const result = await serverRequest<BlogPostCardDto[]>('/blog', {
      locale,
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 9,
        tag: params.tag,
        search: params.search,
      },
    });
    return { items: result.data, meta: result.meta };
  } catch {
    return { items: [], meta: undefined };
  }
}

export const getBlogPost = cache(
  async (slug: string, locale: string): Promise<BlogPostDto | null> => {
    return serverFetchOptional<BlogPostDto>(`/blog/${slug}`, { locale });
  },
);

/* ----------------------------------------------------------------- legal */

export const getLegalDocument = cache(
  async (slug: string, locale: string): Promise<LegalDocumentDto | null> => {
    return serverFetchOptional<LegalDocumentDto>(`/legal/${slug}`, { locale });
  },
);

/* ------------------------------------------------------------------ shop */

export async function getProducts(
  locale: string,
  params: { page?: number; pageSize?: number; category?: string; search?: string } = {},
): Promise<{ items: ProductDto[]; meta: PaginationMeta | undefined }> {
  try {
    const result = await serverRequest<ProductDto[]>('/shop/products', {
      locale,
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 12,
        category: params.category,
        search: params.search,
      },
    });
    return { items: result.data, meta: result.meta };
  } catch {
    return { items: [], meta: undefined };
  }
}

export const getProduct = cache(
  async (slug: string, locale: string): Promise<ProductDto | null> => {
    return serverFetchOptional<ProductDto>(`/shop/products/${slug}`, { locale });
  },
);

/* -------------------------------------------------------------- account */

export async function getDashboard(locale: string) {
  return serverFetch<{
    stats: import('@academy/types').LearningStatsDto;
    continueLearning: import('@academy/types').EnrollmentDto[];
    recentCourses: import('@academy/types').EnrollmentDto[];
  }>('/account/dashboard', { locale });
}

export async function getMyEnrollments(
  locale: string,
  params: { page?: number; pageSize?: number; filter?: string } = {},
) {
  const result = await serverRequest<import('@academy/types').EnrollmentDto[]>(
    '/account/enrollments',
    {
      locale,
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 12,
        filter: params.filter ?? 'all',
      },
    },
  );
  return { items: result.data, meta: result.meta };
}
