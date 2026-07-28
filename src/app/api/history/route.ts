import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcripts } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    if (!db) {
      return NextResponse.json({ success: true, history: [] });
    }

    const history = await db
      .select({
        id: transcripts.id,
        videoId: transcripts.videoId,
        videoUrl: transcripts.videoUrl,
        videoTitle: transcripts.videoTitle,
        originalLang: transcripts.originalLang,
        createdAt: transcripts.createdAt,
      })
      .from(transcripts)
      .orderBy(desc(transcripts.createdAt))
      .limit(20);

    return NextResponse.json({ success: true, history });
  } catch {
    return NextResponse.json({ success: true, history: [] });
  }
}
