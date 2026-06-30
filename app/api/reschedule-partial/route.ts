import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { originalTitle, remainingNotes } = await req.json();

    if (!originalTitle || !remainingNotes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const prompt = `
You are an expert productivity assistant. 
The user was working on a task called: "${originalTitle}".
They marked it as partially complete. 
When asked what is LEFT to do, they described: "${remainingNotes}".

Your job is to:
1. Estimate the time required to complete this REMAINING work in minutes (e.g., 30, 45, 60). Be realistic and generous. Minimum is 15 minutes.
2. Generate an optimized title for this new continuation task (e.g., "[Continuation] Original Title: Write Conclusion").

Output ONLY a JSON object matching this schema:
{
  "estimatedMinutes": number,
  "optimizedTitle": string
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse the JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("Failed to parse Gemini output as JSON.");
      }
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error in reschedule-partial API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
