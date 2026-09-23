const BLOCKED_KEY = /password|token|secret|authorization|cookie|document/i;

export function redactSensitive(value, depth = 0) {
  if (value === undefined || value === null) return value;
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactSensitive(item, depth + 1));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    BLOCKED_KEY.test(key) ? '[redacted]' : redactSensitive(item, depth + 1)
  ]));
}

export function assertSafePublicPayload(value, path = '$', depth = 0) {
  if (depth > 10 || value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafePublicPayload(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (BLOCKED_KEY.test(key)) throw new Error(`Campo sensivel em payload publico: ${path}.${key}`);
    assertSafePublicPayload(item, `${path}.${key}`, depth + 1);
  }
}
