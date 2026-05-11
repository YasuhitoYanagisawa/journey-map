import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  Phone,
  Hospital,
  MapPin,
  Pill,
  Waves,
  Loader2,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import BottomNav from "@/components/omamori/BottomNav";
import EngineBadge from "@/components/omamori/EngineBadge";
import { findNearby, formatDistance } from "@/lib/omamoriSearch";
import { getDataset, loadDataset, type Shelter, type Hospital as Hosp } from "@/lib/omamoriDB";
import { runAI } from "@/lib/aiRouter";
import { useTranslator, getCached } from "@/lib/useTranslate";
import { Languages } from "lucide-react";

type Coords = { lat: number; lng: number };

export default function EmergencyPage() {
  const [openShelter, setOpenShelter] = useState(false);
  const [openHospital, setOpenHospital] = useState(false);
  const [openGuide, setOpenGuide] = useState(false);
  const [openMedical, setOpenMedical] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-4">
      <Header />

      <div className="container mx-auto px-4 py-4 space-y-4">
        {/* Pulsing red banner */}
        <div className="rounded-lg border border-omamori-red/50 bg-omamori-red/10 p-3 text-center animate-omamori-pulse">
          <div className="flex items-center justify-center gap-2 text-omamori-red font-semibold">
            <AlertTriangle className="h-4 w-4" />
            <span>Emergency Mode — works offline</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Disaster data cached on your device. No internet required.
          </p>
        </div>

        {/* Quick action grid */}
        <div className="grid grid-cols-2 gap-3">
          <ActionTile icon={<MapPin />} title="Find Shelter" sub="避難所" onClick={() => setOpenShelter(true)} accent="from-emerald-500/20 border-emerald-500/40" />
          <ActionTile icon={<Hospital />} title="Find Hospital" sub="病院" onClick={() => setOpenHospital(true)} accent="from-sky-500/20 border-sky-500/40" />
          <ActionTile icon={<Waves />} title="Earthquake Guide" sub="地震対応" onClick={() => setOpenGuide(true)} accent="from-amber-500/20 border-amber-500/40" />
          <ActionTile icon={<Pill />} title="Medical Card" sub="医療カード" onClick={() => setOpenMedical(true)} accent="from-pink-500/20 border-pink-500/40" />
        </div>

        {/* Important phone numbers */}
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Important numbers · 重要電話番号</div>
          <ul className="text-sm space-y-1.5">
            <PhoneRow label="Police" jp="警察" num="110" />
            <PhoneRow label="Fire / Ambulance" jp="消防 / 救急" num="119" />
            <PhoneRow label="Japan Visitor Hotline (24h, EN)" jp="観光案内" num="050-3816-2787" />
            <PhoneRow label="Disaster message dial" jp="災害用伝言" num="171" />
          </ul>
        </Card>
      </div>

      <ShelterDialog open={openShelter} onOpenChange={setOpenShelter} />
      <HospitalDialog open={openHospital} onOpenChange={setOpenHospital} />
      <EarthquakeGuideDialog open={openGuide} onOpenChange={setOpenGuide} />
      <MedicalCardDialog open={openMedical} onOpenChange={setOpenMedical} />

      <BottomNav />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="container mx-auto px-4 py-3 flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-omamori-red" />
          Emergency <span className="font-jp text-muted-foreground text-sm">緊急</span>
        </h1>
        <div className="ml-auto"><EngineBadge /></div>
      </div>
    </header>
  );
}

