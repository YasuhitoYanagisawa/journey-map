import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Build search query
    const query = `${dateStr} ${location} ニュース 出来事`;

    console.log("Searching news with query:", query);

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
            content: `あなたは日本のニュース検索アシスタントです。指定された日付と場所に関連するニュースや出来事を検索し、以下のJSON形式で5件まで返してください。必ず有効なJSONのみを返してください。

形式:
{
  "news": [
    {
      "title": "ニュースのタイトル",
      "summary": "50文字以内の要約",
      "url": "ソースURL（あれば）",
      "source": "ソース名"
    }
  ]
}

ニュースが見つからない場合は {"news": []} を返してください。`,
          },
          {
            role: "user",
            content: query,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Perplexity API error:", response.status, errorText);
      
      if (response.status === 429) {
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

    console.log("Perplexity response content:", content);

    // Try to parse the JSON from the response
    interface NewsItem {
      title: string;
      summary: string;
      url: string;
      source: string;
    }
    
    let newsData: { news: NewsItem[] } = { news: [] };
    try {
      // Find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        newsData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse news JSON:", parseError);
      // Return citations as fallback
      newsData = {
        news: citations.slice(0, 5).map((url: string, idx: number) => ({
          title: `関連記事 ${idx + 1}`,
          summary: "",
          url: url,
          source: new URL(url).hostname,
        })),
      };
    }

    // Add citations to news items if they don't have URLs
    if (citations.length > 0) {
      newsData.news = newsData.news.map((item: NewsItem, idx: number) => ({
        ...item,
        url: item.url || citations[idx] || "",
      }));
    }

    return new Response(JSON.stringify(newsData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("search-news error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
