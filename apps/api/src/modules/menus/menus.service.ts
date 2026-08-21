import type { MenuDto, MenuItemDto, MenuLinkType, SiteBootstrapDto } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { CACHE_KEYS, platformCache } from '../../lib/cache.js';
import { applyTranslation, pickTranslation } from '../translations/translation.helpers.js';

/**
 * Navigation is data, never code. The frontend renders whatever the API
 * returns, so an administrator can restructure the menu without a deploy.
 *
 * Two filters are applied server-side rather than in the browser:
 *   - locale visibility, so a menu item can exist only in some languages;
 *   - role visibility, so staff-only entries are not present in the payload
 *     sent to an anonymous visitor at all.
 */

export const MENU_SLUGS = {
  header: 'header',
  footer: 'footer',
  mobile: 'mobile',
} as const;

interface MenuItemRow {
  id: string;
  parentId: string | null;
  label: string;
  url: string;
  linkType: string;
  target: string;
  iconName: string | null;
  sortOrder: number;
  isVisible: boolean;
  visibleForRoles: string[];
  visibleForLocales: string[];
  translations: { locale: string; label: string }[];
}

interface BuildOptions {
  locale: string;
  roleSlugs: string[];
  includeHidden: boolean;
}

function isItemVisible(item: MenuItemRow, options: BuildOptions): boolean {
  if (options.includeHidden) return true;
  if (!item.isVisible) return false;

  if (item.visibleForLocales.length > 0 && !item.visibleForLocales.includes(options.locale)) {
    return false;
  }
  if (item.visibleForRoles.length > 0) {
    return item.visibleForRoles.some((role) => options.roleSlugs.includes(role));
  }
  return true;
}

function buildItemTree(items: MenuItemRow[], options: BuildOptions): MenuItemDto[] {
  const visible = items.filter((item) => isItemVisible(item, options));
  const byParent = new Map<string | null, MenuItemRow[]>();

  for (const item of visible) {
    const bucket = byParent.get(item.parentId) ?? [];
    bucket.push(item);
    byParent.set(item.parentId, bucket);
  }

  const build = (parentId: string | null): MenuItemDto[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => {
        const translation = pickTranslation(item.translations, options.locale);
        return {
          id: item.id,
          label: applyTranslation(item.label, translation?.label),
          url: item.url,
          linkType: item.linkType as MenuLinkType,
          target: item.target === '_blank' ? '_blank' : '_self',
          iconName: item.iconName,
          sortOrder: item.sortOrder,
          isVisible: item.isVisible,
          visibleForRoles: item.visibleForRoles,
          visibleForLocales: item.visibleForLocales,
          children: build(item.id),
        };
      });

  return build(null);
}

export async function getMenu(
  slug: string,
  options: BuildOptions,
): Promise<MenuDto | null> {
  const menu = await prisma.menu.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      items: {
        select: {
          id: true,
          parentId: true,
          label: true,
          url: true,
          linkType: true,
          target: true,
          iconName: true,
          sortOrder: true,
          isVisible: true,
          visibleForRoles: true,
          visibleForLocales: true,
          translations: { select: { locale: true, label: true } },
        },
      },
    },
  });

  if (!menu) return null;

  return {
    id: menu.id,
    slug: menu.slug,
    name: menu.name,
    items: buildItemTree(menu.items, options),
  };
}

export async function listMenus(): Promise<{ id: string; slug: string; name: string; itemCount: number }[]> {
  const menus = await prisma.menu.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true, _count: { select: { items: true } } },
  });
  return menus.map((menu) => ({
    id: menu.id,
    slug: menu.slug,
    name: menu.name,
    itemCount: menu._count.items,
  }));
}

export async function createMenu(input: { name: string; slug: string; description?: string | null }) {
  return prisma.menu.create({
    data: { name: input.name, slug: input.slug, description: input.description ?? null },
  });
}

