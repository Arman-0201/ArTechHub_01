import type { Prisma } from '@prisma/client';
import type { BlogPostCardDto, BlogPostDto, PaginatedResult, RichTextDocument, SeoDto } from '@academy/types';
import { jsonOrDbNull, prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { uniqueSlug } from '../../lib/slug.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { applyTranslation, pickTranslation } from '../translations/translation.helpers.js';
import { toSeoDto, upsertSeo } from '../seo/seo.service.js';
import { estimateReadingMinutes } from '../lessons/lessons.service.js';

const postSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  body: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  readingMinutes: true,
  cover: { select: { url: true, storageKey: true, storageDriver: true } },
  author: {
    select: {
      id: true,
      name: true,
      avatar: { select: { url: true, storageKey: true, storageDriver: true } },
    },
  },
  tags: { select: { tag: { select: { name: true } } } },
  translations: { select: { locale: true, title: true, excerpt: true, body: true } },
  seo: true,
} satisfies Prisma.BlogPostSelect;

type PostRow = Prisma.BlogPostGetPayload<{ select: typeof postSelect }>;

function toCard(post: PostRow, locale: string): BlogPostCardDto {
  const translation = pickTranslation(post.translations, locale);
  return {
    id: post.id,
    slug: post.slug,
    title: applyTranslation(post.title, translation?.title),
    excerpt: applyTranslation(post.excerpt, translation?.excerpt),
    coverImageUrl: post.cover ? resolveMediaUrl(post.cover) : null,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    readingMinutes: post.readingMinutes,
    tags: post.tags.map((entry) => entry.tag.name),
    author: post.author
      ? {
          id: post.author.id,
          name: post.author.name,
          avatarUrl: post.author.avatar ? resolveMediaUrl(post.author.avatar) : null,
        }
      : null,
  };
}

function toDetail(post: PostRow, locale: string): BlogPostDto {
  const translation = pickTranslation(post.translations, locale);
  return {
    ...toCard(post, locale),
    body: ((translation?.body ?? post.body) as RichTextDocument | null) ?? null,
    seo: post.seo ? toSeoDto(post.seo) : null,
    updatedAt: post.updatedAt.toISOString(),
  };
}

export interface ListPostsInput {
  locale: string;
  page: number;
  pageSize: number;
  search?: string;
  tag?: string;
  status?: string;
  includeUnpublished?: boolean;
}

export async function listPosts(input: ListPostsInput): Promise<PaginatedResult<BlogPostCardDto>> {
  const where: Prisma.BlogPostWhereInput = {
    deletedAt: null,
    ...(input.includeUnpublished
      ? input.status
        ? { status: input.status as never }
        : {}
      : { status: 'PUBLISHED', publishedAt: { lte: new Date() } }),
    ...(input.tag ? { tags: { some: { tag: { slug: input.tag } } } } : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: 'insensitive' } },
            { excerpt: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
      select: postSelect,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return {
    items: posts.map((post) => toCard(post, input.locale)),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}

export async function getPostBySlug(
  slug: string,
  locale: string,
  includeUnpublished = false,
): Promise<BlogPostDto> {
  const post = await prisma.blogPost.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(includeUnpublished ? {} : { status: 'PUBLISHED', publishedAt: { lte: new Date() } }),
    },
    select: postSelect,
  });
  if (!post) throw new NotFoundError('Article');

  // Fire-and-forget: a failed counter increment must not break the page.
  void prisma.blogPost
    .update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);

  return toDetail(post, locale);
}

export async function getPostById(id: string, locale: string): Promise<BlogPostDto> {
  const post = await prisma.blogPost.findFirst({
    where: { id, deletedAt: null },
    select: postSelect,
  });
  if (!post) throw new NotFoundError('Article');
  return toDetail(post, locale);
}

export interface BlogPostInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  body?: RichTextDocument | null;
  coverMediaId?: string | null;
  status?: string;
  publishedAt?: Date | null;
  tags?: string[];
  authorId?: string | null;
  seo?: Partial<SeoDto>;
}

async function resolveTagIds(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) continue;
    const tag = await prisma.tag.upsert({
      where: { slug },
      create: { slug, name: name.trim() },
      update: {},
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

export async function createPost(
  input: BlogPostInput,
  authorId: string,
  locale: string,
): Promise<BlogPostDto> {
  const slug = await uniqueSlug(
    input.slug ?? input.title,
    async (candidate) => (await prisma.blogPost.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'article' },
  );

  const tagIds = input.tags ? await resolveTagIds(input.tags) : [];

  const post = await prisma.blogPost.create({
    data: {
      slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      body: jsonOrDbNull(input.body),
      coverMediaId: input.coverMediaId ?? null,
      authorId: input.authorId ?? authorId,
      status: (input.status as never) ?? 'DRAFT',
      readingMinutes: estimateReadingMinutes(input.body),
      publishedAt:
        input.publishedAt ?? (input.status === 'PUBLISHED' ? new Date() : null),
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    select: { id: true },
  });

  if (input.seo) await upsertSeo({ blogPostId: post.id }, input.seo);

  return getPostById(post.id, locale);
}

export async function updatePost(
  id: string,
  input: Partial<BlogPostInput>,
  locale: string,
): Promise<BlogPostDto> {
  const existing = await prisma.blogPost.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, status: true, publishedAt: true },
  });
  if (!existing) throw new NotFoundError('Article');

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(
          input.slug,
          async (candidate) =>
            (await prisma.blogPost.count({ where: { slug: candidate, id: { not: id } } })) > 0,
          { fallbackPrefix: 'article' },
        )
      : undefined;

  await prisma.$transaction(async (tx) => {
    if (input.tags) {
      const tagIds = await resolveTagIds(input.tags);
      await tx.blogPostTag.deleteMany({ where: { postId: id } });
      if (tagIds.length > 0) {
        await tx.blogPostTag.createMany({ data: tagIds.map((tagId) => ({ postId: id, tagId })) });
      }
    }

    await tx.blogPost.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}),
        ...(input.body !== undefined
          ? { body: jsonOrDbNull(input.body), readingMinutes: estimateReadingMinutes(input.body) }
          : {}),
        ...(input.coverMediaId !== undefined ? { coverMediaId: input.coverMediaId } : {}),
        ...(input.authorId !== undefined ? { authorId: input.authorId } : {}),
        ...(input.status !== undefined ? { status: input.status as never } : {}),
        ...(input.publishedAt !== undefined
          ? { publishedAt: input.publishedAt }
          : input.status === 'PUBLISHED' && !existing.publishedAt
            ? { publishedAt: new Date() }
            : {}),
      },
    });
  });

  if (input.seo) await upsertSeo({ blogPostId: id }, input.seo);

  return getPostById(id, locale);
}

export async function deletePost(id: string): Promise<void> {
  const post = await prisma.blogPost.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!post) throw new NotFoundError('Article');
  await prisma.blogPost.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
}

export async function listBlogTags(): Promise<{ slug: string; name: string; count: number }[]> {
  const tags = await prisma.tag.findMany({
    where: { blogPosts: { some: { post: { status: 'PUBLISHED', deletedAt: null } } } },
    select: { slug: true, name: true, _count: { select: { blogPosts: true } } },
    orderBy: { name: 'asc' },
  });
  return tags.map((tag) => ({ slug: tag.slug, name: tag.name, count: tag._count.blogPosts }));
}
