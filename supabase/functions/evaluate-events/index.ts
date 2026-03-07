import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEAVE_BASE_URL = "https://trace.wandb.ai";
const WEAVE_PROJECT_ID = "chattso-gpt/Journey Map Monitoring";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const userId = claimsData.claims.sub;
    const WANDB_API_KEY = Deno.env.get("WANDB_API_KEY");
    if (!WANDB_API_KEY) {
      throw new Error("WANDB_API_KEY is not configured");
    }

    console.log("Starting evaluation for user:", userId);

    // Step 1: Fetch search-events traces from Weave
    const tracesResponse = await fetch(`${WEAVE_BASE_URL}/calls/stream_query`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: WEAVE_PROJECT_ID,
        filter: {
          op_names: ["search-events"],
        },
        limit: 100,
        sort_by: [{ field: "started_at", direction: "desc" }],
        columns: ["id", "inputs", "output", "started_at"],
      }),
    });

    if (!tracesResponse.ok) {
      const errText = await tracesResponse.text();
      console.error("Weave query error:", tracesResponse.status, errText);
      throw new Error(`Failed to query Weave traces: ${tracesResponse.status}`);
    }

    // Parse NDJSON response (Weave streams newline-delimited JSON)
    const tracesText = await tracesResponse.text();
    const traceLines = tracesText.trim().split("\n").filter(Boolean);
    const traces: any[] = [];
    for (const line of traceLines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.id) traces.push(parsed);
      } catch {
        // skip malformed lines
      }
    }
    
    // Debug: log first trace's full keys to understand structure
    if (traces.length > 0) {
      const firstTrace = traces[0];
      console.log("First trace keys:", JSON.stringify(Object.keys(firstTrace)));
      console.log("First trace sample:", JSON.stringify(firstTrace).substring(0, 500));
    }

    console.log(`Fetched ${traces.length} search-events traces`);

    // Step 2: Extract all suggested events from traces
    const suggestedEvents: { name: string; prefecture: string; city: string; traceId: string; timestamp: string }[] = [];
    for (const trace of traces) {
      // Weave stores outputs at various paths depending on version
      const outputs = trace.output || trace.outputs || {};
      const summary = outputs.events_summary || outputs.result?.events_summary || [];
      const inputs = trace.inputs || trace.input || {};
      
      console.log(`Trace ${trace.id}: output keys = ${JSON.stringify(Object.keys(outputs))}, summary length = ${Array.isArray(summary) ? summary.length : 'not array'}`);
      
      for (const event of (Array.isArray(summary) ? summary : [])) {
        suggestedEvents.push({
          name: event.name,
          prefecture: inputs.prefecture || "",
          city: inputs.city || "",
          traceId: trace.id,
          timestamp: trace.started_at || "",
        });
      }
    }

    console.log(`Total suggested events from traces: ${suggestedEvents.length}`);

    // Step 3: Fetch user's adopted events from DB
    const { data: adoptedEvents, error: dbError } = await supabase
      .from("events")
      .select("name, prefecture, city, source, visited, created_at")
      .eq("user_id", userId);

    if (dbError) throw dbError;

    const aiAdoptedEvents = (adoptedEvents || []).filter(e => e.source === "ai");
    const visitedAdoptedEvents = aiAdoptedEvents.filter(e => e.visited);

    console.log(`AI-adopted events: ${aiAdoptedEvents.length}, Visited: ${visitedAdoptedEvents.length}`);

    // Step 4: Calculate metrics
    // Fuzzy name matching: normalize and compare
    const normalize = (s: string) => s.toLowerCase().replace(/[\s　・\-]/g, "").replace(/[0-9０-９]/g, "");

    const adoptedNames = new Set(aiAdoptedEvents.map(e => normalize(e.name)));
    const visitedNames = new Set(visitedAdoptedEvents.map(e => normalize(e.name)));

    // Unique suggested event names
    const uniqueSuggested = new Set(suggestedEvents.map(e => normalize(e.name)));

    // How many suggested events were adopted?
    let adoptedCount = 0;
    let visitedCount = 0;
    for (const name of uniqueSuggested) {
      if (adoptedNames.has(name)) adoptedCount++;
      if (visitedNames.has(name)) visitedCount++;
    }

    const totalSuggested = uniqueSuggested.size;
    const totalAdopted = aiAdoptedEvents.length;

    // Precision: of all AI suggestions, how many were adopted?
    const precision = totalSuggested > 0 ? adoptedCount / totalSuggested : 0;

    // Adoption rate: of all adopted events, how many came from AI?
    const totalAllEvents = (adoptedEvents || []).length;
    const aiRatio = totalAllEvents > 0 ? aiAdoptedEvents.length / totalAllEvents : 0;

    // Visit rate: of adopted AI events, how many were actually visited?
    const visitRate = aiAdoptedEvents.length > 0 ? visitedAdoptedEvents.length / aiAdoptedEvents.length : 0;

    // Quality score: weighted combination
    const qualityScore = Math.round((precision * 0.4 + visitRate * 0.4 + aiRatio * 0.2) * 100);

    const evaluation = {
      timestamp: new Date().toISOString(),
      metrics: {
        precision: Math.round(precision * 100) / 100,
        visit_rate: Math.round(visitRate * 100) / 100,
        ai_ratio: Math.round(aiRatio * 100) / 100,
        quality_score: qualityScore,
      },
      counts: {
        total_traces: traces.length,
        unique_suggestions: totalSuggested,
        adopted_from_suggestions: adoptedCount,
        total_adopted_ai: totalAdopted,
        total_visited_ai: visitedAdoptedEvents.length,
        total_events: totalAllEvents,
      },
      // Per-area breakdown
      area_breakdown: calculateAreaBreakdown(suggestedEvents, aiAdoptedEvents, normalize),
    };

    console.log("Evaluation result:", JSON.stringify(evaluation));

    // Step 5: Record evaluation to Weave as a trace
    const evalCallId = crypto.randomUUID();
    const evalTraceId = crypto.randomUUID();

    // Start eval trace
    await fetch(`${WEAVE_BASE_URL}/call/start`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: {
          project_id: WEAVE_PROJECT_ID,
          id: evalCallId,
          op_name: "evaluate-events",
          trace_id: evalTraceId,
          started_at: new Date().toISOString(),
          attributes: { source: "evaluation" },
          inputs: {
            total_traces_analyzed: traces.length,
            user_id: userId,
          },
        },
      }),
    });

    // End eval trace
    await fetch(`${WEAVE_BASE_URL}/call/end`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${WANDB_API_KEY}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        end: {
          project_id: WEAVE_PROJECT_ID,
          id: evalCallId,
          ended_at: new Date().toISOString(),
          summary: {},
          outputs: evaluation.metrics,
        },
      }),
    });

    return new Response(JSON.stringify(evaluation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("evaluate-events error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function calculateAreaBreakdown(
  suggestions: { name: string; prefecture: string; city: string }[],
  adopted: { name: string; prefecture: string; city: string }[],
  normalize: (s: string) => string
) {
  const areas = new Map<string, { suggested: Set<string>; adopted: Set<string> }>();

  for (const s of suggestions) {
    const area = `${s.prefecture} ${s.city}`.trim() || "不明";
    if (!areas.has(area)) areas.set(area, { suggested: new Set(), adopted: new Set() });
    areas.get(area)!.suggested.add(normalize(s.name));
  }

  for (const a of adopted) {
    const area = `${a.prefecture} ${a.city}`.trim() || "不明";
    if (!areas.has(area)) areas.set(area, { suggested: new Set(), adopted: new Set() });
    areas.get(area)!.adopted.add(normalize(a.name));
  }

  const breakdown: { area: string; suggested: number; adopted: number; precision: number }[] = [];
  for (const [area, data] of areas) {
    let matched = 0;
    for (const name of data.suggested) {
      if (data.adopted.has(name)) matched++;
    }
    breakdown.push({
      area,
      suggested: data.suggested.size,
      adopted: data.adopted.size,
      precision: data.suggested.size > 0 ? Math.round((matched / data.suggested.size) * 100) / 100 : 0,
    });
  }

  return breakdown.sort((a, b) => b.suggested - a.suggested);
}