export interface MenuItemInput {
  label: string;
  url: string;
  linkType?: string;
  target?: string;
  iconName?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
  visibleForRoles?: string[];
  visibleForLocales?: string[];
}

export async function addMenuItem(menuSlug: string, input: MenuItemInput): Promise<MenuItemDto[]> {
  const menu = await prisma.menu.findUnique({ where: { slug: menuSlug }, select: { id: true } });
  if (!menu) throw new NotFoundError('Menu');

  if (input.parentId) await assertParentInMenu(input.parentId, menu.id);

  const sortOrder =
    input.sortOrder ??
    ((
      await prisma.menuItem.aggregate({
        where: { menuId: menu.id, parentId: input.parentId ?? null },
        _max: { sortOrder: true },
      })
    )._max.sortOrder ?? -1) + 1;

  await prisma.menuItem.create({
    data: {
      menuId: menu.id,
      parentId: input.parentId ?? null,
      label: input.label,
      url: input.url,
      linkType: (input.linkType as never) ?? 'INTERNAL',
      target: input.target ?? '_self',
      iconName: input.iconName ?? null,
      sortOrder,
      isVisible: input.isVisible ?? true,
      visibleForRoles: input.visibleForRoles ?? [],
      visibleForLocales: input.visibleForLocales ?? [],
    },
  });

  invalidateMenuCache(menuSlug);
  return getMenuItemsForAdmin(menuSlug);
}

export async function updateMenuItem(
  itemId: string,
  input: Partial<MenuItemInput>,
): Promise<MenuItemDto[]> {
  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    select: { id: true, menuId: true, menu: { select: { slug: true } } },
  });
  if (!item) throw new NotFoundError('Menu item');

  if (input.parentId) {
    await assertParentInMenu(input.parentId, item.menuId);
    await assertNoCycle(itemId, input.parentId);
  }

  await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.linkType !== undefined ? { linkType: input.linkType as never } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
      ...(input.visibleForRoles !== undefined ? { visibleForRoles: input.visibleForRoles } : {}),
      ...(input.visibleForLocales !== undefined
        ? { visibleForLocales: input.visibleForLocales }
        : {}),
    },
  });

  invalidateMenuCache(item.menu.slug);
  return getMenuItemsForAdmin(item.menu.slug);
}

export async function deleteMenuItem(itemId: string): Promise<MenuItemDto[]> {
  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    select: { id: true, menu: { select: { slug: true } } },
  });
  if (!item) throw new NotFoundError('Menu item');

  // Children cascade with the parent — deleting a submenu head removes the
  // whole branch rather than orphaning it.
  await prisma.menuItem.delete({ where: { id: itemId } });

  invalidateMenuCache(item.menu.slug);
  return getMenuItemsForAdmin(item.menu.slug);
}

/**
 * Applies a drag-and-drop rearrangement.
 *
 * The client sends the entire tree as (id, parentId, sortOrder) triples. Every
 * id is verified to belong to this menu before anything is written, so a
 * crafted payload cannot graft items across menus.
 */
export async function reorderMenu(
  menuSlug: string,
  items: { id: string; parentId: string | null; sortOrder: number }[],
): Promise<MenuItemDto[]> {
  const menu = await prisma.menu.findUnique({ where: { slug: menuSlug }, select: { id: true } });
  if (!menu) throw new NotFoundError('Menu');

  const owned = await prisma.menuItem.findMany({
    where: { menuId: menu.id },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((item) => item.id));

  for (const item of items) {
    if (!ownedIds.has(item.id)) {
      throw new BadRequestError('One or more items do not belong to this menu');
    }
    if (item.parentId && !ownedIds.has(item.parentId)) {
      throw new BadRequestError('One or more parents do not belong to this menu');
    }
    if (item.parentId === item.id) {
      throw new BadRequestError('An item cannot be its own parent');
    }
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.menuItem.update({
        where: { id: item.id },
        data: { parentId: item.parentId, sortOrder: item.sortOrder },
      }),
    ),
  );

  invalidateMenuCache(menuSlug);
  return getMenuItemsForAdmin(menuSlug);
}

