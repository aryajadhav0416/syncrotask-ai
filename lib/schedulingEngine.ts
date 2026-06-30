import { Routine, Task } from './mockData';

export function findAvailableSlots(
  durationMinutes: number,
  routines: Routine[],
  existingTasks: Task[],
  startDate: Date
): { start: Date; end: Date } {
  let currentTime = new Date(startDate);
  
  // Ensure we start rounded up to the nearest 15 mins for neatness
  const remainder = 15 - (currentTime.getMinutes() % 15);
  currentTime.setMinutes(currentTime.getMinutes() + remainder, 0, 0);

  const durationMs = durationMinutes * 60000;

  // We loop until we find a gap large enough.
  // To avoid infinite loops in edge cases, we cap at trying for 30 days ahead.
  const maxSearchDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  while (currentTime < maxSearchDate) {
    const proposedStart = new Date(currentTime);
    const proposedEnd = new Date(proposedStart.getTime() + durationMs);

    const overlapEnd = getOverlap(proposedStart, proposedEnd, routines, existingTasks);

    if (!overlapEnd) {
      // Found a gap!
      return { start: proposedStart, end: proposedEnd };
    }

    // Overlap found. Move currentTime to the end of the overlapping block, plus a 15 min buffer.
    currentTime = new Date(overlapEnd.getTime() + 15 * 60000);
  }

  // Fallback if schedule is completely full for 30 days (extremely unlikely)
  const fallbackStart = new Date(startDate);
  fallbackStart.setHours(fallbackStart.getHours() + 2);
  return {
    start: fallbackStart,
    end: new Date(fallbackStart.getTime() + durationMs)
  };
}

export function calculateFreeTimeForDay(date: Date, routines: Routine[], existingTasks: Task[]): number {
  let freeMinutes = 0;
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  // Step through the day in 15-minute intervals to sum up true free time
  for (let i = 0; i < 24 * 60; i += 15) {
    const slotStart = new Date(startOfDay.getTime() + i * 60000);
    const slotEnd = new Date(slotStart.getTime() + 15 * 60000);
    
    const overlap = getOverlap(slotStart, slotEnd, routines, existingTasks);
    if (!overlap) {
      freeMinutes += 15;
    }
  }
  
  return freeMinutes;
}

// Returns the Date when the overlapping block ENDS, or null if no overlap
function getOverlap(start: Date, end: Date, routines: Routine[], existingTasks: Task[]): Date | null {
  // Check existing tasks
  for (const t of existingTasks) {
    const tStart = new Date(t.scheduledStart);
    const tEnd = new Date(t.scheduledEnd);
    
    // Overlap check
    if (Math.max(start.getTime(), tStart.getTime()) < Math.min(end.getTime(), tEnd.getTime())) {
      return tEnd; // Overlaps! Return when this task ends.
    }
  }

  // Check routines (e.g. College, Sleep)
  for (const r of routines) {
    const proposedDay = start.getDay();
    const prevDay = proposedDay === 0 ? 6 : proposedDay - 1;

    const rRanges = [];

    // Case 1: Routine started TODAY
    if (r.daysOfWeek.includes(proposedDay)) {
      const { rStart, rEnd } = getAbsoluteRoutineTimes(start, r.startTime, r.endTime, 0);
      rRanges.push({ rStart, rEnd });
    }
    
    // Case 2: Routine started YESTERDAY (and might carry over into today, e.g. Sleep 23:00 -> 07:00)
    if (r.daysOfWeek.includes(prevDay)) {
      const { rStart, rEnd } = getAbsoluteRoutineTimes(start, r.startTime, r.endTime, -1);
      rRanges.push({ rStart, rEnd });
    }

    for (const range of rRanges) {
      if (Math.max(start.getTime(), range.rStart.getTime()) < Math.min(end.getTime(), range.rEnd.getTime())) {
        return range.rEnd;
      }
    }
  }

  return null;
}

function getAbsoluteRoutineTimes(baseDate: Date, timeStrStart: string, timeStrEnd: string, dayOffset: number) {
  const [sHours, sMins] = timeStrStart.split(':').map(Number);
  const [eHours, eMins] = timeStrEnd.split(':').map(Number);

  const rStart = new Date(baseDate);
  rStart.setDate(rStart.getDate() + dayOffset);
  rStart.setHours(sHours, sMins, 0, 0);

  const rEnd = new Date(rStart);
  rEnd.setHours(eHours, eMins, 0, 0);

  // If end time is earlier than start time (e.g. 23:00 to 07:00), it spans into the next day
  if (rEnd.getTime() <= rStart.getTime()) {
    rEnd.setDate(rEnd.getDate() + 1);
  }

  return { rStart, rEnd };
}
