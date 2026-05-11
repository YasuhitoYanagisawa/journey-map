// Ollama (Gemma 4) client - direct browser → http://localhost:11434

const OLLAMA_URL = "http://localhost:11434";
const MODEL = "gemma4:e2b";

let availabilityCache: { value: boolean; expires: number } | null = null;

export async function isOllamaAvailable(): Promise<boolean> {
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
  opts: { temperature?: number } = {},
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      options: { temperature: opts.temperature ?? 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return (data?.message?.content ?? "") as string;
}
