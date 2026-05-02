export interface AxisAlignedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Axis-aligned rectangle overlap (edges touching do not count). */
export function rectanglesIntersect(a: AxisAlignedRect, b: AxisAlignedRect): boolean {
  return (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
}
