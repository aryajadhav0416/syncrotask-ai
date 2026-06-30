import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  try {
    const { title, description, dailyDuration, days, freeTimePerDay } = await req.json();

    if (!title || !dailyDuration || !days || !freeTimePerDay) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY environment variable. Please add it to .env.local' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // We use gemini-2.5-flash for the fastest reasoning capability
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const prompt = `You are an expert productivity assistant.
The user wants to complete a project or task titled "${title}".
${description ? `Here is the user's detailed description of the task: "${description}"` : ''}
They have a deadline ${days} days from now. 
Their baseline daily time commitment for this project is ${dailyDuration} minutes.

However, we want you to adapt to their actual free time. Here is the exact number of free minutes they have available on each of the next ${days} days:
${freeTimePerDay.map((mins: number, i: number) => `Day ${i + 1}: ${mins} free minutes`).join('\n')}

CRITICAL INSTRUCTIONS:
1. Break this project down into exactly ${days} sequential daily sub-tasks (one per day).
2. Each sub-task should have a specific 'title' and a 'duration' in minutes. Make the title descriptive and actionable, based on the task description if provided.
3. For the duration, aim around the baseline of ${dailyDuration} minutes, BUT intelligently scale it up or down based on that day's available free time. If they have very little free time on a day, reduce the duration for that day. If they have a lot, you can increase it slightly.
4. NEVER exceed the free minutes available on that day.
5. Consider the nature of the task (deep vs shallow work) when naming and sizing the chunks.
6. Assign a 'workType' string (Deep Work, Admin, Learning, Creative, or Physical).

Return a valid JSON array of objects, where each object has 'title' (string), 'duration' (number), and 'workType' (string) keys. DO NOT wrap in markdown or backticks.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    let subtasks = [];
    try {
      subtasks = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse Gemini response:", text, e);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    // Validate that the AI didn't hallucinate invalid data
    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      throw new Error("AI returned invalid format");
    }

    return NextResponse.json({ subtasks });
  } catch (error: unknown) {
    console.error("Error in split-task API:", error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
