import { NextRequest, NextResponse } from "next/server";
import translate from "@iamtraction/google-translate";

const REWRITE_STYLES = {
  professional: {
    name: "Professional",
    intermediateLanguages: ["de", "fr"],
  },
  casual: {
    name: "Casual/Friendly",
    intermediateLanguages: ["es", "it"],
  },
  simple: {
    name: "Simple/Easy",
    intermediateLanguages: ["nl", "pt"],
  },
  creative: {
    name: "Creative",
    intermediateLanguages: ["ja", "ko"],
  },
  concise: {
    name: "Concise/Short",
    intermediateLanguages: ["ru", "pl"],
  },
};

type StyleKey = keyof typeof REWRITE_STYLES;

async function rewriteViaTranslation(
  text: string,
  targetLang: string,
  style: StyleKey
): Promise<string> {
  const styleConfig = REWRITE_STYLES[style] || REWRITE_STYLES.professional;
  const [intermediateLang1, intermediateLang2] = styleConfig.intermediateLanguages;

  const maxChunkSize = 3000;
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining);
      break;
    }
    let splitIndex = remaining.lastIndexOf(". ", maxChunkSize);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf(" ", maxChunkSize);
    if (splitIndex === -1) splitIndex = maxChunkSize;
    chunks.push(remaining.substring(0, splitIndex + 1));
    remaining = remaining.substring(splitIndex + 1).trim();
  }

  const rewrittenChunks: string[] = [];

  for (const chunk of chunks) {
    try {
      const step1 = await translate(chunk, { to: intermediateLang1 });
      const step2 = await translate(step1.text, { to: intermediateLang2 });
      const step3 = await translate(step2.text, { to: targetLang });
      rewrittenChunks.push(step3.text);
    } catch (error) {
      console.error("Rewrite chunk error:", error);
      rewrittenChunks.push(chunk);
    }
  }

  return rewrittenChunks.join(" ");
}

async function rewriteViaAI(
  text: string,
  style: StyleKey,
  targetLang: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const styleNames: Record<StyleKey, string> = {
    professional: "formal business style",
    casual: "casual friendly conversational",
    simple: "simple easy to understand",
    creative: "creative engaging storytelling",
    concise: "brief concise summarized",
  };

  const languageNames: Record<string, string> = {
    en: "English", ur: "Urdu", hi: "Hindi", ar: "Arabic",
    es: "Spanish", fr: "French", de: "German", zh: "Chinese",
    ja: "Japanese", ko: "Korean", pt: "Portuguese", ru: "Russian",
    tr: "Turkish", it: "Italian", "roman-ur": "Roman Urdu", hinglish: "Hinglish",
  };

  const langName = languageNames[targetLang] || targetLang;
  const styleName = styleNames[style] || "professional";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional content rewriter. Rewrite the given text in a ${styleName} tone. Keep the same meaning but use different words and sentence structures. Output must be in ${langName} language. Do not add any explanations, just output the rewritten text.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, style = "professional", targetLang = "en" } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Text is required for rewriting" },
        { status: 400 }
      );
    }

    const validStyle = (Object.keys(REWRITE_STYLES).includes(style) ? style : "professional") as StyleKey;

    let rewrittenText = await rewriteViaAI(text, validStyle, targetLang);
    let method = "ai";

    if (!rewrittenText) {
      rewrittenText = await rewriteViaTranslation(text, targetLang, validStyle);
      method = "translation";
    }

    return NextResponse.json({
      success: true,
      rewrittenText,
      style: validStyle,
      method,
    });
  } catch (error: unknown) {
    console.error("Rewrite error:", error);
    return NextResponse.json(
      { error: "Rewriting failed. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const styles = Object.entries(REWRITE_STYLES).map(([key, value]) => ({
    code: key,
    name: value.name,
  }));
  return NextResponse.json({ styles });
}
