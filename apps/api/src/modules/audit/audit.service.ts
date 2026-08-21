import type { Request } from 'express';
import type { AuditLogDto, PaginatedResult } from '@academy/types';
import { jsonOrDbNull, prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { buildPaginationMeta, getClientIp, getUserAgent, toSkipTake } from '../../lib/http.js';

/**
 * Audit actions.
 *
 * Fixed strings rather than free text so the log stays filterable and a typo in
 * one call site cannot fragment the history of an action.
 */
export const AUDIT_ACTIONS = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_ROLES_CHANGED: 'user.roles_changed',
  USER_STATUS_CHANGED: 'user.status_changed',
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  COURSE_CREATED: 'course.created',
  COURSE_UPDATED: 'course.updated',
  COURSE_DELETED: 'course.deleted',
  COURSE_STATUS_CHANGED: 'course.status_changed',
  COURSE_DUPLICATED: 'course.duplicated',
  LESSON_CREATED: 'lesson.created',
  LESSON_UPDATED: 'lesson.updated',
  LESSON_DELETED: 'lesson.deleted',
  LESSON_PDF_IMPORTED: 'lesson.pdf_imported',
  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  CATEGORY_DELETED: 'category.deleted',
  PAGE_CREATED: 'page.created',
  PAGE_UPDATED: 'page.updated',
  PAGE_DELETED: 'page.deleted',
  PAGE_STATUS_CHANGED: 'page.status_changed',
  SECTION_CREATED: 'section.created',
  SECTION_UPDATED: 'section.updated',
  SECTION_DELETED: 'section.deleted',
  SECTIONS_REORDERED: 'section.reordered',
  MENU_UPDATED: 'menu.updated',
  MEDIA_UPLOADED: 'media.uploaded',
  MEDIA_DELETED: 'media.deleted',
  SETTINGS_UPDATED: 'settings.updated',
  FEATURE_TOGGLED: 'feature.toggled',
  LANGUAGE_UPDATED: 'language.updated',
  TRANSLATIONS_UPDATED: 'translations.updated',
  LEGAL_PUBLISHED: 'legal.published',
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ENROLLMENT_CREATED: 'enrollment.created',
  ENROLLMENT_CANCELLED: 'enrollment.cancelled',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface RecordAuditInput {
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** Small, non-sensitive summary of what changed. Never credentials. */
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit entry.
 *
 * Deliberately never throws: an audit write failing must not roll back the
 * operation the admin actually performed. Failures are logged loudly instead.
 */
export async function recordAudit(req: Request, input: RecordAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        actorEmail: req.user?.email ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: jsonOrDbNull(input.metadata),
        ipAddress: getClientIp(req) ?? null,
        userAgent: getUserAgent(req) ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'Failed to write audit log entry');
  }
}

interface ListAuditInput {
  page: number;
  pageSize: number;
  action?: string;
  actorId?: string;
  targetType?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditLogs(input: ListAuditInput): Promise<PaginatedResult<AuditLogDto>> {
  const where = {
    ...(input.action ? { action: input.action } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { action: { contains: input.search, mode: 'insensitive' as const } },
            { actorEmail: { contains: input.search, mode: 'insensitive' as const } },
            { targetId: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata as Record<string, unknown> | null,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor,
    })),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}
