import { Timestamp } from 'firebase-admin/firestore';

const SENSITIVE_FIELD = /(password|secret|token|credential|api.?key)/i;

export function toExportValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toExportValue);
  if (value && typeof value === 'object') {
    if ('path' in value && typeof (value as { path?: unknown }).path === 'string') {
      return { documentPath: (value as { path: string }).path };
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELD.test(key))
        .map(([key, entry]) => [key, toExportValue(entry)]),
    );
  }
  return value;
}
