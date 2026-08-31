import type { Prisma } from '@prisma/client';
import type {
  CartDto,
  OrderDto,
  PaginatedResult,
  ProductDto,
  RichTextDocument,
  SeoDto,
} from '@academy/types';
import { jsonOrDbNull, prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { generateReference } from '../../lib/crypto.js';
import { uniqueSlug } from '../../lib/slug.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { toSeoDto, upsertSeo } from '../seo/seo.service.js';
import { REALTIME_RESOURCES } from '@academy/types';
import { announceLearnerChange, announceVisitorActivity } from '../../realtime/events.js';

/**
 * E-commerce module.
 *
 * Feature-flagged at the router level; nothing here assumes the shop is on.
 *
 * Two rules shape the design:
 *   - Prices are integer minor units (cents). Floating-point money is a
 *     rounding bug waiting to happen.
 *   - The cart the browser sends is a list of ids and quantities, never prices.
 *     Every total is recomputed server-side from the current product rows, so a
 *     tampered payload cannot change what an order costs.
 */

const productSelect = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  description: true,
  type: true,
  priceCents: true,
  compareAtPriceCents: true,
  currency: true,
  stock: true,
  isActive: true,
  category: { select: { id: true, slug: true, name: true } },
  images: {
    orderBy: { sortOrder: 'asc' },
    select: {
      media: { select: { url: true, storageKey: true, storageDriver: true, altText: true } },
    },
  },
  seo: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

function toProductDto(product: ProductRow): ProductDto {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    description: (product.description as RichTextDocument | null) ?? null,
    type: product.type,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    currency: product.currency,
    stock: product.stock,
    isActive: product.isActive,
    images: product.images.map((image) => ({
      url: resolveMediaUrl(image.media),
      alt: image.media.altText,
    })),
    category: product.category,
    seo: product.seo ? toSeoDto(product.seo) : null,
  };
}

/* ------------------------------------------------------------------ catalogue */

export interface ListProductsInput {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  type?: string;
  isActive?: boolean;
  includeInactive?: boolean;
}

export async function listProducts(input: ListProductsInput): Promise<PaginatedResult<ProductDto>> {
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(input.includeInactive
      ? input.isActive !== undefined
        ? { isActive: input.isActive }
        : {}
      : { isActive: true }),
    ...(input.category ? { category: { slug: input.category } } : {}),
    ...(input.type ? { type: input.type as never } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' } },
            { summary: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: productSelect }),
    prisma.product.count({ where }),
  ]);

  return {
    items: products.map(toProductDto),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}

export async function getProductBySlug(slug: string, includeInactive = false): Promise<ProductDto> {
  const product = await prisma.product.findFirst({
    where: { slug, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    select: productSelect,
  });
  if (!product) throw new NotFoundError('Product');
  return toProductDto(product);
}

export async function getProductById(id: string): Promise<ProductDto> {
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    select: productSelect,
  });
  if (!product) throw new NotFoundError('Product');
  return toProductDto(product);
}

export interface ProductInput {
  name: string;
  slug?: string;
  summary?: string | null;
  description?: RichTextDocument | null;
  type?: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
  currency?: string;
  stock?: number | null;
  isActive?: boolean;
  categoryId?: string | null;
  imageMediaIds?: string[];
  seo?: Partial<SeoDto>;
}

