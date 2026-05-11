// Signed-URL helper for the (now private) `photos` storage bucket.
// Caches URLs in-memory and refreshes shortly before they expire.
import { supabase } from "@/integrations/supabase/client";

const TTL_SECONDS = 3600; // 1 hour
const REFRESH_MARGIN_MS = 60_000; // refresh 1 min before expiry

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

export async function getSignedPhotoUrl(storagePath: string): Promise<string> {
  if (!storagePath) return "";
  const now = Date.now();
  const cached = cache.get(storagePath);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now) return cached.url;

  const existing = inflight.get(storagePath);
  if (existing) return existing;

  const p = (async () => {
    const { data, error } = await supabase.storage
      .from("photos")
      .createSignedUrl(storagePath, TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.warn("[photoUrl] sign failed", storagePath, error);
      return "";
    }
    cache.set(storagePath, {
      url: data.signedUrl,
      expiresAt: now + TTL_SECONDS * 1000,
    });
    return data.signedUrl;
  })();

  inflight.set(storagePath, p);
  try {
    return await p;
  } finally {
    inflight.delete(storagePath);
  }
}

export async function getSignedPhotoUrls(storagePaths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(storagePaths.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (p) => [p, await getSignedPhotoUrl(p)] as const),
  );
  return Object.fromEntries(entries);
}
