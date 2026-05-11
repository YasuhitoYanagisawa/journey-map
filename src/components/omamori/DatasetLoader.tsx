import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RotateCw, AlertCircle } from "lucide-react";
import { loadDataset, type DatasetName, type LoadProgress } from "@/lib/omamoriDB";

export default function DatasetLoader({
  name,
  label,
  children,
}: {
  name: DatasetName;
  label: string;
  children: (data: any[]) => React.ReactNode;
}) {
  const [data, setData] = useState<any[] | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setProgress(null);
    loadDataset(name, (p) => !cancelled && setProgress(p))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e?.message || e)));
    return () => {
      cancelled = true;
    };
  }, [name, attempt]);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-md text-center">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <div className="text-sm font-semibold mb-1">Couldn't download {label}</div>
        <div className="text-xs text-muted-foreground mb-4 break-words">{error}</div>
        <Button onClick={() => setAttempt((a) => a + 1)} size="sm" variant="outline">
          <RotateCw className="h-4 w-4 mr-1.5" /> Retry
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Check your connection — this is a one-time download.
        </p>
      </div>
    );
  }

  if (!data) {
    const pct = progress?.total
      ? Math.min(99, Math.round((progress.loaded / progress.total) * 100))
      : null;
    return (
      <div className="container mx-auto px-4 py-10 max-w-md">
        <div className="text-center mb-3 text-sm text-muted-foreground">
          Downloading {label}…{" "}
          {progress?.phase === "decompressing"
            ? "decompressing"
            : progress?.phase === "parsing"
              ? "parsing"
              : pct !== null
                ? `${pct}%`
                : "starting"}
        </div>
        <Progress value={pct ?? 5} className="h-2" />
        <p className="mt-3 text-xs text-center text-muted-foreground">
          One-time download · cached on your device for offline use.
        </p>
      </div>
    );
  }

  return <>{children(data)}</>;
}
