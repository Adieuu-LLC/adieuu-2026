import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = __dirname;
const componentsDir = path.resolve(__dirname, '../components');

const MODAL_COMPONENTS = [
  'VpnComplianceModal.tsx',
  'AbusiveIpModal.tsx',
  'GeofenceBlockedModal.tsx',
];

const GEOFENCE_CLASS_PATTERN = /geofence-modal-[a-z-]+/g;

function readScssSources(): string {
  const files = readdirSync(stylesDir).filter((f) => f.endsWith('.scss'));
  return files.map((f) => readFileSync(path.join(stylesDir, f), 'utf8')).join('\n');
}

function extractGeofenceClassesFromTsx(fileName: string): Set<string> {
  const source = readFileSync(path.join(componentsDir, fileName), 'utf8');
  const matches = source.match(GEOFENCE_CLASS_PATTERN) ?? [];
  return new Set(matches);
}

function scssDefinesClass(scss: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?:\\s|[,{:&>+~\\[])`, 'm').test(scss);
}

describe('modal CSS contract', () => {
  test('geofence modal partial is imported via primitives-modals-overlay', () => {
    const overlay = readFileSync(
      path.join(stylesDir, '_primitives-modals-overlay.scss'),
      'utf8',
    );
    expect(overlay).toContain("@use 'primitives-modal-geofence'");
  });

  test('every geofence-modal-* class used in compliance modals has SCSS rules', () => {
    const scss = readScssSources();
    const usedClasses = new Set<string>();

    for (const file of MODAL_COMPONENTS) {
      for (const className of extractGeofenceClassesFromTsx(file)) {
        usedClasses.add(className);
      }
    }

    expect(usedClasses.size).toBeGreaterThan(0);

    const missing = [...usedClasses].filter((className) => !scssDefinesClass(scss, className));
    expect(missing).toEqual([]);
  });

  test('geofence modal backdrop and positioner use fixed positioning', () => {
    const geofenceScss = readFileSync(
      path.join(stylesDir, '_primitives-modal-geofence.scss'),
      'utf8',
    );

    expect(geofenceScss).toMatch(
      /\.geofence-modal-backdrop\s*\{[^}]*position:\s*fixed/,
    );
    expect(geofenceScss).toMatch(
      /\.geofence-modal-positioner\s*\{[^}]*position:\s*fixed/,
    );
    expect(geofenceScss).toMatch(
      /\.geofence-modal-backdrop[\s\S]*?\[data-state='closed'\]/,
    );
  });
});
