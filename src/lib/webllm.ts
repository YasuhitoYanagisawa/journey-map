// In-browser Gemma via WebLLM (WebGPU). Works on https.
// Model: Gemma-2-2b-it (q4f16_1) — ~1.5GB initial download, then cached in OPFS.
import type { ChatCompletionMessageParam, MLCEngine, InitProgressReport } from "@mlc-ai/web-llm";

const MODEL_ID = "gemma-2-2b-it-q4f16_1-MLC";

let enginePromise: Promise<MLCEngine> | null = null;
let lastProgress: InitProgressReport | null = null;
const progressListeners = new Set<(p: InitProgressReport | null) => void>();

export function subscribeProgress(cb: (p: InitProgressReport | null) => void) {
  progressListeners.add(cb);
  cb(lastProgress);
  return () => progressListeners.delete(cb);
}

function emitProgress(p: InitProgressReport | null) {
  lastProgress = p;
  progressListeners.forEach((l) => l(p));
}

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

let webllmStatus: "idle" | "loading" | "ready" | "error" = "idle";
const statusListeners = new Set<(s: typeof webllmStatus) => void>();
export function subscribeWebLLMStatus(cb: (s: typeof webllmStatus) => void) {
  statusListeners.add(cb);
  cb(webllmStatus);
  return () => statusListeners.delete(cb);
}
function setStatus(s: typeof webllmStatus) {
  webllmStatus = s;
  statusListeners.forEach((l) => l(s));
}
export function getWebLLMStatus() {
  return webllmStatus;
}

export async function getEngine(): Promise<MLCEngine> {
  if (!isWebGPUAvailable()) {
    throw new Error("WebGPU is not available in this browser. Use Chrome/Edge.");
  }
  if (!enginePromise) {
    setStatus("loading");
    enginePromise = (async () => {
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      try {
        const engine = await CreateMLCEngine(MODEL_ID, {
          initProgressCallback: (p) => emitProgress(p),
        });
        setStatus("ready");
        return engine;
      } catch (e) {
        setStatus("error");
        enginePromise = null;
        throw e;
      }
    })();
  }
  return enginePromise;
}

export type WebLLMMessage = { role: "system" | "user" | "assistant"; content: string };

export async function webllmChat(
  messages: WebLLMMessage[],
  opts: { temperature?: number } = {},
): Promise<string> {
  const engine = await getEngine();
  const res = await engine.chat.completions.create({
    messages: messages as ChatCompletionMessageParam[],
    temperature: opts.temperature ?? 0.4,
    stream: false,
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function preloadGemma() {
  try {
    await getEngine();
  } catch (e) {
    console.warn("[webllm] preload failed", e);
  }
}
