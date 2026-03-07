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

    const { location, date } = await req.json();
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!GOOGLE_GEMINI_API_KEY) {
      console.error("GOOGLE_GEMINI_API_KEY is not configured");
      throw new Error("Server configuration error");
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

    const systemInstruction = "あなたは日本のニュース検索アシスタントです。Google検索を使って、指定された日付と場所に関連するニュースや出来事を検索してください。検索結果に基づいて、実際のニュース記事を5件まで返してください。ニュースが見つからない場合は空の配列を返してください。必ず有効なJSONのみを返してください。";

    const prompt = `${dateStr}に${location}で起きたニュースや出来事をGoogle検索で調べて教えてください。

以下のJSON形式で返してください:
{
  "news": [
    {
      "title": "ニュースのタイトル",
      "summary": "50文字以内の要約",
      "url": "ソースURL",
      "source": "ソース名"
    }
  ]
}`;

    // Use Gemini with Google Search grounding for real-time news
    // Note: Structured Output (responseMimeType) cannot be used with grounding tools,
    // so we use grounding + manual JSON parsing
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
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
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;

    console.log("Gemini grounded response:", content);
    if (groundingMetadata) {
      console.log("Grounding sources:", JSON.stringify(groundingMetadata.groundingChunks?.length || 0));
    }

    // Parse JSON from response (with grounding, need manual parsing)
    interface NewsItem {
      title: string;
      summary: string;
      url: string;
      source: string;
    }

    let newsData: { news: NewsItem[] } = { news: [] };
    let parseSuccess = true;
    try {
      // Strip markdown code blocks
      let cleaned = content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        newsData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse news JSON:", parseError);
      parseSuccess = false;
      // Fallback: try to extract from grounding metadata
      if (groundingMetadata?.groundingChunks) {
        newsData = {
          news: groundingMetadata.groundingChunks.slice(0, 5).map((chunk: any, idx: number) => ({
            title: chunk.web?.title || `関連記事 ${idx + 1}`,
            summary: "",
            url: chunk.web?.uri || "",
            source: chunk.web?.title ? new URL(chunk.web.uri).hostname : "不明",
          })),
        };
      }
    }

    // Enrich with grounding URLs if available
    if (groundingMetadata?.groundingChunks && newsData.news.length > 0) {
      newsData.news = newsData.news.map((item: NewsItem, idx: number) => {
        const chunk = groundingMetadata.groundingChunks[idx];
        return {
          ...item,
          url: item.url || chunk?.web?.uri || "",
          source: item.source || (chunk?.web?.uri ? new URL(chunk.web.uri).hostname : "不明"),
        };
      });
    }

    // End Weave trace
    await weaveCallEnd(weaveCall?.callId || "", {
      news_count: newsData.news.length,
      parse_success: parseSuccess,
      has_grounding: !!groundingMetadata,
      grounding_chunks: groundingMetadata?.groundingChunks?.length || 0,
      news_titles: newsData.news.map((n: NewsItem) => n.title),
    });

    return new Response(JSON.stringify(newsData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("search-news error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await weaveCallEnd(weaveCall?.callId || "", { parse_success: false }, errMsg);
    return new Response(
      JSON.stringify({ error: "ニュース検索中にエラーが発生しました。しばらく待ってから再試行してください。" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
