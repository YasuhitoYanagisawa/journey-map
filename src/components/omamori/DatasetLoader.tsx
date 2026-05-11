import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
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

  useEffect(() => {
    let cancelled = false;
    loadDataset(name, (p) => !cancelled && setProgress(p))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e?.message || e)));
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-destructive">
        Failed to load {label}: {error}
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
