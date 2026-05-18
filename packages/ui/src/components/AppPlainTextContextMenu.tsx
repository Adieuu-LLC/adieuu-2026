import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import { useToast } from './Toast';
import { copyPlainTextToClipboard, readPlainTextFromClipboard } from '../utils/contextMenuClipboard';

const MENU_Z_INDEX = 602;
const SCRIM_Z_INDEX = 601;

function resolvePasteTargetFromContextEvent(e: MouseEvent): HTMLInputElement | HTMLTextAreaElement | null {
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
    return t;
  }
  if (t instanceof HTMLElement) {
    const inner = t.closest('input, textarea');
    if (inner instanceof HTMLInputElement || inner instanceof HTMLTextAreaElement) {
      return inner;
    }
  }
  const ae = document.activeElement;
  if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) {
    return ae;
  }
  return null;
}

/**
 * On generic app surfaces (not messages, composer, or conversation list), replaces the
 * browser context menu with Copy / Paste (selection-based copy, paste into focused field).
 */
export function AppPlainTextContextMenu() {
  const { t } = useTranslation();
  const { error: toastError, info: toastInfo } = useToast();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState('');
  /** Field that had context on open; activeElement after clicking Paste is the menu button. */
  const pasteTargetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const close = useCallback(() => {
    pasteTargetRef.current = null;
    setOpen(false);
  }, []);

  const shouldIgnoreTarget = (target: EventTarget | null) => {
    if (!target || !(target instanceof Element)) {
      return true;
    }
    if (
      target.closest('.dm-message') ||
      target.closest('.conversation-composer') ||
      target.closest('.conversation-list-item') ||
      target.closest('.conversation-context-menu') ||
      target.closest('.dm-context-menu') ||
      target.closest('.emoji-picker-popover') ||
      target.closest('.gif-picker-popover') ||
      target.closest('[data-skip-app-plain-context]')
    ) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (shouldIgnoreTarget(e.target)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      pasteTargetRef.current = resolvePasteTargetFromContextEvent(e);
      setPos({ x: e.clientX, y: e.clientY });
      setSelection(typeof window !== 'undefined' ? window.getSelection()?.toString() ?? '' : '');
      setOpen(true);
    };
    document.addEventListener('contextmenu', onContextMenu, true);
    return () => document.removeEventListener('contextmenu', onContextMenu, true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const menu = document.getElementById('app-plain-text-context-menu');
      if (menu && !menu.contains(t)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [open, close]);

  const onCopy = useCallback(async () => {
    if (!selection.trim()) {
      close();
      return;
    }
    const ok = await copyPlainTextToClipboard(selection);
    if (!ok) {
      toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
    }
    close();
  }, [close, selection, t, toastError]);

  const onPaste = useCallback(async () => {
    const preferred = pasteTargetRef.current;
    const el =
      preferred && preferred.isConnected && !preferred.readOnly && !preferred.disabled
        ? preferred
        : document.activeElement;
    const text = await readPlainTextFromClipboard();
    if (text == null) {
      toastError(t('conversations.contextMenu.pasteFailed', 'Could not paste from clipboard'));
      close();
      return;
    }
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      if (el.readOnly || el.disabled) {
        toastInfo(t('conversations.contextMenu.pasteNoEditable', '…'));
        close();
        return;
      }
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const v = el.value;
      const next = v.slice(0, start) + text + v.slice(end);
      el.value = next;
      const caret = start + text.length;
      el.setSelectionRange(caret, caret);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      close();
      return;
    }
    if (el && (el as HTMLElement).isContentEditable) {
      document.execCommand?.('insertText', false, text);
      close();
      return;
    }
    toastInfo(t('conversations.contextMenu.pasteNoEditable', '…'));
    close();
  }, [close, t, toastError, toastInfo]);

  if (typeof document === 'undefined' || !open) {
    return null;
  }

  const canCopy = selection.trim().length > 0;

  return createPortal(
    <>
      <div
        className="app-plain-text-context-scrim"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: SCRIM_Z_INDEX,
        }}
        aria-hidden
        onClick={close}
      />
      <div
        id="app-plain-text-context-menu"
        className="dm-context-menu"
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: MENU_Z_INDEX,
          minWidth: 180,
        }}
        role="menu"
      >
        <button
          type="button"
          className="dm-context-menu-item"
          style={{ width: '100%' }}
          role="menuitem"
          disabled={!canCopy}
          onClick={() => void onCopy()}
        >
          <Icon name="copy" className="dm-context-menu-item-icon" />
          {t('conversations.contextMenu.copy', 'Copy')}
        </button>
        <button
          type="button"
          className="dm-context-menu-item"
          style={{ width: '100%' }}
          role="menuitem"
          onClick={() => void onPaste()}
        >
          <Icon name="fileImport" className="dm-context-menu-item-icon" />
          {t('conversations.contextMenu.paste', 'Paste')}
        </button>
      </div>
    </>,
    document.body,
  );
}
