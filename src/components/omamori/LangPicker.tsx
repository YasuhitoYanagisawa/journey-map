import { Languages } from "lucide-react";
import { TARGET_LANGS, useTargetLang } from "@/lib/useTranslate";

export default function LangPicker({ className = "" }: { className?: string }) {
  const [lang, setLang] = useTargetLang();
  return (
    <label className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <Languages className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as any)}
        className="bg-secondary text-foreground rounded-md px-2 py-1 border border-border text-xs"
        aria-label="Translation language"
      >
        {TARGET_LANGS.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
    </label>
  );
}
