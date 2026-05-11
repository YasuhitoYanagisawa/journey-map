// Hybrid AI router:
//   1) Gemma (WebLLM/WebGPU, in-browser, https-friendly)
//   2) Gemma (Ollama on http://localhost — only on http dev)
//   3) Gemini (Lovable AI Gateway)
//   4) static fallback
import { supabase } from "@/integrations/supabase/client";
import { isOllamaAvailable, ollamaChat, type OllamaMessage } from "./ollama";
import { getWebLLMStatus, isWebGPUAvailable, webllmChat } from "./webllm";

export type AIEngine = "gemma-webllm" | "gemma4" | "gemini" | "static";

export type AITask = "chat" | "recommend" | "medical-card" | "translate";

export type RouterRequest = {
  task: AITask;
  systemPrompt?: string;
  messages?: OllamaMessage[];
  userText?: string;
  payload?: unknown;
  forceGemini?: boolean;
};

export type RouterResult = {
  engine: AIEngine;
  text: string;
};

// Quick observable status for UI badges
let lastEngine: AIEngine = "static";
const listeners = new Set<(e: AIEngine) => void>();
export function subscribeEngine(cb: (e: AIEngine) => void) {
  listeners.add(cb);
  cb(lastEngine);
  return () => listeners.delete(cb);
}
function setEngine(e: AIEngine) {
  lastEngine = e;
  listeners.forEach((l) => l(e));
}

const GEMINI_TIMEOUT_MS = 25_000;

async function callGemini(req: RouterRequest): Promise<string> {
  // Use raw fetch so we can apply an AbortController timeout
  // (supabase.functions.invoke doesn't expose AbortSignal).
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/omamori-ai`;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token ?? apikey;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        task: req.task,
        systemPrompt: req.systemPrompt,
        messages: req.messages,
        userText: req.userText,
        payload: req.payload,
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `AI gateway ${res.status}`);
    if (data?.error) throw new Error(data.error);
    return (data?.text ?? "") as string;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("AI request timed out. Please try again.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function callOllama(req: RouterRequest): Promise<string> {
  const messages: OllamaMessage[] = [];
  if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
  if (req.messages) messages.push(...req.messages);
  if (req.userText) messages.push({ role: "user", content: req.userText });
  return ollamaChat(messages);
}

export async function runAI(req: RouterRequest): Promise<RouterResult> {
  // 1) Force Gemini path
  if (req.forceGemini) {
    try {
      const text = await callGemini(req);
      setEngine("gemini");
      return { engine: "gemini", text };
    } catch (e) {
      console.warn("[aiRouter] Gemini forced call failed", e);
      throw e;
    }
  }

  // 2) Try Gemma 4 (Ollama) first - free, local, private
  if (await isOllamaAvailable()) {
    try {
      const text = await callOllama(req);
      setEngine("gemma4");
      return { engine: "gemma4", text };
    } catch (e) {
      console.warn("[aiRouter] Ollama call failed, falling back to Gemini", e);
    }
  }

  // 3) Online → Gemini via Lovable AI Gateway
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const text = await callGemini(req);
      setEngine("gemini");
      return { engine: "gemini", text };
    } catch (e) {
      console.warn("[aiRouter] Gemini failed", e);
    }
  }

  // 4) Static fallback (caller-provided)
  setEngine("static");
  return { engine: "static", text: "" };
}

export function engineLabel(e: AIEngine): { icon: string; label: string; color: string } {
  switch (e) {
    case "gemma4":
      return { icon: "🟢", label: "Gemma 4 (local)", color: "text-emerald-500" };
    case "gemini":
      return { icon: "🔵", label: "Gemini Cloud", color: "text-sky-500" };
    default:
      return { icon: "⚪", label: "Offline / static", color: "text-muted-foreground" };
  }
}
