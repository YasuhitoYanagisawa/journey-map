// Omamori AI Edge Function — Lovable AI Gateway (Gemini)
// Single function with task routing: chat | recommend | medical-card

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  chat:
    "You are a bilingual cultural translator and travel concierge for tourists in Japan. Always answer concisely and provide BOTH English and Japanese (with romaji) when giving phrases the tourist may want to say. If the user asks for festivals or shelters, answer naturally based on the data they provide.",
  recommend:
    "You are a travel concierge. Given a JSON list of nearby Japanese festivals, write a single warm, vivid 2-sentence recommendation in English (~40 words). Mention the most appealing festival by name and the count of nearby festivals. Do not invent details outside the data.",
  "medical-card":
    "You generate emergency medical ShowCards for foreign tourists in Japan. Output Japanese only, large clear sentences a Japanese clinic staff or first responder can read. Include: that the patient is a foreign tourist, the symptoms in plain Japanese, allergies if any, and a polite request for a doctor who speaks English. Output 4-6 short sentences. No markdown, no English.",
  translate:
    "You translate Japanese text (festival/place names, descriptions, addresses) into clear, natural English for foreign tourists. Keep proper nouns intact (with romaji in parentheses where helpful). Output ONLY the English translation, no preface, no quotes, no markdown.",
};

interface Body {
  task: "chat" | "recommend" | "medical-card" | "translate";
  systemPrompt?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  userText?: string;
  payload?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const body: Body = await req.json();
    const task = body.task;
    if (!task || !SYSTEM_PROMPTS[task]) {
      return new Response(JSON.stringify({ error: "Invalid task" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Choose model: chat needs better reasoning, others use lite
    const model =
      task === "chat" ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash-lite";

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: body.systemPrompt || SYSTEM_PROMPTS[task] },
    ];

    if (body.messages?.length) {
      messages.push(...body.messages);
    }

    if (body.userText) {
      messages.push({ role: "user", content: body.userText });
    }

    if (body.payload && task !== "chat") {
      messages.push({
        role: "user",
        content:
          (task === "recommend" ? "Nearby festivals JSON:\n" : "Symptoms JSON:\n") +
          JSON.stringify(body.payload),
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway", aiRes.status, t);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Lovable AI credits exhausted. Add funds in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("omamori-ai error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
