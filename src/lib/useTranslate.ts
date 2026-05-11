// Memoized JP→{lang} translator for short text snippets (names, descriptions, addresses).
// Cache key: `${lang}::${text}` so multiple target languages can coexist.
import { useState, useSyncExternalStore } from "react";
import { runAI } from "./aiRouter";

export type TargetLang =
  | "原文 (JP)"
  | "English"
  | "中文 (简体)"
  | "한국어"
  | "Español"
  | "Français"
  | "Deutsch"
  | "Português"
  | "Tiếng Việt"
  | "ภาษาไทย"
  | "Bahasa Indonesia";

export const TARGET_LANGS: TargetLang[] = [
  "原文 (JP)",
  "English",
  "中文 (简体)",
  "한국어",
  "Español",
  "Français",
  "Deutsch",
  "Português",
  "Tiếng Việt",
  "ภาษาไทย",
  "Bahasa Indonesia",
];

// BCP-47 voice code per target language for SpeechSynthesis
export const LANG_TO_BCP47: Record<TargetLang, string> = {
  "原文 (JP)": "ja-JP",
  English: "en-US",
  "中文 (简体)": "zh-CN",
  "한국어": "ko-KR",
  Español: "es-ES",
  Français: "fr-FR",
  Deutsch: "de-DE",
  Português: "pt-BR",
  "Tiếng Việt": "vi-VN",
  "ภาษาไทย": "th-TH",
  "Bahasa Indonesia": "id-ID",
};

const LS_KEY = "omamori_tr_cache_v2";
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

const key = (lang: TargetLang, text: string) => `${lang}::${text}`;

export function getCached(text: string, lang: TargetLang = "English"): string | undefined {
  const k = key(lang, text);
  return memCache.get(k) ?? disk[k];
}

// Persisted user-selected language across pages
const LANG_LS = "omamori_target_lang";
export function getTargetLang(): TargetLang {
  if (typeof window === "undefined") return "English";
  const v = localStorage.getItem(LANG_LS);
  return (v as TargetLang) || "English";
}
export function setTargetLang(l: TargetLang) {
  try {
    localStorage.setItem(LANG_LS, l);
  } catch {}
  notify();
}
export function useTargetLang(): [TargetLang, (l: TargetLang) => void] {
  useTranslationVersion();
  return [getTargetLang(), setTargetLang];
}

export function useTranslator(lang: TargetLang = "English") {
  const [loading, setLoading] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const translate = async (texts: string[]) => {
    const unique = Array.from(new Set(texts.filter(Boolean)));
    const out: Record<string, string> = {};
    const todo: string[] = [];
    for (const t of unique) {
      const c = getCached(t, lang);
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
      const SEP = "\n---\n";
      const joined = todo.join(SEP);
      const r = await runAI({
        task: "translate",
        userText: `Translate each Japanese block below into ${lang}. Blocks are separated by "${SEP.trim()}". Return ONLY the ${lang} translations in the SAME order, separated by the same delimiter. No prose, no quotes.\n\n${joined}`,
      });
      const parts = (r.text || "").split(SEP).map((s) => s.trim());
      todo.forEach((src, i) => {
        const dst = parts[i] || "";
        if (dst) {
          out[src] = dst;
          const k = key(lang, src);
          memCache.set(k, dst);
          disk[k] = dst;
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
