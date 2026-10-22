"use client";

import type { ReactNode } from "react";

import { cn } from "~/lib/cn";
import { ReorderButtons } from "~/ui/drop-target";

interface ManageableListProps<T extends { id: string }> {
  items: T[];
  onRemove: (id: string) => void;
  isPending: boolean;
  error: string | null;
  renderItem: (item: T, onRemove: () => void) => ReactNode;
  addForm: ReactNode;
  actions?: ReactNode;
  emptyLabel?: string;
  /**
   * Makes the list sortable: each row gets move-up and move-down buttons (the
   * keyboard way to reorder; callers that also drag wire the same handler).
   * `direction` is -1 for up, 1 for down.
   */
  onMove?: (id: string, direction: -1 | 1) => void;
}

export default function ManageableList<T extends { id: string }>({
  items,
  onRemove,
  isPending,
  error,
  renderItem,
  addForm,
  actions,
  emptyLabel = "None yet.",
  onMove,
}: ManageableListProps<T>) {
  return (
    // `aria-busy` is what `isPending` drives. The prop is part of this
    // component's published surface (it appears in ds-bundle's .d.ts and every
    // preview passes it) but nothing here read it, so a consumer could pass it
    // and get no behaviour at all. Semantics only, deliberately: `renderItem`
    // is caller-supplied, so any visual treatment of a pending row belongs to
    // whoever renders it.
    <div className="flex flex-col gap-3" aria-busy={isPending}>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">{emptyLabel}</p>
      ) : (
        <div className={cn("flex gap-2", onMove ? "flex-col" : "flex-wrap")}>
          {items.map((item, i) =>
            onMove ? (
              <div key={item.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {renderItem(item, () => onRemove(item.id))}
                </div>
                <ReorderButtons
                  canMoveUp={i > 0}
                  canMoveDown={i < items.length - 1}
                  onMoveUp={() => onMove(item.id, -1)}
                  onMoveDown={() => onMove(item.id, 1)}
                />
              </div>
            ) : (
              renderItem(item, () => onRemove(item.id))
            ),
          )}
        </div>
      )}

      {addForm}

      {error && (
        <p role="alert" className="text-xs text-[var(--bad)]">
          {error}
        </p>
      )}

      {actions}
    </div>
  );
}
