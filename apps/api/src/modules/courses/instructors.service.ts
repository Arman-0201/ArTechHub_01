import type { InstructorDto } from '@academy/types';
import { jsonOrJsonNull, prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { uniqueSlug } from '../../lib/slug.js';
import { resolveMediaUrl } from '../media/media.helpers.js';

const instructorSelect = {
  id: true,
  slug: true,
  userId: true,
  name: true,
  headline: true,
  bio: true,
  links: true,
  isActive: true,
  sortOrder: true,
  avatar: { select: { url: true, storageKey: true, storageDriver: true } },
  _count: { select: { courses: true } },
} as const;

type InstructorRow = {
  id: string;
  slug: string;
  userId: string | null;
  name: string;
  headline: string | null;
  bio: string | null;
  links: unknown;
  isActive: boolean;
  sortOrder: number;
  avatar: { url: string | null; storageKey: string; storageDriver: string } | null;
  _count: { courses: number };
};

function toDto(instructor: InstructorRow): InstructorDto {
  return {
    id: instructor.id,
    userId: instructor.userId,
    slug: instructor.slug,
    name: instructor.name,
    headline: instructor.headline,
    bio: instructor.bio,
    avatarUrl: instructor.avatar ? resolveMediaUrl(instructor.avatar) : null,
    links: Array.isArray(instructor.links)
      ? (instructor.links as { label: string; url: string }[])
      : [],
    courseCount: instructor._count.courses,
  };
}

export async function listInstructors(includeInactive = false): Promise<InstructorDto[]> {
  const instructors = await prisma.instructor.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: instructorSelect,
  });
  return instructors.map(toDto);
}

export async function getInstructorBySlug(slug: string): Promise<InstructorDto> {
  const instructor = await prisma.instructor.findUnique({ where: { slug }, select: instructorSelect });
  if (!instructor) throw new NotFoundError('Instructor');
  return toDto(instructor);
}

export interface InstructorInput {
  name: string;
  slug?: string;
  userId?: string | null;
  headline?: string | null;
  bio?: string | null;
  avatarMediaId?: string | null;
  links?: { label: string; url: string }[];
  isActive?: boolean;
}

export async function createInstructor(input: InstructorInput): Promise<InstructorDto> {
  if (input.userId) {
    const taken = await prisma.instructor.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });
    if (taken) throw new ConflictError('That user already has an instructor profile');
  }

  const slug = await uniqueSlug(
    input.slug ?? input.name,
    async (candidate) => (await prisma.instructor.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'instructor' },
  );

  const instructor = await prisma.instructor.create({
    data: {
      slug,
      name: input.name,
      userId: input.userId ?? null,
      headline: input.headline ?? null,
      bio: input.bio ?? null,
      avatarMediaId: input.avatarMediaId ?? null,
      links: jsonOrJsonNull(input.links ?? []),
      isActive: input.isActive ?? true,
    },
    select: instructorSelect,
  });

  return toDto(instructor);
}

export async function updateInstructor(
  id: string,
  input: Partial<InstructorInput>,
): Promise<InstructorDto> {
  const existing = await prisma.instructor.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) throw new NotFoundError('Instructor');

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(
          input.slug,
          async (candidate) =>
            (await prisma.instructor.count({ where: { slug: candidate, id: { not: id } } })) > 0,
          { fallbackPrefix: 'instructor' },
        )
      : undefined;

  const instructor = await prisma.instructor.update({
    where: { id },
    data: {
      ...(slug ? { slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.avatarMediaId !== undefined ? { avatarMediaId: input.avatarMediaId } : {}),
      ...(input.links !== undefined ? { links: jsonOrJsonNull(input.links) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: instructorSelect,
  });

  return toDto(instructor);
}

export async function deleteInstructor(id: string): Promise<void> {
  const instructor = await prisma.instructor.findUnique({
    where: { id },
    select: { id: true, _count: { select: { courses: true } } },
  });
  if (!instructor) throw new NotFoundError('Instructor');

  if (instructor._count.courses > 0) {
    // Removing the row would silently drop the author from published courses,
    // so deactivation is the correct operation here.
    throw new ConflictError(
      `This instructor is assigned to ${instructor._count.courses} course(s). Deactivate them instead.`,
    );
  }

  await prisma.instructor.delete({ where: { id } });
}
