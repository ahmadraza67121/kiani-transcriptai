import { NextRequest, NextResponse } from "next/server";

// Proxy route to fetch YouTube pages — avoids CORS issues for client
export async function POST(request: NextRequest) {
  try {
    const { targetUrl } = await request.json();

    if (!targetUrl) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    // Only allow YouTube URLs
    const allowed =
      targetUrl.includes("youtube.com") ||
      targetUrl.includes("youtu.be") ||
      targetUrl.includes("google.com/api/timedtext") ||
      targetUrl.includes("youtube.com/api/timedtext");

    if (!allowed) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1",
      },
      signal: AbortSignal.timeout(15000),
    });

    const text = await response.text();
    return NextResponse.json({ success: true, body: text });
  } catch {
    return NextResponse.json({ error: "Proxy fetch failed" }, { status: 500 });
  }
}
