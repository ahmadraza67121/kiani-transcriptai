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
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\\n/g, " ")
    .replace(/\n/g, " ");
}

interface CaptionSegment {
  text: string;
  start: number;
  dur: number;
}

// Method 1: InnerTube API (Android client - best for servers)
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
    });

    if (!response.ok) return null;

    const data = await response.json();
    const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captions || captions.length === 0) return null;

    // Prefer English, then first available
    const track =
      captions.find((c: { languageCode: string }) => c.languageCode === "en") ||
      captions.find((c: { languageCode: string }) => c.languageCode?.startsWith("en")) ||
      captions[0];

    const captionUrl = track.baseUrl;
    const captionResponse = await fetch(captionUrl, {
      headers: {
        "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      },
    });

    const xml = await captionResponse.text();
    return parseTranscriptXml(xml);
  } catch (error) {
    console.error("InnerTube method failed:", error);
    return null;
  }
}

// Method 2: Web page scraping
async function fetchViaWebPage(videoId: string): Promise<CaptionSegment[] | null> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const html = await response.text();

    // Extract ytInitialPlayerResponse
    const playerMatch = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script)/
    );
    if (!playerMatch) return null;

    const playerData = JSON.parse(playerMatch[1]);
    const captions =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captions || captions.length === 0) return null;

    const track =
      captions.find((c: { languageCode: string }) => c.languageCode === "en") ||
      captions.find((c: { languageCode: string }) => c.languageCode?.startsWith("en")) ||
      captions[0];

    const captionResponse = await fetch(track.baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const xml = await captionResponse.text();
    return parseTranscriptXml(xml);
  } catch (error) {
    console.error("Web page method failed:", error);
    return null;
  }
}

// Method 3: youtube-transcript package as fallback
async function fetchViaPackage(videoId: string): Promise<CaptionSegment[] | null> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const data = await YoutubeTranscript.fetchTranscript(videoId);
    if (!data || data.length === 0) return null;

    return data.map((item) => ({
      text: item.text,
      start: item.offset / 1000,
      dur: item.duration / 1000,
    }));
  } catch (error) {
    console.error("Package method failed:", error);
    return null;
  }
}

function parseTranscriptXml(xml: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];

  // Try srv3 format: <p t="ms" d="ms">text</p>
  const srv3Regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;

  while ((match = srv3Regex.exec(xml)) !== null) {
    const start = parseInt(match[1]) / 1000;
    const dur = parseInt(match[2]) / 1000;
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) {
      segments.push({ text, start, dur });
    }
  }

  if (segments.length > 0) return segments;

  // Try classic format: <text start="s" dur="s">text</text>
  const classicRegex =
    /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;

  while ((match = classicRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2]);
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, "").trim());
    if (text) {
      segments.push({ text, start, dur });
    }
  }

  return segments;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "YouTube URL is required" },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid YouTube URL. Please enter a valid YouTube video link." },
        { status: 400 }
      );
    }

    // Try multiple methods
    let captionSegments: CaptionSegment[] | null = null;

    // Method 1: InnerTube API (works best on servers)
    captionSegments = await fetchViaInnerTube(videoId);

    // Method 2: Web page scraping
    if (!captionSegments || captionSegments.length === 0) {
      captionSegments = await fetchViaWebPage(videoId);
    }

    // Method 3: youtube-transcript package
    if (!captionSegments || captionSegments.length === 0) {
      captionSegments = await fetchViaPackage(videoId);
    }

    if (!captionSegments || captionSegments.length === 0) {
      return NextResponse.json(
        {
          error:
            "Is video ka transcript available nahi hai. Video mein subtitles/captions enabled nahi hain ya YouTube ne block kar diya hai.",
        },
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

    // Save to database (optional)
    if (db) {
      try {
        await db.insert(transcripts).values({
          videoId,
          videoUrl: url.trim(),
          transcriptText: fullText,
          originalLang: "en",
        });
      } catch {
        console.error("Failed to save transcript to database (optional)");
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
    const message =
      error instanceof Error ? error.message : "Failed to fetch transcript";

    if (message.includes("Too many requests")) {
      return NextResponse.json(
        { error: "Bohat zyada requests ho gayi hain. Thodi der baad try karein." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Transcript fetch nahi ho saka. Video link check karein aur dubara try karein.",
      },
      { status: 500 }
    );
  }
}
