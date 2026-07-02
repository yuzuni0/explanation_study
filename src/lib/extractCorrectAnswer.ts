import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";


//OCRテキストからGemini APIを使って正解（correct_answer）を算出する。
//問題を解いて答えを求める。返り値は算出した正解文字列。算出できなかった場合は空文字を返す。

export async function extractCorrectAnswer(ocrText: string): Promise<string> {
  {/*const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.warn("extractCorrectAnswer: GEMINI_API_KEY is not set");
    return "";
  }*/}

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("extractCorrectAnswer: OPENAI_API_KEY is not set");
    return "";
  }

  if (!ocrText || ocrText.trim().length === 0) {
    return "";
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `以下は問題のOCRテキストです。この問題を解いて正解（答え）を算出してください。

OCRテキスト:
${ocrText}

指示:
- 問題文を読み取り、自分で解いて正解を算出してください。問題文には $ で囲まれた LaTeX 形式の数式が含まれる場合があります。数式に変換し、数式として解釈してください。
- 問題文の中に答え・正解・解答が既に含まれている場合はそれを使ってください。
- 途中式を1行ずつ書きながら、段階的に計算してください。省略せず、各ステップの計算結果を明示してください。
- 答えが数式で表せる場合は、必ず mathjs が解釈できるプレーンな数式で返してください。LaTeX 記法や記号（√, ÷, × など）は使わないでください。
- 答えが文章になる場合（証明・記述・説明問題など）は、簡潔な文章でそのまま返してください。
- LaTeXコマンドは、JSON文字列で正しく解釈されるよう、\を1本だけ使うこと。(LaTeXコマンド例:\div, \sqrt, \times, \pmなど)

数式の形式例 (左の記法ではなく、右の記法で返す):
- √2 や \\sqrt{2} → sqrt(2)
- \\frac{3}{4} → 3/4
- 2³ → 2^3
- 2×x → 2*x
- ÷ → /
- π → pi

その他ルール:
- Pythonコードを実行して計算してください。
- 選択問題の場合は正しい選択肢（例: "ア", "3", "(2)" など）を返してください。
- 問題が読み取れない場合は空文字を返してください。
- 途中式をすべて書き終えたら、最後の行に「答え:」に続けて最終解のみを1つ書いてください。「答え:」の後には計算結果以外の文字（説明、単位、余計な記号）を含めないでください。`;

  try {
    {/*const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });*/}

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: 2000,
    });


    const text = response.choices[0].message.content ?? ""

    const splitText = text.split("答え:");

    return splitText[1]?.trim() || "";
  } catch (error) {
    console.error("extractCorrectAnswer: OpenAI API error", error);
    return "";
  }
}
