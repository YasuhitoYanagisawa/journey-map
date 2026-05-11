import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, MapPin, Search, Train, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DatasetLoader from "@/components/omamori/DatasetLoader";
import EngineBadge from "@/components/omamori/EngineBadge";
import BottomNav from "@/components/omamori/BottomNav";
import { findNearby, fullTextFilter, getMonthFromDate, formatDistance } from "@/lib/omamoriSearch";
import { runAI } from "@/lib/aiRouter";
import { useTranslator, getCached } from "@/lib/useTranslate";
import { Languages } from "lucide-react";
import type { Festival } from "@/lib/omamoriDB";

const PREFS = [
  "全国",
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const MONTH_NAMES = ["", "JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export default function FestivalsPage() {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-4">
      <Header />
      <DatasetLoader name="festivals" label="festivals (3.7MB)">
        {(data) => <FestivalsBody data={data as Festival[]} />}
      </DatasetLoader>
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
          <Sparkles className="h-5 w-5 text-omamori-gold" />
          Festivals <span className="font-jp text-muted-foreground text-sm">お祭り</span>
        </h1>
        <div className="ml-auto"><EngineBadge /></div>
      </div>
    </header>
  );
}

function FestivalsBody({ data }: { data: Festival[] }) {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [pref, setPref] = useState("全国");
  const [month, setMonth] = useState<number | 0>(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [recommend, setRecommend] = useState<{ text: string; engine: string } | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendTop5, setRecommendTop5] = useState<Array<Festival & { _distance: number }>>([]);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Try geolocation once (silently)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  // Smart recommendation
  useEffect(() => {
    if (!coords) return;
    const currentMonth = new Date().getMonth() + 1;
    const inMonth = data.filter((f) => getMonthFromDate(f.date) === currentMonth);
    const nearby = findNearby(inMonth, coords.lat, coords.lng, 30, 5);
    if (nearby.length === 0) return;
    setRecommendTop5(nearby);
    setRecommendLoading(true);
    runAI({
      task: "recommend",
      payload: nearby.map((n) => ({
        name: n.name,
        venue: n.venue,
        distanceKm: Number(n._distance.toFixed(1)),
        tags: n.tags,
      })),
    })
      .then((r) => {
        if (r.text) setRecommend({ text: r.text, engine: r.engine });
        else
          setRecommend({
            text: `🏮 ${nearby.length} festival(s) within 30km this month, including "${nearby[0].name}" (${formatDistance(nearby[0]._distance)}).`,
            engine: "static",
          });
      })
      .catch(() =>
        setRecommend({
          text: `🏮 ${nearby.length} festival(s) within 30km this month.`,
          engine: "static",
        }),
      )
      .finally(() => setRecommendLoading(false));
  }, [coords, data]);

  const filtered = useMemo(() => {
    let out = data;
    if (pref !== "全国") out = out.filter((f) => f.pref === pref);
    if (month) out = out.filter((f) => getMonthFromDate(f.date) === month);
    out = fullTextFilter(out, debouncedQ, ["name", "desc", "venue", "city", "pref"] as Array<keyof Festival>);
    return out;
  }, [data, pref, month, debouncedQ]);

  return (
    <div className="container mx-auto px-4 py-4 space-y-4">
      {/* Smart recommendation */}
      {coords && (recommendLoading || recommend) && (
        <Card className="border-omamori-gold/40 bg-gradient-to-br from-omamori-gold/10 to-transparent p-4">
          <div className="flex items-center gap-2 text-xs text-omamori-gold mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-semibold">Smart Recommendation</span>
            {recommendLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          {recommend && <p className="text-sm leading-relaxed">{recommend.text}</p>}
          {recommendTop5.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {recommendTop5.map((f) => (
                <div key={f.name} className="shrink-0 w-44 rounded-lg border bg-background/50 p-2">
                  <div className="text-xs font-semibold truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDistance(f._distance)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, venue, prefecture…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <select
          value={pref}
          onChange={(e) => setPref(e.target.value)}
          className="bg-secondary text-foreground text-sm rounded-md px-3 py-1.5 border border-border"
        >
          {PREFS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="bg-secondary text-foreground text-sm rounded-md px-3 py-1.5 border border-border"
        >
          <option value={0}>All months</option>
          {MONTH_NAMES.slice(1).map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString()} FESTIVALS FOUND
        </div>
        <TranslateBar items={filtered.slice(0, 50)} />
      </div>

      <FestivalList items={filtered} />
    </div>
  );
}

function TranslateBar({ items }: { items: Festival[] }) {
  const { translate, loading } = useTranslator();
  const [done, setDone] = useState(false);
  const handle = async () => {
    const texts: string[] = [];
    items.forEach((f) => {
      if (f.name) texts.push(f.name);
      if (f.desc) texts.push(f.desc);
      if (f.venue) texts.push(f.venue);
    });
    await translate(texts);
    setDone(true);
  };
  return (
    <Button
      size="sm"
      variant="outline"
      className="ml-auto h-7 text-xs"
      onClick={handle}
      disabled={loading || items.length === 0}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
      {done ? "EN added" : "Translate visible"}
    </Button>
  );
}

function FestivalList({ items }: { items: Festival[] }) {
  const parentRef = useState<HTMLDivElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerEl,
    estimateSize: () => 160,
    overscan: 8,
  });

  if (items.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No festivals match your filters.</div>;
  }

  return (
    <div
      ref={setContainerEl}
      className="h-[calc(100vh-340px)] min-h-[400px] overflow-auto rounded-lg border border-border/40"
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {rowVirtualizer.getVirtualItems().map((row) => {
          const f = items[row.index];
          return (
            <div
              key={row.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
                padding: "6px 10px",
              }}
              ref={rowVirtualizer.measureElement}
              data-index={row.index}
            >
              <FestivalCard f={f} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FestivalCard({ f }: { f: Festival }) {
  const month = getMonthFromDate(f.date);
  const mapsUrl = `https://www.google.com/maps?q=${f.lat},${f.lng}`;
  return (
    <Card className="p-3 hover:border-omamori-gold/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-jp font-semibold leading-tight">{f.name}</h3>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {f.pref} {f.city ? `· ${f.city}` : ""} {f.venue ? `· ${f.venue}` : ""}
          </div>
        </div>
        {month && (
          <Badge className="bg-omamori-red text-omamori-red-foreground border-0 shrink-0">
            {MONTH_NAMES[month]}
          </Badge>
        )}
      </div>
      {f.desc && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 font-jp">{f.desc}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {f.station && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Train className="h-3 w-3" /> {f.station.split(/[、,]/)[0]}
          </span>
        )}
        {f.tags?.slice(0, 3).map((t) => (
          <Badge key={t} variant="outline" className="border-omamori-gold/50 text-omamori-gold text-[10px] py-0 h-5">
            {t}
          </Badge>
        ))}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs text-primary inline-flex items-center gap-1 hover:underline"
        >
          <MapPin className="h-3 w-3" /> Map
        </a>
        <Link
          to="/emergency"
          className="text-xs inline-flex items-center gap-1 text-omamori-red hover:underline"
        >
          <AlertTriangle className="h-3 w-3" /> Shelter
        </Link>
      </div>
    </Card>
  );
}
