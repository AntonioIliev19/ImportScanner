import { ContentUnion, GoogleGenAI } from "@google/genai";
import { DependencyJSON } from "../models/DependencyJSON";

export async function analyzeWithGemini(
  depJson: DependencyJSON,
  model = "gemini-2.5-flash",
  maxOutPutTokens?: number,
) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = {
    role: "system",
    parts: [
      {
        text: `You are a Senior Software Engineer.
Return ONLY a single Markdown document (headings, lists, code fences). 
Do NOT include JSON anywhere in the reply.
Internally derive any structure you need but emit Markdown only.
Focus on: Dependency Complexity, Tightly Coupled Modules, Circular Dependencies, Refactoring Recommendations.`,
      },
    ],
  } as ContentUnion;

  const response = await ai.models.generateContent({
    model,
    contents: [
      { role: "user", parts: [{ text: "Analyze this dependency graph: " }] },
      { role: "user", parts: [{ text: JSON.stringify(depJson) }] },
    ],
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "text/plain",
      maxOutputTokens: maxOutPutTokens,
      temperature: 0.2,
      topP: 0.9,
    },
  });

  const text = response.text ?? "";
  if (!text) throw new Error("Empty Gemini response");

  return text;
}
