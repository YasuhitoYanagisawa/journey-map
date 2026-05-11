// Ollama (Gemma 4) client - direct browser → http://localhost:11434
// NOTE: Browsers block http://localhost from https:// pages (mixed content),
// so this only works on http:// dev or in a packaged app. We short-circuit
// in https contexts to avoid 1.5s wasted on every AI call.

const OLLAMA_URL = "http://localhost:11434";
const MODEL = "gemma4:e2b";

let availabilityCache: { value: boolean; expires: number } | null = null;

function isMixedContentBlocked(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:";
}

export async function isOllamaAvailable(): Promise<boolean> {
  if (isMixedContentBlocked()) return false;
  const now = Date.now();
  if (availabilityCache && availabilityCache.expires > now) {
    return availabilityCache.value;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    const ok = res.ok;
    availabilityCache = { value: ok, expires: now + 30_000 };
    return ok;
  } catch {
    availabilityCache = { value: false, expires: now + 30_000 };
    return false;
  }
}

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

export async function ollamaChat(
  messages: OllamaMessage[],
  opts: { temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        options: { temperature: opts.temperature ?? 0.4 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return (data?.message?.content ?? "") as string;
  } finally {
    clearTimeout(t);
  }
}
