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

// This route now just validates & saves — actual fetching happens client-side
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, segments, fullText } = body;

    if (!url) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
    }

    // If client sent transcript data, save it
    if (segments && fullText && db) {
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

    return NextResponse.json({ success: true, videoId });
  } catch {
    return NextResponse.json({ error: "Request failed." }, { status: 500 });
  }
}