function ActionTile({
  icon,
  title,
  sub,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick?: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border bg-gradient-to-br to-transparent ${accent} p-4 transition-transform hover:scale-[1.02]`}
    >
      <div className="h-7 w-7 [&_svg]:h-7 [&_svg]:w-7 mb-2">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs font-jp text-muted-foreground">{sub}</div>
    </button>
  );
}

function PhoneRow({ label, jp, num }: { label: string; jp: string; num: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div>
        <div className="text-foreground">{label}</div>
        <div className="text-[11px] font-jp text-muted-foreground">{jp}</div>
      </div>
      <a href={`tel:${num}`} className="font-mono text-omamori-red text-base font-semibold hover:underline">
        {num}
      </a>
    </li>
  );
}

function useGeo() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => setError(e.message),
      { timeout: 8000, enableHighAccuracy: true },
    );
  }, []);
  return { coords, error };
}

function useDataset<T>(name: "shelters" | "hospitals", enabled: boolean) {
  const [data, setData] = useState<T[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoadErr(null);
    (async () => {
      try {
        const cached = await getDataset<T>(name);
        if (cached) {
          if (!cancelled) setData(cached);
          return;
        }
        const fresh = await loadDataset<T>(name);
        if (!cancelled) setData(fresh);
      } catch (e: any) {
        if (!cancelled) setLoadErr(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, name, attempt]);

  return { data, loadErr, retry: () => setAttempt((a) => a + 1) };
}

function ShelterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { coords, error } = useGeo();
  const { data, loadErr, retry } = useDataset<Shelter>("shelters", open);
  const [filter, setFilter] = useState<"all" | "eq" | "ts" | "fl" | "vo">("all");

  const list = useMemo(() => {
    if (!data || !coords) return [];
    let items = data;
    if (filter !== "all") {
      items = data.filter((s) => (s as any)[filter] === 1);
    }
    return findNearby(items, coords.lat, coords.lng, 50, 30);
  }, [data, coords, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-500" /> Nearest Shelters
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 flex-wrap">
          {[
            { k: "all", l: "All" },
            { k: "eq", l: "🟢 Earthquake" },
            { k: "ts", l: "🔵 Tsunami" },
            { k: "fl", l: "🟡 Flood" },
            { k: "vo", l: "🔴 Volcano" },
          ].map((c) => (
            <button
              key={c.k}
              onClick={() => setFilter(c.k as any)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                filter === c.k ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {c.l}
            </button>
          ))}
        </div>
        <div className="overflow-auto -mx-2 px-2 space-y-2">
          {error && <div className="text-sm text-destructive">{error}</div>}
          {loadErr && (
            <div className="text-sm py-4 text-center">
              <div className="text-destructive mb-2">Failed to load shelter data.</div>
              <div className="text-xs text-muted-foreground mb-2 break-words">{loadErr}</div>
              <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
            </div>
          )}
          {!coords && !error && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Getting your location…
            </div>
          )}
          {coords && !data && !loadErr && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading shelter data…
            </div>
          )}
          {coords &&
            data &&
            list.map((s, i) => (
              <ShelterCard key={`${s.name}-${i}`} s={s} />
            ))}
          {coords && data && list.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No shelters within 50km.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShelterCard({ s }: { s: Shelter & { _distance: number } }) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-jp font-semibold leading-tight truncate">{s.name}</div>
          <div className="text-[11px] font-jp text-muted-foreground truncate">{s.addr}</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {s.eq === 1 && <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px]">地震</Badge>}
            {s.ts === 1 && <Badge className="bg-sky-500/20 text-sky-300 border-0 text-[10px]">津波</Badge>}
            {s.fl === 1 && <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">洪水</Badge>}
            {s.vo === 1 && <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px]">火山</Badge>}
            {s.cap > 0 && (
              <span className="text-[10px] font-jp text-muted-foreground">収容: {s.cap.toLocaleString()}人</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold text-emerald-400">{formatDistance(s._distance)}</div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline"
          >
            <Navigation className="h-3 w-3" /> Navigate
          </a>
        </div>
      </div>
    </Card>
  );
}

function HospitalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { coords, error } = useGeo();
  const { data, loadErr, retry } = useDataset<Hosp>("hospitals", open);
  const [emOnly, setEmOnly] = useState(false);

  const list = useMemo(() => {
    if (!data || !coords) return [];
    const items = emOnly ? data.filter((h) => h.em === 1) : data;
    return findNearby(items, coords.lat, coords.lng, 50, 30);
  }, [data, coords, emOnly]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hospital className="h-4 w-4 text-sky-500" /> Nearest Hospitals
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1">
          <button
            onClick={() => setEmOnly(false)}
            className={`text-xs px-2.5 py-1 rounded-full border ${!emOnly ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
          >
            All
          </button>
          <button
            onClick={() => setEmOnly(true)}
            className={`text-xs px-2.5 py-1 rounded-full border ${emOnly ? "bg-omamori-red text-omamori-red-foreground" : "bg-secondary"}`}
          >
            🔴 Emergency only
          </button>
        </div>
        <div className="overflow-auto -mx-2 px-2 space-y-2">
          {error && <div className="text-sm text-destructive">{error}</div>}
          {loadErr && (
            <div className="text-sm py-4 text-center">
              <div className="text-destructive mb-2">Failed to load hospital data.</div>
              <div className="text-xs text-muted-foreground mb-2 break-words">{loadErr}</div>
              <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
            </div>
          )}
          {!coords && !error && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Getting location…
            </div>
          )}
          {coords && !data && !loadErr && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading hospital data…
            </div>
          )}
          {coords &&
            data &&
            list.map((h, i) => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`;
              return (
                <Card key={`${h.name}-${i}`} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-jp font-semibold leading-tight truncate">{h.name}</div>
                      <div className="text-[11px] font-jp text-muted-foreground truncate">{h.addr}</div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {h.em === 1 && (
                          <Badge className="bg-omamori-red/30 text-omamori-red border-0 text-[10px]">
                            Emergency OK
                          </Badge>
                        )}
                        {h.beds && (
                          <span className="text-[10px] font-jp text-muted-foreground">病床: {h.beds}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-sky-400">{formatDistance(h._distance)}</div>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        <Navigation className="h-3 w-3" /> Navigate
                      </a>
                    </div>
                  </div>
                </Card>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EarthquakeGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const steps = [
    { en: "DROP, COVER, HOLD ON. Get under a sturdy table.", ja: "姿勢を低く、頭を守り、動かない。机の下へ。" },
    { en: "Stay inside until shaking stops. Don't run outside.", ja: "揺れが収まるまで屋内に留まる。" },
    { en: "After shaking stops, check for injuries.", ja: "揺れが収まったらケガを確認。" },
    { en: "Move to your nearest shelter.", ja: "最寄りの避難所へ移動。" },
    { en: "On the coast, watch for tsunami warnings — go to high ground.", ja: "沿岸部では津波警報を確認。高台へ。" },
    { en: "Contact your embassy if needed.", ja: "必要に応じて大使館に連絡。" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-amber-500" /> Earthquake Guide
          </DialogTitle>
        </DialogHeader>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <div className="h-7 w-7 shrink-0 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                {i + 1}
              </div>
              <div>
                <div className="text-sm font-medium">{s.en}</div>
                <div className="text-xs font-jp text-muted-foreground">{s.ja}</div>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

const PRESET_CARD_HOSPITAL = `私は外国人観光客です。
英語を話せる医師はいますか？
症状を診ていただきたいです。
よろしくお願いします。`;

const PRESET_CARD_119 = `救急です。外国人です。
英語でお願いします。
住所がわかりません。
助けてください。`;

function MedicalCardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const [view, setView] = useState<"hospital" | "119" | "ai">("hospital");
  const [symptoms, setSymptoms] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!symptoms.trim()) return;
    setLoading(true);
    try {
      const r = await runAI({ task: "medical-card", payload: { symptoms } });
      setGenerated(
        r.text ||
          `私は外国人観光客です。\n症状: ${symptoms}\n英語を話せる医師をお願いします。`,
      );
    } catch {
      setGenerated(`私は外国人観光客です。\n症状: ${symptoms}\n英語を話せる医師をお願いします。`);
    } finally {
      setLoading(false);
    }
  };

  const text = view === "hospital" ? PRESET_CARD_HOSPITAL : view === "119" ? PRESET_CARD_119 : generated;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-pink-500" /> Medical Show-Card
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 mb-2">
          {[
            { k: "hospital", l: "Hospital" },
            { k: "119", l: "119 call" },
            { k: "ai", l: "AI custom" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setView(t.k as any)}
              className={`text-xs px-2.5 py-1 rounded-full border ${view === t.k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
            >
              {t.l}
            </button>
          ))}
        </div>

        {view === "ai" && (
          <div className="space-y-2 mb-2">
            <Textarea
              placeholder="Describe your symptoms in English (e.g. severe headache, fever 38.5)"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              rows={3}
            />
            <Button onClick={generate} disabled={loading || !symptoms.trim()} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Japanese card"}
            </Button>
          </div>
        )}

        {text && (
          <div className="rounded-lg bg-white text-black p-6 font-jp text-xl leading-relaxed whitespace-pre-line text-center">
            {text}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground text-center">Show this screen to staff.</p>
      </DialogContent>
    </Dialog>
  );
}
