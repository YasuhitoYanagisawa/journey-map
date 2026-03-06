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
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");

    if (!PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY is not configured");
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

    // Use Perplexity Structured Output (response_format with json_schema)
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `あなたは日本のニュース検索アシスタントです。指定された日付と場所に関連するニュースや出来事を検索し、5件まで返してください。ニュースが見つからない場合は空の配列を返してください。`,
          },
          {
            role: "user",
            content: query,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "news_results",
            schema: {
              type: "object",
              properties: {
                news: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "ニュースのタイトル" },
                      summary: { type: "string", description: "50文字以内の要約" },
                      url: { type: "string", description: "ソースURL" },
                      source: { type: "string", description: "ソース名" },
                    },
                    required: ["title", "summary"],
                  },
                },
              },
              required: ["news"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Perplexity API error:", response.status, errorText);

      if (response.status === 429) {
        await weaveCallEnd(weaveCall?.callId || "", {}, "Rate limit exceeded");
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    console.log("Perplexity structured response:", content);

    // Parse JSON - with structured output this should be clean
    interface NewsItem {
      title: string;
      summary: string;
      url: string;
      source: string;
    }

    let newsData: { news: NewsItem[] } = { news: [] };
    let parseSuccess = true;
    try {
      // Strip any markdown code blocks just in case
      let cleaned = content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        newsData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse news JSON:", parseError);
      parseSuccess = false;
      // Fallback to citations
      newsData = {
        news: citations.slice(0, 5).map((url: string, idx: number) => ({
          title: `関連記事 ${idx + 1}`,
          summary: "",
          url: url,
          source: new URL(url).hostname,
        })),
      };
    }

    // Enrich with citations
    if (citations.length > 0) {
      newsData.news = newsData.news.map((item: NewsItem, idx: number) => ({
        ...item,
        url: item.url || citations[idx] || "",
      }));
    }

    // End Weave trace
    await weaveCallEnd(weaveCall?.callId || "", {
      news_count: newsData.news.length,
      parse_success: parseSuccess,
      has_citations: citations.length > 0,
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
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