/** Admin view: every item regardless of visibility rules. */
export async function getMenuItemsForAdmin(menuSlug: string): Promise<MenuItemDto[]> {
  const menu = await getMenu(menuSlug, { locale: 'en', roleSlugs: [], includeHidden: true });
  return menu?.items ?? [];
}

async function assertParentInMenu(parentId: string, menuId: string): Promise<void> {
  const parent = await prisma.menuItem.findUnique({
    where: { id: parentId },
    select: { menuId: true, parentId: true },
  });
  if (!parent || parent.menuId !== menuId) {
    throw new BadRequestError('Parent item does not belong to this menu');
  }
  // Two levels of nesting is what the header renderer supports.
  if (parent.parentId) {
    throw new BadRequestError('Menus support two levels of nesting');
  }
}

async function assertNoCycle(itemId: string, parentId: string): Promise<void> {
  let cursor: string | null = parentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === itemId) throw new BadRequestError('That move would create a loop in the menu');
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const next: { parentId: string | null } | null = await prisma.menuItem.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = next?.parentId ?? null;
  }
}

function invalidateMenuCache(slug: string): void {
  platformCache.invalidate(CACHE_KEYS.menu(slug));
}

/* -------------------------------------------------------------------- footer */

export async function getFooter(): Promise<SiteBootstrapDto['footer']> {
  return platformCache.remember(
    CACHE_KEYS.footer,
    async () => {
      const groups = await prisma.footerGroup.findMany({
        where: { isVisible: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          links: {
            where: { isVisible: true },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, label: true, url: true, target: true },
          },
        },
      });

      return {
        groups: groups.map((group) => ({
          id: group.id,
          title: group.title,
          links: group.links.map((link) => ({
            id: link.id,
            label: link.label,
            url: link.url,
            target: (link.target === '_blank' ? '_blank' : '_self') as '_self' | '_blank',
          })),
        })),
        socialLinks: [],
        copyright: null,
      };
    },
    60_000,
  );
}

export async function listFooterGroupsForAdmin() {
  return prisma.footerGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { links: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function createFooterGroup(input: { title: string; sortOrder?: number }) {
  const group = await prisma.footerGroup.create({
    data: { title: input.title, sortOrder: input.sortOrder ?? 0 },
  });
  platformCache.invalidate(CACHE_KEYS.footer);
  return group;
}

export async function updateFooterGroup(
  id: string,
  input: { title?: string; sortOrder?: number; isVisible?: boolean },
) {
  const group = await prisma.footerGroup.update({ where: { id }, data: input });
  platformCache.invalidate(CACHE_KEYS.footer);
  return group;
}

export async function deleteFooterGroup(id: string): Promise<void> {
  await prisma.footerGroup.delete({ where: { id } });
  platformCache.invalidate(CACHE_KEYS.footer);
}

export async function createFooterLink(
  groupId: string,
  input: { label: string; url: string; target?: string; sortOrder?: number },
) {
  const link = await prisma.footerLink.create({
    data: {
      groupId,
      label: input.label,
      url: input.url,
      target: input.target ?? '_self',
      sortOrder: input.sortOrder ?? 0,
    },
  });
  platformCache.invalidate(CACHE_KEYS.footer);
  return link;
}

export async function updateFooterLink(
  id: string,
  input: { label?: string; url?: string; target?: string; sortOrder?: number; isVisible?: boolean },
) {
  const link = await prisma.footerLink.update({ where: { id }, data: input });
  platformCache.invalidate(CACHE_KEYS.footer);
  return link;
}

export async function deleteFooterLink(id: string): Promise<void> {
  await prisma.footerLink.delete({ where: { id } });
  platformCache.invalidate(CACHE_KEYS.footer);
}
