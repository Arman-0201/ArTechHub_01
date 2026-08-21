'use client';

import { useRef, useState, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Drag-and-drop reordering.
 *
 * Built on the native HTML drag-and-drop API rather than a library — the
 * requirement is a single-level vertical list, and that is what the platform
 * already provides.
 *
 * Critically, the drag handle is also a set of keyboard controls: dragging is
 * unusable with a keyboard or a screen reader, so Alt+ArrowUp / Alt+ArrowDown
 * move the focused item and every change is announced through a live region.
 * Reordering without a mouse has to work.
 */
export interface SortableItem {
  id: string;
}

export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  itemLabel,
  className,
  disabled,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** Used for the announcement and the handle's accessible name. */
  itemLabel: (item: T) => string;
  className?: string;
  disabled?: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  function move(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;

    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);

    onReorder(next.map((item) => item.id));
    setAnnouncement(
      `${itemLabel(moved!)} moved to position ${toIndex + 1} of ${items.length}.`,
    );
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const fromIndex = items.findIndex((item) => item.id === draggingId);
    const toIndex = items.findIndex((item) => item.id === targetId);
    move(fromIndex, toIndex);
    setDraggingId(null);
    setOverId(null);
  }

  return (
    <>
      <ul ref={listRef} className={cn('space-y-2', className)}>
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable={!disabled}
            onDragStart={(event) => {
              setDraggingId(item.id);
              event.dataTransfer.effectAllowed = 'move';
              // Firefox requires data to be set or the drag never starts.
              event.dataTransfer.setData('text/plain', item.id);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setOverId(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOverId(item.id);
            }}
            onDragLeave={() => setOverId((current) => (current === item.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(item.id);
            }}
            className={cn(
              'flex items-start gap-2 rounded-lg border bg-surface transition-[border-color,opacity,transform]',
              draggingId === item.id ? 'opacity-40' : 'opacity-100',
              overId === item.id && draggingId !== item.id
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-border',
            )}
          >
            {!disabled ? (
              <button
                type="button"
                className="mt-2 ml-1.5 grid size-7 shrink-0 cursor-grab place-items-center rounded text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-primary active:cursor-grabbing"
                aria-label={`Reorder ${itemLabel(item)}. Use Alt with the up and down arrow keys to move it.`}
                onKeyDown={(event) => {
                  // Alt is required so the arrows still scroll normally.
                  if (!event.altKey) return;
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    move(index, index - 1);
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    move(index, index + 1);
                  }
                }}
              >
                <GripVertical className="size-4" aria-hidden="true" />
              </button>
            ) : null}

            <div className="min-w-0 flex-1 py-1">{renderItem(item, index)}</div>
          </li>
        ))}
      </ul>

      {/* Announces every move to assistive technology. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