export async function createProduct(input: ProductInput): Promise<ProductDto> {
  const slug = await uniqueSlug(
    input.slug ?? input.name,
    async (candidate) => (await prisma.product.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'product' },
  );

  const product = await prisma.product.create({
    data: {
      slug,
      name: input.name,
      summary: input.summary ?? null,
      description: jsonOrDbNull(input.description),
      type: (input.type as never) ?? 'PHYSICAL',
      priceCents: input.priceCents,
      compareAtPriceCents: input.compareAtPriceCents ?? null,
      currency: input.currency ?? 'USD',
      stock: input.stock ?? null,
      isActive: input.isActive ?? false,
      categoryId: input.categoryId ?? null,
      images: {
        create: (input.imageMediaIds ?? []).map((mediaId, index) => ({ mediaId, sortOrder: index })),
      },
    },
    select: { id: true },
  });

  if (input.seo) await upsertSeo({ productId: product.id }, input.seo);

  return getProductById(product.id);
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<ProductDto> {
  const existing = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!existing) throw new NotFoundError('Product');

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(
          input.slug,
          async (candidate) =>
            (await prisma.product.count({ where: { slug: candidate, id: { not: id } } })) > 0,
          { fallbackPrefix: 'product' },
        )
      : undefined;

  await prisma.$transaction(async (tx) => {
    if (input.imageMediaIds) {
      await tx.productImage.deleteMany({ where: { productId: id } });
      if (input.imageMediaIds.length > 0) {
        await tx.productImage.createMany({
          data: input.imageMediaIds.map((mediaId, index) => ({
            productId: id,
            mediaId,
            sortOrder: index,
          })),
        });
      }
    }

    await tx.product.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.description !== undefined ? { description: jsonOrDbNull(input.description) } : {}),
        ...(input.type !== undefined ? { type: input.type as never } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.compareAtPriceCents !== undefined
          ? { compareAtPriceCents: input.compareAtPriceCents }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      },
    });
  });

  if (input.seo) await upsertSeo({ productId: id }, input.seo);

  return getProductById(id);
}

export async function deleteProduct(id: string): Promise<void> {
  // Soft delete: past order items keep a working link back to the product.
  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

export async function listProductCategories() {
  return prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, slug: true, name: true, description: true },
  });
}

/* ----------------------------------------------------------------------- cart */

/**
 * Prices the client's cart from live product rows.
 * The request supplies only ids and quantities.
 */
export async function priceCart(lines: { productId: string; quantity: number }[]): Promise<CartDto> {
  if (lines.length === 0) {
    return { lines: [], subtotalCents: 0, currency: 'USD', itemCount: 0 };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) }, isActive: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      priceCents: true,
      currency: true,
      stock: true,
      images: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { media: { select: { url: true, storageKey: true, storageDriver: true } } },
      },
    },
  });

  const byId = new Map(products.map((product) => [product.id, product]));
  const cartLines: CartDto['lines'] = [];
  let subtotalCents = 0;

  for (const line of lines) {
    const product = byId.get(line.productId);
    // Silently drop lines for products that have been deactivated since the
    // cart was built — the response tells the client what is actually orderable.
    if (!product) continue;

    const quantity =
      product.stock !== null ? Math.min(line.quantity, Math.max(0, product.stock)) : line.quantity;
    if (quantity <= 0) continue;

    const lineTotalCents = product.priceCents * quantity;
    subtotalCents += lineTotalCents;

    cartLines.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl: product.images[0] ? resolveMediaUrl(product.images[0].media) : null,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents,
      currency: product.currency,
    });
  }

  return {
    lines: cartLines,
    subtotalCents,
    currency: cartLines[0]?.currency ?? 'USD',
    itemCount: cartLines.reduce((total, line) => total + line.quantity, 0),
  };
}

/* --------------------------------------------------------------------- orders */

export interface CheckoutInput {
  userId?: string | null;
  lines: { productId: string; quantity: number }[];
  customer: { name: string; email: string; phone?: string };
  shippingAddress?: Record<string, unknown>;
  notes?: string;
}

/**
 * Creates an order.
 *
 * Payment is deliberately not implemented against a specific provider: the
 * order is created in AWAITING_PAYMENT and carries provider-agnostic
 * `paymentProvider`/`paymentReference` columns. Integrating Stripe, Adyen or a
 * local gateway means adding one adapter that fills those in and moves the
 * status — no changes to this function or the schema.
 */
