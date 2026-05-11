import { Volume2 } from "lucide-react";
import { TTS_LANGS, useTTSLang } from "@/lib/tts";

export default function TTSLangPicker({ className = "" }: { className?: string }) {
  const [lang, setLang] = useTTSLang();
  return (
    <label className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as any)}
        className="bg-secondary text-foreground rounded-md px-2 py-1 border border-border text-xs"
        aria-label="Speech language"
      >
        {TTS_LANGS.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}
