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
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    // Start Weave trace
    weaveCall = await weaveCallStart("analyze-photo", { imageUrl });

    console.log("Analyzing photo:", imageUrl);

    // Fetch image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(
      new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    // Call Gemini with Structured Output
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `この写真を分析してください。
タグは日本語で5〜10個、写真の内容・場所・被写体・季節・雰囲気を含めてください。
有名な場所や建物が写っている場合はその名前もタグに含めてください。
人物が写っている場合、有名人かどうか分析し、分かればsubjectsにその人物名を含めてください。`,
                },
                {
                  inlineData: {
                    mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                tags: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                  description: "写真のタグ（日本語、5〜10個）",
                },
                description: {
                  type: "STRING",
                  description: "写真の説明（日本語、50文字以内）",
                },
                subjects: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                  description: "被写体のリスト",
                },
                scene: {
                  type: "STRING",
                  description: "シーンの種類（風景/建物/食べ物/人物/動物/イベント/その他）",
                },
                mood: {
                  type: "STRING",
                  description: "写真の雰囲気（明るい/暗い/ノスタルジック/ダイナミック/穏やか/その他）",
                },
              },
              required: ["tags", "description", "subjects", "scene", "mood"],
            },
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);

      if (geminiResponse.status === 429) {
        await weaveCallEnd(weaveCall?.callId || "", {}, "Rate limit exceeded");
        return new Response(
          JSON.stringify({ error: "レート制限に達しました。しばらく待ってから再試行してください。" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    console.log("Gemini structured response:", content);

    // With Structured Output, the response IS valid JSON
    let analysis = { tags: [], description: "", subjects: [], scene: "", mood: "" };
    try {
      analysis = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse analysis JSON:", parseError);
    }

    // End Weave trace with success
    await weaveCallEnd(weaveCall?.callId || "", {
      tag_count: analysis.tags?.length || 0,
      scene: analysis.scene,
      mood: analysis.mood,
      parse_success: true,
      description: analysis.description,
    });

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-photo error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await weaveCallEnd(weaveCall?.callId || "", { parse_success: false }, errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
