import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { provider_token } = await req.json();

    if (!provider_token) {
      return NextResponse.json({ error: 'Missing provider_token' }, { status: 400 });
    }

    // Initialize Supabase client with the user's auth token to enforce RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Get the user ID to associate the routines
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch calendar events from Google API for the next 7 days
    const timeMin = new Date().toISOString();
    const timeMaxDate = new Date();
    timeMaxDate.setDate(timeMaxDate.getDate() + 7);
    const timeMax = timeMaxDate.toISOString();

    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${provider_token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('Google Calendar API Error:', errorText);
      return NextResponse.json({ error: 'Failed to fetch from Google Calendar' }, { status: calendarResponse.status });
    }

    const calendarData = await calendarResponse.json();
    const events = calendarData.items || [];
    let insertedCount = 0;

    // Convert calendar events to routines and save them
    for (const event of events) {
      // Only process events with specific start/end times (skip all-day events for now)
      if (event.start?.dateTime && event.end?.dateTime) {
        const startDate = new Date(event.start.dateTime);
        const endDate = new Date(event.end.dateTime);
        
        const startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
        const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
        
        // Days of week: 0 = Sunday, 1 = Monday, etc.
        const dayOfWeek = startDate.getDay();

        const { error: insertError } = await supabase
          .from('routines')
          .insert({
            user_id: user.id,
            title: `📅 ${event.summary || 'Busy'}`,
            start_time: startTime,
            end_time: endTime,
            days_of_week: [dayOfWeek],
            category: 'Work', // Defaulting to Work for Calendar events
          });

        if (!insertError) {
          insertedCount++;
        } else {
          console.error("Failed to insert routine from event:", insertError);
        }
      }
    }

    return NextResponse.json({ success: true, count: insertedCount });

  } catch (err) {
    console.error('Calendar Sync Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
