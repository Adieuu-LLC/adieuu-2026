import { useEffect, type RefObject } from 'react';

interface UseSidebarPanelDismissOptions {
  isOpen: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  ignoreClosestSelector?: string;
}

export function useSidebarPanelDismiss({
  isOpen,
  onClose,
  panelRef,
  ignoreClosestSelector = '.hover-card-content',
}: UseSidebarPanelDismissOptions): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        const maybeElement = target as Element;
        const ignored = maybeElement.closest?.(ignoreClosestSelector);
        if (ignored) return;
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ignoreClosestSelector, isOpen, onClose, panelRef]);
}
