// Memoized JP→EN translator for short text snippets (names, descriptions, addresses).
// Caches results in localStorage and a process-wide map to avoid re-billing.
import { useState, useSyncExternalStore } from "react";
import { runAI } from "./aiRouter";

const LS_KEY = "omamori_tr_cache_v1";
const memCache = new Map<string, string>();
const subs = new Set<() => void>();
let version = 0;
function notify() {
  version++;
  subs.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
function getVersion() {
  return version;
}
export function useTranslationVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
let disk = typeof window !== "undefined" ? load() : {};

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(disk));
  } catch {}
}

export function getCached(text: string): string | undefined {
  return memCache.get(text) ?? disk[text];
}

export async function translateJP(text: string): Promise<string> {
  const t = text.trim();
  if (!t) return "";
  const c = getCached(t);
  if (c) return c;
  const r = await runAI({ task: "translate", userText: t });
  const out = (r.text || "").trim();
  if (out) {
    memCache.set(t, out);
    disk[t] = out;
    save();
  }
  return out;
}

export function useTranslator() {
  const [loading, setLoading] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const translate = async (texts: string[]) => {
    const unique = Array.from(new Set(texts.filter(Boolean)));
    const out: Record<string, string> = {};
    const todo: string[] = [];
    for (const t of unique) {
      const c = getCached(t);
      if (c) out[t] = c;
      else todo.push(t);
    }
    if (todo.length === 0) {
      setTranslations((p) => ({ ...p, ...out }));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Batch into one call (joined with separators) for cost efficiency
      const SEP = "\n---\n";
      const joined = todo.join(SEP);
      const r = await runAI({
        task: "translate",
        userText: `Translate each block separated by "${SEP.trim()}". Return ONLY the translations in the SAME order, separated by the same delimiter.\n\n${joined}`,
      });
      const parts = (r.text || "").split(SEP).map((s) => s.trim());
      todo.forEach((src, i) => {
        const dst = parts[i] || "";
        if (dst) {
          out[src] = dst;
          memCache.set(src, dst);
          disk[src] = dst;
        }
      });
      save();
      notify();
      setTranslations((p) => ({ ...p, ...out }));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return { translate, translations, loading, error };
}
