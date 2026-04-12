/**
 * i18next `returnObjects: true` returns the raw value; if the key is missing or wrong,
 * the fallback is often a string — never call `.map` on it without checking.
 */
export function stringArrayFromI18nReturn(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}
