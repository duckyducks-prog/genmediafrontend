import type { RefObject } from "react";

/**
 * Focus the first invalid field within a container.
 * Looks for elements with aria-invalid="true" or .border-destructive.
 */
export function focusFirstInvalidField(
  containerRef?: RefObject<HTMLElement | null>,
): void {
  const container = containerRef?.current || document;
  const firstInvalid = container.querySelector(
    '[aria-invalid="true"], .border-destructive',
  ) as HTMLElement | null;
  firstInvalid?.focus();
}
