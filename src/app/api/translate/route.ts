import { NextRequest, NextResponse } from "next/server";
import translate from "@iamtraction/google-translate";

const transliterationMap: Record<string, string> = {
  'ا': 'a', 'آ': 'aa', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't',
  'ث': 's', 'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd',
  'ڈ': 'd', 'ذ': 'z', 'ر': 'r', 'ڑ': 'r', 'ز': 'z', 'ژ': 'zh',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ک': 'k', 'گ': 'g',
  'ل': 'l', 'م': 'm', 'ن': 'n', 'ں': 'n', 'و': 'o', 'ہ': 'h',
  'ھ': 'h', 'ء': '', 'ی': 'i', 'ے': 'e', 'ئ': 'i',
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gya',
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h',
  '्': '', 'ँ': 'n',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function transliterateToRoman(text: string): string {
  let result = '';
  for (const char of text) {
    result += transliterationMap[char] || char;
  }
  return result.replace(/\s+/g, ' ').trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, targetLang } = body;

    if (!text || !targetLang) {
      return NextResponse.json(
        { error: "Text and target language are required" },
        { status: 400 }
      );
    }

    let actualLang = targetLang;
    let needsTransliteration = false;

    if (targetLang === "roman-ur") {
      actualLang = "ur";
      needsTransliteration = true;
    } else if (targetLang === "hinglish") {
      actualLang = "hi";
      needsTransliteration = true;
    }

    const maxChunkSize = 4000;
    const chunks: string[] = [];
    let remaining = text as string;

    while (remaining.length > 0) {
      if (remaining.length <= maxChunkSize) {
        chunks.push(remaining);
        break;
      }
      let splitIndex = remaining.lastIndexOf(" ", maxChunkSize);
      if (splitIndex === -1) splitIndex = maxChunkSize;
      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    const translatedChunks: string[] = [];
    for (const chunk of chunks) {
      const result = await translate(chunk, { to: actualLang });
      translatedChunks.push(result.text);
    }

    let translatedText = translatedChunks.join(" ");

    if (needsTransliteration) {
      translatedText = transliterateToRoman(translatedText);
    }

    return NextResponse.json({
      success: true,
      translatedText,
      detectedLang: "auto",
      targetLang,
    });
  } catch (error: unknown) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed. Please try again." },
      { status: 500 }
    );
  }
}
