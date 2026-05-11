import { useEffect, useState } from "react";
import { Loader2, Download, Cpu, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  getEngine,
  getWebLLMStatus,
  isWebGPUAvailable,
  subscribeProgress,
  subscribeWebLLMStatus,
} from "@/lib/webllm";
import { Button } from "@/components/ui/button";

export default function GemmaLoader({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState(getWebLLMStatus());
  const [progress, setProgress] = useState<{ progress: number; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeWebLLMStatus(setStatus);
    const u2 = subscribeProgress((p) =>
      p ? setProgress({ progress: p.progress, text: p.text }) : setProgress(null),
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  if (!isWebGPUAvailable()) {
    return (
      <div
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title="WebGPU not supported. Use Chrome / Edge."
      >
        <AlertTriangle className="h-3 w-3" />
        {compact ? "no WebGPU" : "WebGPU unavailable (use Chrome/Edge)"}
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        Gemma ready
      </div>
    );
  }

  if (status === "loading") {
    const pct = Math.round((progress?.progress ?? 0) * 100);
    return (
      <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title={progress?.text}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading Gemma {pct ? `${pct}%` : "…"}
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-[11px] gap-1"
      onClick={() => {
        setErr(null);
        getEngine().catch((e) => setErr(String(e?.message || e)));
      }}
      title="Download & run Gemma-2 2B in your browser (~1.5GB, cached)"
    >
      <Download className="h-3 w-3" />
      <Cpu className="h-3 w-3" />
      {compact ? "Load Gemma" : "Load Gemma (browser)"}
      {err && <span className="text-destructive ml-1">!</span>}
    </Button>
  );
}
