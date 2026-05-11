import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  MessageCircle,
  Volume2,
  Maximize2,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import BottomNav from "@/components/omamori/BottomNav";
import EngineBadge from "@/components/omamori/EngineBadge";
import { PHRASE_CATEGORIES, type Phrase } from "@/data/phrases";
import { runAI } from "@/lib/aiRouter";
import { isOllamaAvailable, ollamaChat } from "@/lib/ollama";
import { findNearby, fullTextFilter } from "@/lib/omamoriSearch";
import { getDataset, loadDataset, type Festival, type Shelter, type Hospital } from "@/lib/omamoriDB";

type Msg = { role: "user" | "assistant"; content: string; engine?: string };

export default function CommunicatePage() {
  const [tab, setTab] = useState(PHRASE_CATEGORIES[0].key);
  const cat = PHRASE_CATEGORIES.find((c) => c.key === tab) ?? PHRASE_CATEGORIES[0];
  const [showCard, setShowCard] = useState<Phrase | null>(null);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-4">
      <Header />
      <div className="container mx-auto px-4 py-4 space-y-4">
        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {PHRASE_CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition ${
                tab === c.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              }`}
            >
              <span className="mr-1">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        {/* Phrase cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cat.phrases.map((p, i) => (
            <PhraseCard key={i} p={p} onShow={() => setShowCard(p)} />
          ))}
        </div>

        <ChatPanel />
      </div>

      <ShowCardDialog phrase={showCard} onOpenChange={() => setShowCard(null)} />
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
          <MessageCircle className="h-5 w-5" />
          Communicate <span className="font-jp text-muted-foreground text-sm">通訳</span>
        </h1>
        <div className="ml-auto"><EngineBadge /></div>
      </div>
    </header>
  );
}

function speakJapanese(text: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// Speaks mixed JP/EN content by splitting into language-tagged chunks.
function speakAuto(text: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  // Split by sentence-ish boundaries; detect Japanese vs Latin
  const parts = text
    .replace(/[*_`#>~|]/g, "")
    .split(/(?<=[。．!?！？\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    const isJP = /[぀-ヿ㐀-鿿]/.test(p);
    const u = new SpeechSynthesisUtterance(p);
    u.lang = isJP ? "ja-JP" : "en-US";
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
}

function PhraseCard({ p, onShow }: { p: Phrase; onShow: () => void }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{p.en}</div>
      <div className="font-jp text-lg leading-tight mt-1">{p.ja}</div>
      <div className="text-[11px] text-muted-foreground italic">{p.romaji}</div>
      <div className="flex gap-2 mt-2">
        <Button size="sm" variant="outline" onClick={() => speakJapanese(p.ja)} className="flex-1">
          <Volume2 className="h-3.5 w-3.5" /> Speak
        </Button>
        <Button size="sm" variant="outline" onClick={onShow} className="flex-1">
          <Maximize2 className="h-3.5 w-3.5" /> Show
        </Button>
      </div>
    </Card>
  );
}

function ShowCardDialog({ phrase, onOpenChange }: { phrase: Phrase | null; onOpenChange: () => void }) {
  return (
    <Dialog open={!!phrase} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white text-black border-white">
        <div className="p-6 text-center font-jp">
          <div className="text-4xl leading-tight font-bold">{phrase?.ja}</div>
          <div className="mt-4 text-sm text-gray-500">{phrase?.en}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── AI Chat with Function Calling ────────────────────────────────

const TOOLS_PROMPT = `You can OPTIONALLY call one tool by responding with ONLY a JSON object on a single line, no prose, no markdown:
{"tool":"<name>","args":{...}}

Available tools:
- search_festivals: { "query": string, "pref"?: string, "month"?: number }
- find_nearby_festivals: { "lat": number, "lng": number, "radius_km": number }
- find_nearest_shelter: { "lat": number, "lng": number, "type"?: "eq"|"ts"|"fl"|"vo" }
- find_nearest_hospital: { "lat": number, "lng": number, "emergency_only"?: boolean }

Use a tool ONLY when the user asks about festivals, shelters, or hospitals. Otherwise, answer directly with bilingual English+Japanese (with romaji).`;

async function ensureDataset<T>(name: "festivals" | "shelters" | "hospitals"): Promise<T[]> {
  const cached = await getDataset<T>(name);
  if (cached) return cached;
  return await loadDataset<T>(name);
}

async function executeTool(call: { tool: string; args: Record<string, any> }): Promise<string> {
  try {
    if (call.tool === "search_festivals") {
      const data = await ensureDataset<Festival>("festivals");
      let items = data;
      if (call.args.pref) items = items.filter((f) => f.pref === call.args.pref);
      if (call.args.month) {
        items = items.filter((f) => {
          const m = f.date?.match(/-(\d{2})-/);
          return m && parseInt(m[1], 10) === call.args.month;
        });
      }
      if (call.args.query) {
        items = fullTextFilter(items, String(call.args.query), [
          "name",
          "desc",
          "venue",
          "city",
        ] as Array<keyof Festival>);
      }
      return JSON.stringify(
        items.slice(0, 5).map((f) => ({ name: f.name, pref: f.pref, city: f.city, venue: f.venue, date: f.date })),
      );
    }
    if (call.tool === "find_nearby_festivals") {
      const data = await ensureDataset<Festival>("festivals");
      const r = findNearby(data, call.args.lat, call.args.lng, call.args.radius_km ?? 30, 5);
      return JSON.stringify(
        r.map((f) => ({ name: f.name, pref: f.pref, distanceKm: Number(f._distance.toFixed(1)) })),
      );
    }
    if (call.tool === "find_nearest_shelter") {
      const data = await ensureDataset<Shelter>("shelters");
      let items = data;
      const t = call.args.type;
      if (t && ["eq", "ts", "fl", "vo"].includes(t)) {
        items = data.filter((s) => (s as any)[t] === 1);
      }
      const r = findNearby(items, call.args.lat, call.args.lng, 50, 3);
      return JSON.stringify(
        r.map((s) => ({ name: s.name, addr: s.addr, distanceKm: Number(s._distance.toFixed(2)), capacity: s.cap })),
      );
    }
    if (call.tool === "find_nearest_hospital") {
      const data = await ensureDataset<Hospital>("hospitals");
      const items = call.args.emergency_only ? data.filter((h) => h.em === 1) : data;
      const r = findNearby(items, call.args.lat, call.args.lng, 50, 3);
      return JSON.stringify(
        r.map((h) => ({ name: h.name, addr: h.addr, distanceKm: Number(h._distance.toFixed(2)), emergency: h.em === 1 })),
      );
    }
    return JSON.stringify({ error: "Unknown tool" });
  } catch (e) {
    return JSON.stringify({ error: String((e as Error)?.message || e) });
  }
}

function tryParseToolCall(text: string): { tool: string; args: Record<string, any> } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.tool === "string" && parsed.args) return parsed;
  } catch {}
  return null;
}

function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! Ask me anything in English or Japanese — translation, festivals nearby, or where the closest shelter is.\n\nこんにちは！日本語でも英語でも質問してください。",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);

    const systemPrompt = `You are a bilingual cultural translator and travel concierge for tourists in Japan. ${
      coords ? `User's approximate coords: ${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}.` : ""
    } ${TOOLS_PROMPT}`;

    try {
      // Pass 1
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const r1 = await runAI({
        task: "chat",
        systemPrompt,
        messages: history,
      });

      if (!r1.text && r1.engine === "static") {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "🤖 AI assistant is offline. Use the phrase cards above for common situations.",
            engine: "static",
          },
        ]);
        return;
      }

      const call = tryParseToolCall(r1.text);
      if (call) {
        const toolResult = await executeTool(call);
        const r2 = await runAI({
          task: "chat",
          systemPrompt,
          messages: [
            ...history,
            { role: "assistant", content: r1.text },
            {
              role: "user",
              content: `Tool result for ${call.tool}: ${toolResult}\n\nNow answer the original question naturally in English + Japanese (with romaji).`,
            },
          ],
        });
        setMessages((m) => [
          ...m,
          { role: "assistant", content: r2.text || toolResult, engine: r2.engine },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: r1.text, engine: r1.engine },
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Error: ${(e as Error)?.message || String(e)}`,
          engine: "static",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">AI Chat</div>
        <span className="text-[10px] text-muted-foreground">
          Gemma 4 (local) → Gemini (cloud) → static fallback
        </span>
      </div>
      <div ref={scrollRef} className="h-72 overflow-y-auto space-y-2 rounded-md bg-secondary/30 p-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-background border border-border"
            }`}
          >
            {m.role === "assistant" ? (
              <>
                <div className="prose prose-sm dark:prose-invert max-w-none font-jp [&_p]:my-1">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
                <div className="flex justify-end mt-1">
                  <button
                    onClick={() => speakAuto(m.content)}
                    className="text-[10px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    aria-label="Speak"
                  >
                    <Volume2 className="h-3 w-3" /> Speak
                  </button>
                </div>
              </>
            ) : (
              <div className="font-jp">{m.content}</div>
            )}
          </div>
        ))}
        {busy && (
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking…
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a question…"
          disabled={busy}
        />
        <Button onClick={send} disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
