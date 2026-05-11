import { useEffect, useState } from "react";
import { getSignedPhotoUrl, getSignedPhotoUrls } from "@/lib/photoUrl";

/** Sign a single storage path and return a usable URL (refreshes on path change). */
export function useSignedPhotoUrl(storagePath: string | null | undefined): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancel = false;
    if (!storagePath) {
      setUrl("");
      return;
    }
    getSignedPhotoUrl(storagePath).then((u) => {
      if (!cancel) setUrl(u);
    });
    return () => {
      cancel = true;
    };
  }, [storagePath]);
  return url;
}

/** Sign many paths in batch and return a path→url map (stable for unchanged sets). */
export function useSignedPhotoUrls(storagePaths: string[]): Record<string, string> {
  const key = storagePaths.join("|");
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancel = false;
    getSignedPhotoUrls(storagePaths).then((m) => {
      if (!cancel) setMap(m);
    });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
