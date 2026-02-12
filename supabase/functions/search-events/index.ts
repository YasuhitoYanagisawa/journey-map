import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prefecture, city, period } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const locationQuery = [prefecture, city].filter(Boolean).join(" ");
    const periodQuery = period || "今後数ヶ月";

    const prompt = `以下の条件でお祭り・イベント情報をウェブで調べて、必ず以下のJSON形式のリストのみを返してください。

条件:
- 場所: ${locationQuery}
- 時期: ${periodQuery}

重要：各イベントの正確な住所と緯度経度を調べて含めてください。
他の文章・説明・補足文・装飾・コードブロックなどは一切追加しないでください。
見つからない場合は [] だけを返してください。
最大10件まで返してください。

[
  {
    "name": "三社祭",
    "location_name": "東京都台東区浅草2-3-1 浅草神社",
    "prefecture": "東京都",
    "city": "台東区",
    "description": "例大祭で神輿渡御が見どころ",
    "highlights": "本社神輿の宮出し・宮入り",
    "event_start": "2025-05-16",
    "event_end": "2025-05-18",
    "latitude": 35.714844,
    "longitude": 139.796707
  }
]`;

    console.log("Searching events for:", locationQuery, periodQuery);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "あなたは日本のお祭り・イベント情報を検索する優秀なAIです。指定された地域と時期のお祭りやイベントを調べ、正確なJSON形式で返してください。必ず有効なJSONのみを返してください。コードブロック(```)は使用しないでください。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "レート制限に達しました。しばらく待ってから再試行してください。" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI利用のクレジットが不足しています。" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    console.log("AI response content:", content);

    // Parse JSON from response
    let events: any[] = [];
    try {
      // Try to find JSON array in the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        events = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse events JSON:", parseError);
      events = [];
    }

    // Validate and clean events
    events = events
      .filter((e: any) => e.name && (e.latitude || e.longitude))
      .map((e: any) => ({
        name: e.name || "",
        location_name: e.location_name || "",
        prefecture: e.prefecture || prefecture || "",
        city: e.city || city || "",
        description: e.description || "",
        highlights: e.highlights || "",
        event_start: e.event_start || null,
        event_end: e.event_end || null,
        latitude: Number(e.latitude) || null,
        longitude: Number(e.longitude) || null,
      }));

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("search-events error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
