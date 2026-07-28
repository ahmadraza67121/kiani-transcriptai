import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
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

    const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptData || transcriptData.length === 0) {
      return NextResponse.json(
        { error: "No transcript/captions found for this video. The video may not have subtitles enabled." },
        { status: 404 }
      );
    }

    const segments = transcriptData.map((segment) => ({
      text: segment.text,
      timestamp: formatTime(segment.offset / 1000),
      offset: segment.offset,
      duration: segment.duration,
    }));

    const fullText = transcriptData.map((s) => s.text).join(" ");

    // Save to database (optional - only if database is connected)
    if (db) {
      try {
        await db.insert(transcripts).values({
          videoId,
          videoUrl: url.trim(),
          transcriptText: fullText,
          originalLang: transcriptData[0]?.lang || "en",
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
    const message = error instanceof Error ? error.message : "Failed to fetch transcript";

    if (message.includes("Too many requests")) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
    if (message.includes("disabled") || message.includes("not available")) {
      return NextResponse.json(
        { error: "Transcript is disabled or not available for this video." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch transcript. Please check the URL and try again." },
      { status: 500 }
    );
  }
}
