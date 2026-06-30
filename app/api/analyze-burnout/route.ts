import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  try {
    const { routines, tasks, dateString } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    let totalWorkMinutes = 0;
    let totalSleepMinutes = 0;

    routines.forEach((r: { title: string; category?: string; startTime: string; endTime: string }) => {
      const [startH, startM] = r.startTime.split(':').map(Number);
      const [endH, endM] = r.endTime.split(':').map(Number);
      let diff = (endH * 60 + endM) - (startH * 60 + startM);
      if (diff < 0) diff += 24 * 60; // Handle overnight routines like sleep

      if (r.category === 'Work' || r.category === 'Study') {
        totalWorkMinutes += diff;
      }
      
      if (r.title.toLowerCase().includes('sleep') || r.category === 'Sleep') {
        totalSleepMinutes += diff;
      }
    });

    tasks.forEach((t: { category?: string; durationHours?: number; priority?: string; status?: string }) => {
      if (t.status === 'Skipped') return; // Ignore skipped tasks

      if (!t.category || t.category === 'Work' || t.category === 'Study') {
        const baseMins = (t.durationHours || 0) * 60;
        let multiplier = 1.0;
        if (t.priority === 'High') multiplier = 1.2;
        if (t.priority === 'Low') multiplier = 0.8;
        
        totalWorkMinutes += baseMins * multiplier;
      }
    });

    // 480 minutes (8 hours) of pure work/study = 100% base burnout risk
    const baseBurnout = (totalWorkMinutes / 480) * 100;
    
    // Sleep Modifier: 8 hours (480 mins) is neutral. 
    // Missing sleep adds burnout (+10% per hour missed). 
    // Extra sleep reduces burnout (-5% per extra hour).
    let sleepModifier = 0;
    if (totalSleepMinutes < 480) {
      sleepModifier = ((480 - totalSleepMinutes) / 60) * 10;
    } else {
      sleepModifier = ((480 - totalSleepMinutes) / 60) * 5;
    }
    
    let calculatedPercentage = Math.round(baseBurnout + sleepModifier);
    // Clamp between 0 and 100
    calculatedPercentage = Math.max(0, Math.min(100, calculatedPercentage));

    const prompt = `You are a productivity and wellness expert.
Analyze the user's schedule for ${dateString}.

Their deterministic Burnout Risk Score is strictly calculated at: ${calculatedPercentage}%.
Here are their fixed routines:
${JSON.stringify(routines, null, 2)}
Here are their scheduled tasks for the day:
${JSON.stringify(tasks, null, 2)}

Instructions:
1. Accept the exact Burnout Risk Score provided above (${calculatedPercentage}%). Do NOT recalculate it.
2. Determine a 'status' string based on this exact percentage (e.g., "Optimal" for <50%, "High Risk" for >80%).
3. Provide a brief 1-2 sentence 'advice' string tailored to their specific schedule (e.g. suggesting a break at a specific time between two dense blocks, or praising a light schedule).
4. Provide a separate 'productivityTip' string (1-2 sentences) offering a practical tip specifically tailored to how dense their schedule is and what tasks they are doing.

Return a JSON object EXACTLY in this format:
{
  "percentage": ${calculatedPercentage},
  "status": "string",
  "advice": "string",
  "productivityTip": "string"
}
DO NOT wrap in markdown backticks.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch (e) {
      console.error("Failed to parse Gemini output:", text, e);
      return NextResponse.json({ error: 'Failed to parse AI output' }, { status: 500 });
    }

  } catch (error: unknown) {
    console.error("Error in analyze-burnout API:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
