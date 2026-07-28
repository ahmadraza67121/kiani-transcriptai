import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transcripts } from "@/db/schema";

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/")
    .replace(/\\n/g, " ").replace(/\n/g, " ");
}

interface CaptionSegment {
  text: string;
  start: number;
  dur: number;
}

// =============================================
// METHOD 1: Invidious API (BEST for servers — not blocked)
// =============================================
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.jing.rocks",
  "https://invidious.privacyredirect.com",
  "https://iv.ggtyler.dev",
  "https://invidious.protokolla.fi",
  "https://yt.cdaut.de",
];

async function fetchViaInvidious(videoId: string): Promise<CaptionSegment[] | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      // Get captions list
      const res = await fetch(`${instance}/api/v1/captions/${videoId}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const captions = data?.captions;
      if (!captions || captions.length === 0) continue;

      // Find best caption track
      const track =
        captions.find((c: { language_code: string }) => c.language_code === "en") ||
        captions.find((c: { language_code: string }) => c.language_code?.startsWith("en")) ||
        captions[0];

      if (!track?.label) continue;

      // Fetch the actual caption content
      const captionUrl = `${instance}/api/v1/captions/${videoId}?label=${encodeURIComponent(track.label)}`;
      const captionRes = await fetch(captionUrl, {
        signal: AbortSignal.timeout(8000),
      });

      if (!captionRes.ok) continue;

      const xml = await captionRes.text();
      const segments = parseTranscriptXml(xml);

      if (segments.length > 0) {
        console.log(`[Invidious] Success via ${instance}`);
        return segments;
      }
    } catch {
      // Try next instance
      continue;
    }
  }
  return null;
}

// =============================================
// METHOD 2: InnerTube API (Android client)
// =============================================
async function fetchViaInnerTube(videoId: string): Promise<CaptionSegment[] | null> {
  try {
    const response = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "19.09.37",
            hl: "en",
            gl: "US",
            androidSdkVersion: 30,
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0) return null;

    const track =
      captions.find((c: { languageCode: string }) => c.languageCode === "en") ||
      captions.find((c: { languageCode: string }) => c.languageCode?.startsWith("en")) ||
      captions[0];

    const captionResponse = await fetch(track.baseUrl, {
      headers: { "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip" },
      signal: AbortSignal.timeout(10000),
    });

    const xml = await captionResponse.text();
    const segments = parseTranscriptXml(xml);
    if (segments.length > 0) {
      console.log("[InnerTube] Success");
      return segments;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================
// METHOD 3: Web scraping
// =============================================
async function fetchViaWebPage(videoId: string): Promise<CaptionSegment[] | null> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
        Cookie: "CONSENT=YES+1",
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await response.text();
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script)/);
    if (!playerMatch) return null;

    const playerData = JSON.parse(playerMatch[1]);
    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0) return null;

    const track =
      captions.find((c: { languageCode: string }) => c.languageCode === "en") ||
      captions.find((c: { languageCode: string }) => c.languageCode?.startsWith("en")) ||
      captions[0];

    const captionResponse = await fetch(track.baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });

    const xml = await captionResponse.text();
    const segments = parseTranscriptXml(xml);
    if (segments.length > 0) {
      console.log("[WebPage] Success");
      return segments;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================
// METHOD 4: youtube-transcript package
// =============================================
async function fetchViaPackage(videoId: string): Promise<CaptionSegment[] | null> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const data = await YoutubeTranscript.fetchTranscript(videoId);
    if (!data || data.length === 0) return null;
    console.log("[Package] Success");
    return data.map((item) => ({
      text: item.text,
      start: item.offset / 1000,
      dur: item.duration / 1000,
    }));
  } catch {
    return null;
  }
}

// =============================================
// XML Parser
// =============================================
function parseTranscriptXml(xml: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  let match;

  // srv3 format
  const srv3Regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  while ((match = srv3Regex.exec(xml)) !== null) {
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) segments.push({ text, start: parseInt(match[1]) / 1000, dur: parseInt(match[2]) / 1000 });
  }
  if (segments.length > 0) return segments;

  // classic format
  const classicRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  while ((match = classicRegex.exec(xml)) !== null) {
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) segments.push({ text, start: parseFloat(match[1]), dur: parseFloat(match[2]) });
  }

  return segments;
}

// =============================================
// MAIN HANDLER
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL. Valid YouTube video link daalein." }, { status: 400 });
    }

    // Try ALL methods one by one
    let captionSegments: CaptionSegment[] | null = null;

    // 1. Invidious (best for cloud servers)
    captionSegments = await fetchViaInvidious(videoId);

    // 2. InnerTube API
    if (!captionSegments || captionSegments.length === 0) {
      captionSegments = await fetchViaInnerTube(videoId);
    }

    // 3. Web page scraping
    if (!captionSegments || captionSegments.length === 0) {
      captionSegments = await fetchViaWebPage(videoId);
    }

    // 4. youtube-transcript package
    if (!captionSegments || captionSegments.length === 0) {
      captionSegments = await fetchViaPackage(videoId);
    }

    if (!captionSegments || captionSegments.length === 0) {
      return NextResponse.json(
        { error: "Is video ka transcript available nahi hai. Yeh ho sakta hai ke video mein subtitles/captions enabled nahi hain. Doosri video try karein." },
        { status: 404 }
      );
    }

    const segments = captionSegments.map((segment) => ({
      text: segment.text,
      timestamp: formatTime(segment.start),
      offset: segment.start * 1000,
      duration: segment.dur * 1000,
    }));

    const fullText = captionSegments.map((s) => s.text).join(" ");

    if (db) {
      try {
        await db.insert(transcripts).values({
          videoId,
          videoUrl: url.trim(),
          transcriptText: fullText,
          originalLang: "en",
        });
      } catch {
        // optional
      }
    }

    return NextResponse.json({
      success: true,
      videoId,
      segments,
      fullText,
      totalSegments: segments.length,
    });
  } catch (error: unknown) {
    console.error("Transcript fetch error:", error);
    return NextResponse.json(
      { error: "Transcript fetch nahi ho saka. Video link check karein aur dubara try karein." },
      { status: 500 }
    );
  }
}
