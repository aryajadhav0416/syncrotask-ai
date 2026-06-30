export type TaskStatus = 'Pending' | 'Done' | 'Partial' | 'Skipped';

export interface Routine {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, etc.
  category?: string;
}

export interface Project {
  id: string;
  title: string;
  deadline: string; // ISO Date string
  durationHours: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  durationHours: number;
  scheduledStart: string; // ISO Date string
  scheduledEnd: string; // ISO Date string
  status: TaskStatus;
  priority?: string;
  workType?: string;
  category?: string;
  progressNotes?: string;
}

export const mockRoutines: Routine[] = [
  {
    id: 'r1',
    title: 'Sleep',
    startTime: '23:00',
    endTime: '07:00',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: 'r2',
    title: 'Office Hours',
    startTime: '09:00',
    endTime: '17:00',
    daysOfWeek: [1, 2, 3, 4, 5],
  }
];

export const mockProjects: Project[] = [
  {
    id: 'p1',
    title: 'Q3 Marketing Report',
    deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
    durationHours: 4,
  }
];

export const mockTasks: Task[] = [
  {
    id: 't1',
    projectId: 'p1',
    title: 'Data Collection & Analysis',
    durationHours: 2,
    scheduledStart: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(), // Today 6 PM
    scheduledEnd: new Date(new Date().setHours(20, 0, 0, 0)).toISOString(),
    status: 'Pending',
  },
  {
    id: 't2',
    projectId: 'p1',
    title: 'Draft Report',
    durationHours: 2,
    scheduledStart: new Date(new Date().setHours(20, 30, 0, 0)).toISOString(), // Today 8:30 PM
    scheduledEnd: new Date(new Date().setHours(22, 30, 0, 0)).toISOString(),
    status: 'Pending',
  }
];
