/**
 * Modal for previewing all colour tokens of a community theme.
 * Groups colours by category (backgrounds, text, accents, etc.)
 * with swatch + label + hex value for each token.
 */

import { useMemo } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from './Button';
import type { ThemeColorTokens } from '@adieuu/shared';

type ColorCategory = 'backgrounds' | 'text' | 'accents' | 'borders' | 'status' | 'branding';

interface ColorField {
  key: keyof ThemeColorTokens;
  label: string;
  category: ColorCategory;
}

const COLOR_FIELDS: ColorField[] = [
  { key: 'bgPrimary', label: 'Primary Background', category: 'backgrounds' },
  { key: 'bgSecondary', label: 'Secondary Background', category: 'backgrounds' },
  { key: 'bgTertiary', label: 'Tertiary Background', category: 'backgrounds' },
  { key: 'bgElevated', label: 'Elevated Background', category: 'backgrounds' },

  { key: 'textPrimary', label: 'Primary Text', category: 'text' },
  { key: 'textSecondary', label: 'Secondary Text', category: 'text' },
  { key: 'textMuted', label: 'Muted Text', category: 'text' },
  { key: 'textInverse', label: 'Inverse Text', category: 'text' },

  { key: 'accentPrimary', label: 'Primary Accent', category: 'accents' },
  { key: 'accentPrimaryHover', label: 'Accent Hover', category: 'accents' },
  { key: 'accentPrimaryActive', label: 'Accent Active', category: 'accents' },
  { key: 'accentSecondary', label: 'Secondary Accent', category: 'accents' },

  { key: 'border', label: 'Border', category: 'borders' },
  { key: 'borderMuted', label: 'Muted Border', category: 'borders' },
  { key: 'borderFocus', label: 'Focus Ring', category: 'borders' },

  { key: 'success', label: 'Success', category: 'status' },
  { key: 'warning', label: 'Warning', category: 'status' },
  { key: 'error', label: 'Error', category: 'status' },
  { key: 'info', label: 'Info', category: 'status' },

  { key: 'logoPrimary', label: 'Logo Primary', category: 'branding' },
  { key: 'logoSecondary', label: 'Logo Secondary', category: 'branding' },
];

const CATEGORIES: ColorCategory[] = ['backgrounds', 'text', 'accents', 'borders', 'status', 'branding'];

const CATEGORY_LABELS: Record<ColorCategory, string> = {
  backgrounds: 'Backgrounds',
  text: 'Text',
  accents: 'Accents',
  borders: 'Borders',
  status: 'Status',
  branding: 'Branding',
};

export interface ThemeColorPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  colors: ThemeColorTokens;
}

export function ThemeColorPreviewModal({
  open,
  onOpenChange,
  title,
  colors,
}: ThemeColorPreviewModalProps) {
  const fieldsByCategory = useMemo(() => {
    const map = new Map<ColorCategory, ColorField[]>();
    for (const cat of CATEGORIES) {
      map.set(cat, COLOR_FIELDS.filter((f) => f.category === cat));
    }
    return map;
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content theme-preview-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">{title}</Dialog.Title>
            </div>

            <div className="confirm-dialog-body theme-preview-body">
              {CATEGORIES.map((cat) => (
                <div key={cat} className="theme-preview-category">
                  <h3 className="theme-preview-category-title">{CATEGORY_LABELS[cat]}</h3>
                  <div className="theme-preview-tokens">
                    {fieldsByCategory.get(cat)?.map((field) => (
                      <div key={String(field.key)} className="theme-preview-token">
                        <span
                          className="theme-preview-swatch"
                          style={{ background: colors[field.key] }}
                        />
                        <span className="theme-preview-token-label">{field.label}</span>
                        <code className="theme-preview-token-value">{colors[field.key]}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="confirm-dialog-footer">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
