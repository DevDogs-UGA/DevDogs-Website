import * as React from "react";

import { cn } from "~/lib/cn";

/**
 * A minimal `asChild` slot: renders its single child element with the slot's
 * props merged in (className joined, style merged, handlers chained, the child's
 * own props winning otherwise).
 *
 * It exists because importing the `radix-ui` umbrella package from a module the
 * server graph reaches makes the vinext RSC build spin forever (reproduced on
 * origin/main 51ffe355, 2026-10-22). Primitives that server components render
 * (Button, TextLink, LinkButton) use this instead of `Slot` from `radix-ui`.
 */
type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
};

function composeRefs<T>(...refs: React.Ref<T>[]): React.RefCallback<T> {
  return (node) => {
    const cleanups: (() => void)[] = [];
    for (const ref of refs) {
      if (typeof ref === "function") {
        const out = ref(node) as unknown;
        if (typeof out === "function") cleanups.push(out as () => void);
        else cleanups.push(() => ref(null));
      } else if (ref) {
        ref.current = node;
        cleanups.push(() => {
          ref.current = null;
        });
      }
    }
    return () => cleanups.forEach((c) => c());
  };
}

function Slot({ children, ...slotProps }: SlotProps) {
  if (!React.isValidElement<Record<string, unknown>>(children)) return null;
  const childProps = children.props;
  const merged: Record<string, unknown> = { ...slotProps, ...childProps };
  for (const key of Object.keys(slotProps)) {
    const slotValue = (slotProps as Record<string, unknown>)[key];
    const childValue = childProps[key];
    if (
      /^on[A-Z]/.test(key) &&
      typeof slotValue === "function" &&
      typeof childValue === "function"
    ) {
      merged[key] = (...args: unknown[]) => {
        (childValue as (...a: unknown[]) => void)(...args);
        (slotValue as (...a: unknown[]) => void)(...args);
      };
    }
  }
  merged.className = cn(
    slotProps.className,
    childProps.className as string | undefined,
  );
  if (slotProps.style || childProps.style) {
    merged.style = {
      ...slotProps.style,
      ...(childProps.style as React.CSSProperties | undefined),
    };
  }
  const childRef = childProps.ref as React.Ref<HTMLElement> | undefined;
  if (slotProps.ref && childRef) {
    merged.ref = composeRefs(slotProps.ref, childRef);
  } else {
    merged.ref = childRef ?? slotProps.ref;
  }
  return React.cloneElement(children, merged);
}

export { Slot };
export type { SlotProps };
