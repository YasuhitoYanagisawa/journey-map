// Hybrid AI router: Gemma 4 (Ollama) primary → Gemini (Lovable AI) fallback → static
import { supabase } from "@/integrations/supabase/client";
import { isOllamaAvailable, ollamaChat, type OllamaMessage } from "./ollama";

export type AIEngine = "gemma4" | "gemini" | "static";

export type AITask = "chat" | "recommend" | "medical-card";

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

async function callGemini(req: RouterRequest): Promise<string> {
  const { data, error } = await supabase.functions.invoke("omamori-ai", {
    body: {
      task: req.task,
      systemPrompt: req.systemPrompt,
      messages: req.messages,
      userText: req.userText,
      payload: req.payload,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.text ?? "") as string;
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
