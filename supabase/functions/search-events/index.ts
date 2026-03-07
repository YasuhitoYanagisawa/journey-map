import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Weave Tracing Helper ---
const WEAVE_BASE_URL = "https://trace.wandb.ai";
const WEAVE_PROJECT_ID = "chattso-gpt/Journey Map Monitoring";

async function weaveCallStart(opName: string, inputs: Record<string, unknown>, traceId?: string) {
  const WANDB_API_KEY = Deno.env.get("WANDB_API_KEY");
  if (!WANDB_API_KEY) return null;

  const callId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  try {
    const res = await fetch(`${WEAVE_BASE_URL}/call/start`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: {
          project_id: WEAVE_PROJECT_ID,
          id: callId,
          op_name: opName,
          trace_id: traceId || crypto.randomUUID(),
          started_at: startedAt,
          attributes: { source: "edge-function" },
          inputs,
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Weave call/start HTTP error:", res.status, errText);
      return { callId, traceId: traceId || callId };
    }
    const data = await res.json();
    console.log("Weave call/start success:", data);
    return { callId, traceId: data.trace_id || traceId || callId };
  } catch (e) {
    console.error("Weave call/start error:", e);
    return { callId, traceId: traceId || callId };
  }
}

async function weaveCallEnd(callId: string, outputs: Record<string, unknown>, error?: string) {
  const WANDB_API_KEY = Deno.env.get("WANDB_API_KEY");
  if (!WANDB_API_KEY || !callId) return;

  try {
    const res = await fetch(`${WEAVE_BASE_URL}/call/end`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        end: {
          project_id: WEAVE_PROJECT_ID,
          id: callId,
          ended_at: new Date().toISOString(),
          summary: {},
          output: outputs,
          ...(error ? { exception: error } : {}),
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Weave call/end HTTP error:", res.status, errText);
    } else {
      console.log("Weave call/end success");
    }
  } catch (e) {
    console.error("Weave call/end error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let weaveCall: { callId: string; traceId: string } | null = null;

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prefecture, city, period } = await req.json();
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!GOOGLE_GEMINI_API_KEY) {
      console.error("GOOGLE_GEMINI_API_KEY is not configured");
      throw new Error("Server configuration error");
    }

    const locationQuery = [prefecture, city].filter(Boolean).join(" ");
    const periodQuery = period || "今後2ヶ月以内";

    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const todayStr = jstNow.toISOString().split('T')[0];

    const twoMonthsLater = new Date(jstNow.getTime());
    twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
    const maxDateStr = twoMonthsLater.toISOString().split('T')[0];

    // Start Weave trace
    weaveCall = await weaveCallStart("search-events", {
      prefecture, city, period: periodQuery, todayStr, maxDateStr,
    });

    const prompt = `以下の条件でお祭り・イベント情報をウェブで調べて返してください。

条件:
- 場所: ${locationQuery}
- 時期: ${periodQuery}
- 今日の日付: ${todayStr}
- 重要: 今日(${todayStr})以降、かつ${maxDateStr}以前に開催されるイベントのみを返してください。過去のイベントや2ヶ月以上先のイベントは絶対に含めないでください。

重要：各イベントの正確な住所と緯度経度を調べて含めてください。
見つからない場合は空の配列を返してください。
最大10件まで返してください。`;

    const systemInstruction = "あなたは日本のお祭り・イベント情報を検索する優秀なAIです。指定された地域と時期のお祭りやイベントを調べ、正確なJSON形式で返してください。";

    console.log("Searching events for:", locationQuery, periodQuery);

    // Use Gemini Structured Output with response_schema
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING", description: "イベント名" },
                  location_name: { type: "STRING", description: "開催場所の正式名称と住所" },
                  prefecture: { type: "STRING", description: "都道府県" },
                  city: { type: "STRING", description: "市区町村" },
                  description: { type: "STRING", description: "イベントの概要" },
                  highlights: { type: "STRING", description: "見どころ" },
                  event_start: { type: "STRING", description: "開始日 YYYY-MM-DD形式" },
                  event_end: { type: "STRING", description: "終了日 YYYY-MM-DD形式" },
                  latitude: { type: "NUMBER", description: "緯度" },
                  longitude: { type: "NUMBER", description: "経度" },
                },
                required: ["name", "location_name", "prefecture", "city", "event_start", "latitude", "longitude"],
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

      if (response.status === 429) {
        await weaveCallEnd(weaveCall?.callId || "", {}, "Rate limit exceeded");
        return new Response(
          JSON.stringify({ error: "レート制限に達しました。しばらく待ってから再試行してください。" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    console.log("Gemini structured response:", content);

    // With Structured Output, the response IS valid JSON
    let events: any[] = [];
    try {
      events = JSON.parse(content);
      if (!Array.isArray(events)) events = [];
    } catch (parseError) {
      console.error("Failed to parse events JSON:", parseError);
      events = [];
    }

    // Validate and filter
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
      }))
      .filter((e: any) => {
        const startDate = e.event_start;
        const endDate = e.event_end || e.event_start;
        if (!endDate && !startDate) return true;
        if (endDate && endDate < todayStr) return false;
        if (startDate && startDate > maxDateStr) return false;
        return true;
      });

    // End Weave trace with success
    await weaveCallEnd(weaveCall?.callId || "", {
      event_count: events.length,
      events_summary: events.map((e: any) => ({ name: e.name, start: e.event_start, lat: e.latitude, lng: e.longitude })),
      parse_success: true,
      raw_content_length: content.length,
    });

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("search-events error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await weaveCallEnd(weaveCall?.callId || "", { parse_success: false }, errMsg);
    return new Response(
      JSON.stringify({ error: "イベント検索中にエラーが発生しました。しばらく待ってから再試行してください。" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
