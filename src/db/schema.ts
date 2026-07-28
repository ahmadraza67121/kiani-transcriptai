import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const transcripts = pgTable("transcripts", {
  id: serial("id").primaryKey(),
  videoId: varchar("video_id", { length: 50 }).notNull(),
  videoUrl: text("video_url").notNull(),
  videoTitle: text("video_title"),
  originalLang: varchar("original_lang", { length: 10 }).default("en"),
  transcriptText: text("transcript_text").notNull(),
  translatedText: text("translated_text"),
  translatedLang: varchar("translated_lang", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
