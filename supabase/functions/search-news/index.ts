import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Weave Tracing Helper ---
const WEAVE_BASE_URL = "https://trace.wandb.ai";
const WEAVE_PROJECT_ID = "journey-map-monitoring";

async function weaveCallStart(opName: string, inputs: Record<string, unknown>, traceId?: string) {
  const WANDB_API_KEY = Deno.env.get("WANDB_API_KEY");
  if (!WANDB_API_KEY) return null;
  const callId = crypto.randomUUID();
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
          started_at: new Date().toISOString(),
          attributes: { source: "edge-function" },
          inputs,
        },
      }),
    });
    const data = await res.json();
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
    await fetch(`${WEAVE_BASE_URL}/call/end`, {
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
          outputs,
          ...(error ? { exception: error } : {}),
        },
      }),
    });
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
    const { location, date } = await req.json();
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    // Format date for search
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const dateStr = `${year}年${month}月${day}日`;

    const query = `${dateStr} ${location} ニュース 出来事`;

    // Start Weave trace
    weaveCall = await weaveCallStart("search-news", { location, date, query });

    console.log("Searching news with query:", query);

    const systemInstruction = "あなたは日本のニュース検索アシスタントです。指定された日付と場所に関連するニュースや出来事を検索し、5件まで返してください。ニュースが見つからない場合は空の配列を返してください。";

    const prompt = `${dateStr}に${location}で起きたニュースや出来事を教えてください。`;

    // Use Gemini with Structured Output
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
              type: "OBJECT",
              properties: {
                news: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      title: { type: "STRING", description: "ニュースのタイトル" },
                      summary: { type: "STRING", description: "50文字以内の要約" },
                      url: { type: "STRING", description: "ソースURL（不明な場合は空文字）" },
                      source: { type: "STRING", description: "ソース名" },
                    },
                    required: ["title", "summary", "source"],
                  },
                },
              },
              required: ["news"],
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
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"news":[]}';

    console.log("Gemini structured response:", content);

    let newsData: { news: Array<{ title: string; summary: string; url: string; source: string }> } = { news: [] };
    let parseSuccess = true;
    try {
      newsData = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse news JSON:", parseError);
      parseSuccess = false;
    }

    // End Weave trace
    await weaveCallEnd(weaveCall?.callId || "", {
      news_count: newsData.news.length,
      parse_success: parseSuccess,
      news_titles: newsData.news.map((n) => n.title),
    });

    return new Response(JSON.stringify(newsData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("search-news error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await weaveCallEnd(weaveCall?.callId || "", { parse_success: false }, errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
