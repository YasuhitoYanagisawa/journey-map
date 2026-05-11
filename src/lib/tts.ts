// Lightweight TTS utilities with persisted voice-language preference.
import { useSyncExternalStore } from "react";

export type TTSLang =
  | "auto"
  | "ja-JP"
  | "en-US"
  | "zh-CN"
  | "ko-KR"
  | "es-ES"
  | "fr-FR"
  | "de-DE"
  | "pt-BR"
  | "vi-VN"
  | "th-TH"
  | "id-ID";

export const TTS_LANGS: { value: TTSLang; label: string }[] = [
  { value: "auto", label: "Auto (JP/EN)" },
  { value: "ja-JP", label: "日本語" },
  { value: "en-US", label: "English" },
  { value: "zh-CN", label: "中文" },
  { value: "ko-KR", label: "한국어" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "pt-BR", label: "Português" },
  { value: "vi-VN", label: "Tiếng Việt" },
  { value: "th-TH", label: "ภาษาไทย" },
  { value: "id-ID", label: "Bahasa Indonesia" },
];

const LS_KEY = "omamori_tts_lang";
const subs = new Set<() => void>();
let version = 0;
function notify() {
  version++;
  subs.forEach((fn) => fn());
}

export function getTTSLang(): TTSLang {
  if (typeof window === "undefined") return "auto";
  return (localStorage.getItem(LS_KEY) as TTSLang) || "auto";
}
export function setTTSLang(l: TTSLang) {
  try {
    localStorage.setItem(LS_KEY, l);
  } catch {}
  notify();
}
export function useTTSLang(): [TTSLang, (l: TTSLang) => void] {
  useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    () => version,
    () => version,
  );
  return [getTTSLang(), setTTSLang];
}

function clean(text: string) {
  return text.replace(/[*_`#>~|]/g, "");
}

export function speak(text: string, lang?: TTSLang) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const target = lang ?? getTTSLang();
  const cleaned = clean(text);
  if (target !== "auto") {
    const u = new SpeechSynthesisUtterance(cleaned);
    u.lang = target;
    u.rate = 0.95;
    speechSynthesis.speak(u);
    return;
  }
  // Auto: split sentence-ish, detect JP vs Latin
  const parts = cleaned
    .split(/(?<=[。．!?！？\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    const isJP = /[぀-ヿ㐀-鿿]/.test(p);
    const u = new SpeechSynthesisUtterance(p);
    u.lang = isJP ? "ja-JP" : "en-US";
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
}
