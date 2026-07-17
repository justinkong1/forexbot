/**
 * Safely parse a Response body as JSON.
 * Avoids "Unexpected end of JSON input" on empty / HTML / non-JSON bodies
 * (e.g. Next.js error pages, proxies, or crashed route handlers).
 */
export async function readJson<T = unknown>(
  res: Response,
): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text) {
    return {
      error: res.ok
        ? "Empty response from server"
        : `Request failed (${res.status})`,
    } as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 120);
    return {
      error: res.ok
        ? `Invalid JSON from server: ${snippet}`
        : `Request failed (${res.status}): ${snippet}`,
    } as T & { error?: string };
  }
}
