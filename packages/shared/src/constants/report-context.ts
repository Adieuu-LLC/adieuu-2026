/**
 * How many messages before and after the reported message to include in evidence.
 * Must stay in sync with API validation and report submission service.
 */
export const REPORT_CONTEXT_MESSAGE_COUNTS = [3, 5, 10, 25] as const;
export type ReportContextMessageCount = (typeof REPORT_CONTEXT_MESSAGE_COUNTS)[number];

export function isReportContextMessageCount(n: number): n is ReportContextMessageCount {
  return (REPORT_CONTEXT_MESSAGE_COUNTS as readonly number[]).includes(n);
}
