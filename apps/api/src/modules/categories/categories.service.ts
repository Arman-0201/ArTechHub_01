import type { Prisma } from '@prisma/client';
import type { CategoryDto, SeoDto } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { uniqueSlug } from '../../lib/slug.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { applyTranslation, pickTranslation } from '../translations/translation.helpers.js';
import { upsertSeo, toSeoDto } from '../seo/seo.service.js';

const categorySelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  iconName: true,
  colorHex: true,
  parentId: true,
  sortOrder: true,
  isActive: true,
  image: { select: { url: true, storageKey: true, storageDriver: true } },
  translations: { select: { locale: true, name: true, description: true } },
  seo: true,
  _count: { select: { courses: true } },
} satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

function toDto(category: CategoryRow, locale: string): CategoryDto {
  // Translated name/description win over the source-language columns; missing
  // translations fall back rather than rendering an empty card.
  const translation = pickTranslation(category.translations, locale);

  return {
    id: category.id,
    slug: category.slug,
    name: applyTranslation(category.name, translation?.name),
    description: applyTranslation(category.description, translation?.description),
    iconName: category.iconName,
    imageUrl: category.image ? resolveMediaUrl(category.image) : null,
    colorHex: category.colorHex,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    courseCount: category._count.courses,
    seo: category.seo ? toSeoDto(category.seo) : null,
  };
}

/** Nests a flat list into a parent/child tree, preserving sort order. */
function buildTree(categories: CategoryDto[]): CategoryDto[] {
  const byId = new Map(categories.map((category) => [category.id, { ...category, children: [] as CategoryDto[] }]));
  const roots: CategoryDto[] = [];

  for (const category of byId.values()) {
    if (category.parentId && byId.has(category.parentId)) {
      byId.get(category.parentId)!.children!.push(category);
    } else {
      roots.push(category);
    }
  }

  return roots;
}

export interface ListCategoriesInput {
  locale: string;
  parentId?: string | null;
  isActive?: boolean;
  tree?: boolean;
  search?: string;
}

export async function listCategories(input: ListCategoriesInput): Promise<CategoryDto[]> {
  const where: Prisma.CategoryWhereInput = {
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.parentId !== undefined && !input.tree ? { parentId: input.parentId } : {}),
    ...(input.search ? { name: { contains: input.search, mode: 'insensitive' } } : {}),
  };

  const categories = await prisma.category.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: categorySelect,
  });

  const dtos = categories.map((category) => toDto(category, input.locale));
  return input.tree ? buildTree(dtos) : dtos;
}

export async function getCategoryBySlug(slug: string, locale: string): Promise<CategoryDto> {
  const category = await prisma.category.findUnique({ where: { slug }, select: categorySelect });
  if (!category) throw new NotFoundError('Category');

  const children = await prisma.category.findMany({
    where: { parentId: category.id, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: categorySelect,
  });

  return {
    ...toDto(category, locale),
    children: children.map((child) => toDto(child, locale)),
  };
}

export async function getCategoryById(id: string, locale: string): Promise<CategoryDto> {
  const category = await prisma.category.findUnique({ where: { id }, select: categorySelect });
  if (!category) throw new NotFoundError('Category');
  return toDto(category, locale);
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  iconName?: string | null;
  imageMediaId?: string | null;
  colorHex?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  seo?: Partial<SeoDto>;
}

export async function createCategory(input: CategoryInput, locale: string): Promise<CategoryDto> {
  if (input.parentId) await assertParentIsValid(input.parentId, null);

  const slug = await uniqueSlug(
    input.slug ?? input.name,
    async (candidate) => (await prisma.category.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'category' },
  );

  const category = await prisma.category.create({
    data: {
      slug,
      name: input.name,
      description: input.description ?? null,
      iconName: input.iconName ?? null,
      imageMediaId: input.imageMediaId ?? null,
      colorHex: input.colorHex ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
    select: categorySelect,
  });

  if (input.seo) await upsertSeo({ categoryId: category.id }, input.seo);

  return getCategoryById(category.id, locale);
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput>,
  locale: string,
): Promise<CategoryDto> {
  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!existing) throw new NotFoundError('Category');

  if (input.parentId !== undefined && input.parentId !== null) {
    await assertParentIsValid(input.parentId, id);
  }

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(
          input.slug,
          async (candidate) =>
            (await prisma.category.count({ where: { slug: candidate, id: { not: id } } })) > 0,
          { fallbackPrefix: 'category' },
        )
      : undefined;

  await prisma.category.update({
    where: { id },
    data: {
      ...(slug ? { slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
      ...(input.imageMediaId !== undefined ? { imageMediaId: input.imageMediaId } : {}),
      ...(input.colorHex !== undefined ? { colorHex: input.colorHex } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  if (input.seo) await upsertSeo({ categoryId: id }, input.seo);

  return getCategoryById(id, locale);
}

export async function deleteCategory(id: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, _count: { select: { courses: true, children: true } } },
  });
  if (!category) throw new NotFoundError('Category');

  if (category._count.courses > 0) {
    throw new ConflictError(
      `${category._count.courses} course(s) still use this category. Move them first.`,
    );
  }
  if (category._count.children > 0) {
    throw new ConflictError('Delete or move the subcategories first');
  }

  await prisma.category.delete({ where: { id } });
}

export async function reorderCategories(items: { id: string; sortOrder: number }[]): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      prisma.category.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }),
    ),
  );
}

/**
 * Prevents a category from becoming its own ancestor, which would make the tree
 * builder loop forever and orphan every descendant.
 */
async function assertParentIsValid(parentId: string, childId: string | null): Promise<void> {
  if (childId && parentId === childId) {
    throw new BadRequestError('A category cannot be its own parent');
  }

  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true },
  });
  if (!parent) throw new BadRequestError('Parent category does not exist');

  // Two levels is the documented depth (Category > Subcategory > Course).
  if (parent.parentId) {
    throw new BadRequestError('Categories support one level of nesting');
  }

  if (childId) {
    const descendants = await prisma.category.findMany({
      where: { parentId: childId },
      select: { id: true },
    });
    if (descendants.some((descendant) => descendant.id === parentId)) {
      throw new BadRequestError('That would create a circular category tree');
    }
  }
}

export async function upsertCategoryTranslation(
  categoryId: string,
  locale: string,
  input: { name: string; description?: string | null },
): Promise<void> {
  await prisma.categoryTranslation.upsert({
    where: { categoryId_locale: { categoryId, locale } },
    create: { categoryId, locale, name: input.name, description: input.description ?? null },
    update: { name: input.name, description: input.description ?? null },
  });
}
