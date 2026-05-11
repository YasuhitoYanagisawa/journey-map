import { useEffect, useState } from "react";
import { engineLabel, subscribeEngine, type AIEngine } from "@/lib/aiRouter";
import { isOllamaAvailable } from "@/lib/ollama";
import { cn } from "@/lib/utils";

export default function EngineBadge({ className }: { className?: string }) {
  const [engine, setEngine] = useState<AIEngine>("static");
  const [ollama, setOllama] = useState(false);

  useEffect(() => {
    const unsub = subscribeEngine(setEngine);
    isOllamaAvailable().then(setOllama);
    const t = setInterval(() => isOllamaAvailable().then(setOllama), 30_000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);

  const m = engineLabel(engine);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-secondary/60 backdrop-blur px-2.5 py-1 text-xs",
        m.color,
        className,
      )}
      title={ollama ? "Ollama detected on localhost:11434" : "Ollama offline — using cloud"}
    >
      <span>{m.icon}</span>
      <span className="font-medium">{m.label}</span>
      {ollama && engine !== "gemma4" && (
        <span className="text-emerald-500" title="Gemma 4 ready">
          • gemma4 ready
        </span>
      )}
    </div>
  );
}
