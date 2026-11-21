/** Pagination par curseur opaque (jamais d'OFFSET). */
export function encodeCursor(parts: (string | number)[]): string {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

export function decodeCursor<T extends unknown[]>(cursor?: string | null): T | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Array.isArray(value) ? (value as T) : null;
  } catch {
    return null;
  }
}
