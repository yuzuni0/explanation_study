import { GoogleGenAI } from "@google/genai";


//OCRテキストからGemini APIを使って正解（correct_answer）を算出する。
//問題を解いて答えを求める。返り値は算出した正解文字列。算出できなかった場合は空文字を返す。

export async function extractCorrectAnswer(ocrText: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.warn("extractCorrectAnswer: GEMINI_API_KEY is not set");
    return "";
  }

  if (!ocrText || ocrText.trim().length === 0) {
    return "";
  }

  const genai = new GoogleGenAI({ apiKey });

  const prompt = `以下は問題のOCRテキストです。この問題を解いて正解（答え）を算出してください。

OCRテキスト:
${ocrText}

指示:
- 問題文を読み取り、自分で解いて正解を算出してください。
- 問題文の中に答え・正解・解答が既に含まれている場合はそれを使ってください。
- 選択問題の場合は正しい選択肢（例: "ア", "3", "(2)"など）を返してください。
- 計算問題の場合は実際に計算して結果の数値や式を返してください。
- 証明問題や記述問題の場合は簡潔な模範解答を返してください。
- 問題が読み取れない場合は空文字を返してください。
- 余計な説明や途中式は不要です。最終的な答えだけを返してください。
- 出力形式: 答えの文字列のみ（改行やJSON不要）`;

  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const text =
      (response as unknown as { text?: string }).text ??
      (response as unknown as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      }).candidates?.[0]?.content?.parts?.[0]?.text ??
      "";

    return text.trim();
  } catch (error) {
    console.error("extractCorrectAnswer: Gemini API error", error);
    return "";
  }
}