export async function createOrder(input: CheckoutInput): Promise<OrderDto> {
  const cart = await priceCart(input.lines);
  if (cart.lines.length === 0) {
    throw new BadRequestError('None of the items in your cart are available');
  }

  const order = await prisma.$transaction(async (tx) => {
    // Re-check stock inside the transaction: the availability seen while
    // pricing could be stale by now.
    for (const line of cart.lines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { stock: true, name: true },
      });
      if (product?.stock !== null && product?.stock !== undefined && product.stock < line.quantity) {
        throw new ConflictError(`${product.name} does not have enough stock left`);
      }
    }

    const created = await tx.order.create({
      data: {
        reference: generateReference('ORD'),
        userId: input.userId ?? null,
        status: 'AWAITING_PAYMENT',
        customerName: input.customer.name,
        customerEmail: input.customer.email,
        customerPhone: input.customer.phone ?? null,
        shippingAddress: jsonOrDbNull(input.shippingAddress),
        notes: input.notes ?? null,
        subtotalCents: cart.subtotalCents,
        totalCents: cart.subtotalCents,
        currency: cart.currency,
        items: {
          create: cart.lines.map((line) => ({
            productId: line.productId,
            name: line.name,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            totalCents: line.lineTotalCents,
          })),
        },
      },
      select: { id: true },
    });

    for (const line of cart.lines) {
      await tx.product.updateMany({
        where: { id: line.productId, stock: { not: null } },
        data: { stock: { decrement: line.quantity } },
      });
    }

    return created;
  });

  // A guest checkout has no account to tell, and no order history to update.
  announceLearnerChange(input.userId, ['orders']);

  /*
   * The admins do get told, guest checkout included — an order is an order.
   *
   * This is the event the order screen exists for. Checkout runs on a public
   * route with no audit entry behind it, so without this line a sale lands in
   * the database and no open admin tab knows until someone reloads.
   *
   * `products` because the transaction above decremented stock, which the
   * product list shows.
   */
  announceVisitorActivity([REALTIME_RESOURCES.ORDERS, REALTIME_RESOURCES.PRODUCTS]);

  return getOrderById(order.id);
}

const orderSelect = {
  id: true,
  reference: true,
  status: true,
  subtotalCents: true,
  totalCents: true,
  currency: true,
  createdAt: true,
  customerName: true,
  customerEmail: true,
  items: {
    select: {
      id: true,
      productId: true,
      name: true,
      unitPriceCents: true,
      quantity: true,
      totalCents: true,
    },
  },
} satisfies Prisma.OrderSelect;

function toOrderDto(order: Prisma.OrderGetPayload<{ select: typeof orderSelect }>): OrderDto {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    customer: { name: order.customerName, email: order.customerEmail },
    items: order.items,
  };
}

export async function getOrderById(id: string): Promise<OrderDto> {
  const order = await prisma.order.findUnique({ where: { id }, select: orderSelect });
  if (!order) throw new NotFoundError('Order');
  return toOrderDto(order);
}

/**
 * Fetches an order on behalf of a specific user.
 * The ownership check is the point: without it, changing the id in the URL
 * would expose someone else's order.
 */
export async function getOrderForUser(id: string, userId: string): Promise<OrderDto> {
  const order = await prisma.order.findFirst({ where: { id, userId }, select: orderSelect });
  if (!order) throw new NotFoundError('Order');
  return toOrderDto(order);
}

export async function listOrdersForUser(
  userId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<OrderDto>> {
  const { skip, take } = toSkipTake(page, pageSize);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: orderSelect,
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return { items: orders.map(toOrderDto), meta: buildPaginationMeta(total, page, pageSize) };
}

export async function adminListOrders(input: {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResult<OrderDto>> {
  const where: Prisma.OrderWhereInput = {
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.search
      ? {
          OR: [
            { reference: { contains: input.search, mode: 'insensitive' } },
            { customerEmail: { contains: input.search, mode: 'insensitive' } },
            { customerName: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: orderSelect }),
    prisma.order.count({ where }),
  ]);

  return { items: orders.map(toOrderDto), meta: buildPaginationMeta(total, input.page, input.pageSize) };
}

export async function updateOrderStatus(id: string, status: string): Promise<OrderDto> {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      // Read here so the buyer can be told their order moved. An admin marking
      // an order paid is the case this exists for: the person watching their
      // order page is not the person who changed it.
      userId: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!order) throw new NotFoundError('Order');

  // Cancelling or refunding returns reserved stock to the shelf.
  const releasesStock =
    (status === 'CANCELLED' || status === 'REFUNDED') &&
    order.status !== 'CANCELLED' &&
    order.status !== 'REFUNDED';

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data: {
        status: status as never,
        ...(status === 'PAID' ? { paidAt: new Date() } : {}),
      },
    });

    if (releasesStock) {
      for (const item of order.items) {
        if (!item.productId) continue;
        await tx.product.updateMany({
          where: { id: item.productId, stock: { not: null } },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
  });

  announceLearnerChange(order.userId, ['orders']);

  return getOrderById(id);
}
