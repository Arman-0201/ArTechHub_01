'use client';

import { useState } from 'react';
import { Loader2, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { ProductDto, RichTextDocument } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { formatPrice } from '@/lib/utils';
import { useAuth, useSite } from '@/components/providers';
import { Alert, Badge, Button, Card, Checkbox, Input, Select, Textarea } from '@/components/ui';
import {
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  Modal,
  TableCell,
  TableRow,
} from './primitives';
import { ClientPagination } from './users-client';
import { RichTextEditor } from './rich-text-editor';
import { MediaPickerField } from './media-picker';

export function ProductsClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const { isFeatureEnabled } = useSite();
  const canManage = can(PERMISSIONS.PRODUCTS_MANAGE);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProductDto | null>(null);

  const productsQuery = useApiList<ProductDto>('/admin/products', {
    page,
    pageSize: 20,
    search: search || undefined,
  });

  const deleteMutation = useApiMutation(
    (product: ProductDto) => api.delete(`/admin/products/${product.id}`),
    ['/admin/products'],
    { onSuccess: () => setDeleting(null) },
  );

  return (
    <>
      <AdminPageHeader
        title="Products"
        description="Books, materials and digital goods sold through the shop."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New product
            </Button>
          ) : undefined
        }
      />

      {!isFeatureEnabled('SHOP_ENABLED') ? (
        <Alert tone="warning" title="The shop is switched off" className="mb-5">
          Products can be managed here, but the storefront, cart and checkout are unavailable to
          visitors until the Shop feature is enabled.
        </Alert>
      ) : null}

      <div className="mb-5">
        <Input
          type="search"
          placeholder="Search products…"
          aria-label="Search products"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leadingIcon={<Search className="size-4" />}
        />
      </div>

      {productsQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {productsQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Product', 'Type', 'Price', 'Stock', 'Status', '']}
        isLoading={productsQuery.isLoading}
        isEmpty={(productsQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No products yet."
      >
        {productsQuery.data?.items.map((product) => (
          <TableRow key={product.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="size-10 shrink-0 overflow-hidden rounded-md bg-surface-sunken">
                  {product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0].url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center" aria-hidden="true">
                      <Package className="size-4 text-text-muted" />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{product.name}</p>
                  <p className="truncate font-mono text-2xs text-text-muted">/{product.slug}</p>
                </div>
              </div>
            </TableCell>

            <TableCell className="text-xs">{product.type.toLowerCase()}</TableCell>

            <TableCell className="whitespace-nowrap text-sm font-medium text-text-primary">
              {formatPrice(product.priceCents, product.currency, locale)}
            </TableCell>

            <TableCell className="text-xs">
              {product.stock === null ? 'Unlimited' : product.stock}
            </TableCell>

            <TableCell>
              <Badge tone={product.isActive ? 'success' : 'neutral'}>
                {product.isActive ? 'active' : 'hidden'}
              </Badge>
            </TableCell>

            <TableCell align="right">
              {canManage ? (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(product.id)}
                    aria-label={`Edit ${product.name}`}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(product)}
                    aria-label={`Delete ${product.name}`}
                  >
                    <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {productsQuery.data?.meta && productsQuery.data.meta.totalPages > 1 ? (
        <ClientPagination meta={productsQuery.data.meta} onPageChange={setPage} className="mt-5" />
      ) : null}

      {creating ? <ProductModal onClose={() => setCreating(false)} /> : null}
      {editingId ? (
        <ProductModal productId={editingId} onClose={() => setEditingId(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Delete ${deleting?.name ?? 'product'}`}
        message="The product is removed from the shop. Past orders keep their record of it."
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function ProductModal({ productId, onClose }: { productId?: string; onClose: () => void }) {
  const isEditing = Boolean(productId);
  const productQuery = useApiResource<ProductDto>(
    productId ? `/admin/products/${productId}` : null,
  );

  const [form, setForm] = useState({
    name: '',
    slug: '',
    summary: '',
    description: { type: 'doc', content: [] } as RichTextDocument,
    type: 'PHYSICAL',
    // Prices are entered in major units and converted on submit — asking an
    // admin to type cents is a reliable way to get a 100× pricing error.
    price: '',
    currency: 'USD',
    stock: '',
    isActive: false,
    imageMediaIds: [] as string[],
  });
  const [isHydrated, setIsHydrated] = useState(!isEditing);
  const [error, setError] = useState<string | null>(null);

  if (productQuery.data && !isHydrated) {
    const product = productQuery.data;
    setForm({
      name: product.name,
      slug: product.slug,
      summary: product.summary ?? '',
      description: product.description ?? { type: 'doc', content: [] },
      type: product.type,
      price: (product.priceCents / 100).toFixed(2),
      currency: product.currency,
      stock: product.stock === null ? '' : String(product.stock),
      isActive: product.isActive,
      imageMediaIds: [],
    });
    setIsHydrated(true);
  }

  const mutation = useApiMutation(
    () => {
      const payload = {
        name: form.name,
        ...(form.slug ? { slug: form.slug } : {}),
        summary: form.summary || null,
        description: form.description,
        type: form.type,
        priceCents: Math.round(Number(form.price || '0') * 100),
        currency: form.currency,
        stock: form.stock === '' ? null : Number(form.stock),
        isActive: form.isActive,
        ...(form.imageMediaIds.length > 0 ? { imageMediaIds: form.imageMediaIds } : {}),
      };
      return productId
        ? api.patch(`/admin/products/${productId}`, payload)
        : api.post('/admin/products', payload);
    },
    ['/admin/products'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  const isLoading = isEditing && productQuery.isLoading;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Edit product' : 'New product'}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate(undefined as never);
            }}
            isLoading={mutation.isPending}
            disabled={isLoading || form.name.trim().length < 2}
          >
            Save product
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
          <span className="sr-only">Loading product</span>
        </div>
      ) : (
        <div className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              required
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Input
              label="URL slug"
              hint="Generated from the name when blank."
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </div>

          <Textarea
            label="Summary"
            rows={2}
            value={form.summary}
            onChange={(event) => setForm({ ...form, summary: event.target.value })}
          />

          <div className="grid gap-4 sm:grid-cols-4">
            <Select
              label="Type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              options={[
                { value: 'PHYSICAL', label: 'Physical' },
                { value: 'DIGITAL', label: 'Digital' },
                { value: 'BUNDLE', label: 'Bundle' },
              ]}
            />
            <Input
              label="Price"
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
            <Input
              label="Currency"
              maxLength={3}
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}
            />
            <Input
              label="Stock"
              type="number"
              min={0}
              hint="Blank means unlimited."
              value={form.stock}
              onChange={(event) => setForm({ ...form, stock: event.target.value })}
            />
          </div>

          <MediaPickerField
            label="Product image"
            kind="IMAGE"
            currentUrl={productQuery.data?.images[0]?.url ?? null}
            onSelect={(media) =>
              setForm({ ...form, imageMediaIds: media ? [media.id] : [] })
            }
          />

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Description</p>
            <RichTextEditor
              value={form.description}
              onChange={(document) => setForm({ ...form, description: document })}
              minBlocks={0}
            />
          </div>

          <Checkbox
            label="Active — listed in the shop"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
          />
        </div>
      )}
    </Modal>
  );
}
