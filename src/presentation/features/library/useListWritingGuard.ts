import { useRef, type SyntheticEvent } from 'react';

export interface ListWritingGuard { owner: HTMLElement; save: () => boolean }
export function useListWritingGuard() {
  const guard = useRef<ListWritingGuard | null>(null);
  function capture(event: SyntheticEvent) {
    const current = guard.current;
    if (!current || (event.target instanceof Node && current.owner.contains(event.target))) return;
    if (!current.save()) { event.preventDefault(); event.stopPropagation(); }
  }
  return { guard, capture };
}
