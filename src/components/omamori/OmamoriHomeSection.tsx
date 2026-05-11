import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, MapPin, MessageCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function OmamoriHomeSection() {
  // Show one piece of "live" copy if user grants location later; for now just static
  return (
    <section className="container mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🛡️</span>
        <h2 className="text-xl font-bold">Omamori — 旅の安全機能</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        29,165 festivals · 121,965 shelters · 181,312 hospitals — all in your pocket, even offline.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <OmamoriCard
          to="/festivals"
          icon={<Sparkles className="h-5 w-5" />}
          title="Festivals"
          jp="お祭りガイド"
          desc="Discover nearby Japanese festivals tailored to your location and the current season."
          accent="from-omamori-gold/30 to-transparent border-omamori-gold/40"
        />
        <OmamoriCard
          to="/communicate"
          icon={<MessageCircle className="h-5 w-5" />}
          title="Communicate"
          jp="通訳ヘルパー"
          desc="Show-cards, AI chat (Gemma 4 / Gemini), and text-to-speech in Japanese."
          accent="from-primary/20 to-transparent border-primary/30"
        />
        <OmamoriCard
          to="/emergency"
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Emergency"
          jp="緊急ガイド"
          desc="Find the nearest shelter & hospital, even without internet."
          accent="from-omamori-red/30 to-transparent border-omamori-red/50"
        />
      </div>
    </section>
  );
}

function OmamoriCard({
  to,
  icon,
  title,
  jp,
  desc,
  accent,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  jp: string;
  desc: string;
  accent: string;
}) {
  return (
    <Link to={to} className="block group">
      <Card
        className={`relative overflow-hidden border bg-gradient-to-br ${accent} p-5 transition-all hover:scale-[1.02] hover:shadow-lg`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-md bg-background/40 backdrop-blur p-1.5">{icon}</span>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs font-jp text-muted-foreground">{jp}</div>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 opacity-50 group-hover:translate-x-0.5 group-hover:opacity-100 transition-all" />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </Card>
    </Link>
  );
}
