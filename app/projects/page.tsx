"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Task, Routine, TaskStatus } from '@/lib/mockData';
import { findAvailableSlots, calculateFreeTimeForDay } from '@/lib/schedulingEngine';

export default function ProjectsAndTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [category, setCategory] = useState('Work');
  const [duration, setDuration] = useState('120');
  const [deadline, setDeadline] = useState(''); // We'll initialize this in useEffect to avoid hydration mismatches
  const [userId, setUserId] = useState<string | null>(null);
  const [burnoutWarning, setBurnoutWarning] = useState<{ suggestedDeadline: string, message: string } | null>(null);

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const [routinesRes, tasksRes] = await Promise.all([
        supabase.from('routines').select('*'),
        supabase.from('tasks').select('*').order('scheduled_start', { ascending: true })
      ]);

      if (routinesRes.error) throw routinesRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const formattedRoutines: Routine[] = routinesRes.data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        startTime: (r.start_time as string).substring(0, 5),
        endTime: (r.end_time as string).substring(0, 5),
        daysOfWeek: r.days_of_week as number[],
      }));
      setRoutines(formattedRoutines);

      const formattedTasks: Task[] = tasksRes.data.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        projectId: 'new-p', // Kept for future project grouping
        title: t.title as string,
        durationHours: t.duration_hours as number,
        scheduledStart: t.scheduled_start as string,
        scheduledEnd: t.scheduled_end as string,
        status: t.status as TaskStatus,
        priority: (t.priority as string) || 'Medium',
        workType: (t.work_type as string) || 'Deep Work',
        category: (t.category as string) || 'Work',
        progressNotes: t.progress_notes as string,
      }));

      setTasks(formattedTasks);
    } catch (err) {
      console.error("Error fetching tasks:", (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);
      setDeadline(new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      fetchTasks();
    }, 0);
  }, []);

  const handleEnqueue = (force = false) => {
    if (!title || !userId) return;
    
    const totalMinutes = parseInt(duration);
    if (isNaN(totalMinutes) || totalMinutes <= 0) return;

    const msPerDay = 1000 * 60 * 60 * 24;
    let daysUntilDeadline = Math.ceil((new Date(deadline).getTime() - new Date().getTime()) / msPerDay);
    if (daysUntilDeadline < 1) daysUntilDeadline = 1;

    // Pre-calculate available free time per day
    const freeTimePerDay = [];
    const tempStart = new Date();
    let totalFreeTime = 0;
    let overloadedDays = 0;
    
    for (let i = 0; i < daysUntilDeadline; i++) {
      const d = new Date(tempStart);
      d.setDate(d.getDate() + i);
      const free = calculateFreeTimeForDay(d, routines, tasks);
      freeTimePerDay.push(free);
      totalFreeTime += free;
      
      if (totalMinutes > free * 0.9) {
        overloadedDays++;
      }
    }

    // Pre-flight burnout check
    if (!force && overloadedDays > 0) {
      const avgFreeTime = totalFreeTime / daysUntilDeadline;
      const safeDaily = Math.max(15, avgFreeTime * 0.9);
      const totalWork = totalMinutes * daysUntilDeadline;
      const requiredDays = Math.ceil(totalWork / safeDaily);
      
      if (requiredDays > daysUntilDeadline) {
        const suggested = new Date();
        suggested.setDate(suggested.getDate() + requiredDays);
        suggested.setHours(12, 0, 0, 0);
        
        setBurnoutWarning({
          suggestedDeadline: new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
          message: `Burnout Risk! You only have an average of ${Math.round(avgFreeTime)} free minutes/day. Committing to ${totalMinutes} mins will crush your schedule.`
        });
        return; 
      }
    }

    executeEnqueue(totalMinutes, daysUntilDeadline, freeTimePerDay);
  };

  const executeEnqueue = async (totalMinutes: number, daysUntilDeadline: number, freeTimePerDay: number[]) => {
    setIsAnalyzing(true);
    setBurnoutWarning(null);
    try {

      // 1. Call our new AI split-task endpoint
      const res = await fetch('/api/split-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title, 
          description,
          dailyDuration: totalMinutes, 
          days: daysUntilDeadline,
          freeTimePerDay 
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to split task via AI');
      }

      const { subtasks } = await res.json();

      // 2. Schedule the subtasks across multiple days to prevent burnout
      // We will start looking for slots from 2 hours from now
      let baseStart = new Date();
      baseStart.setTime(baseStart.getTime() + 2 * 60 * 60 * 1000); 
      
      const currentTasks = [...tasks];

      for (let i = 0; i < subtasks.length; i++) {
        const chunk = subtasks[i];
        
        // Find an exact free gap for this chunk using our smart engine
        const slot = findAvailableSlots(chunk.duration, routines, currentTasks, baseStart);

        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            user_id: userId,
            title: chunk.title,
            duration_hours: chunk.duration / 60,
            scheduled_start: slot.start.toISOString(),
            scheduled_end: slot.end.toISOString(),
            status: 'Pending',
            priority: priority,
            work_type: chunk.workType || 'Deep Work',
            category: category,
          });

        if (taskError) throw taskError;

        // Add to local tasks list so the next chunk doesn't overlap it
        currentTasks.push({
          id: 'temp-' + i,
          projectId: 'new-p',
          title: chunk.title,
          durationHours: chunk.duration / 60,
          scheduledStart: slot.start.toISOString(),
          scheduledEnd: slot.end.toISOString(),
          status: 'Pending',
          priority: priority,
          workType: chunk.workType || 'Deep Work',
          category: category,
        });

        // Advance baseStart to the NEXT day to distribute the workload uniformly
        baseStart = new Date(slot.start);
        baseStart.setDate(baseStart.getDate() + 1);
        baseStart.setHours(9, 0, 0, 0); // Try to start at 9am next day
      }
      
      setTitle('');
      setDescription('');
      fetchTasks();
    } catch (err) {
      alert(`Error saving task: ${(err as Error).message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      fetchTasks();
    } catch (err) {
      alert(`Error deleting task: ${(err as Error).message}`);
    }
  };

  return (
    <div className="projects-grid">
      
      {/* Form Section */}
      <div className="card" style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <span style={{ color: 'var(--accent-blue)', fontSize: '20px' }}>+</span> Initialize Project / Task
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', letterSpacing: '0.5px', marginBottom: '8px' }}>
              TASK/PROJECT TITLE
            </label>
            <input 
              type="text" 
              placeholder="e.g. Build API prototype, Study for Midterm" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '14px', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', letterSpacing: '0.5px', marginBottom: '8px' }}>
              TASK DESCRIPTION (OPTIONAL)
            </label>
            <textarea 
              placeholder="Provide extra context so the AI can break this down more intelligently..." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '14px', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          </div>

          <div className="responsive-form-grid">
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                CATEGORY
              </label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '14px', color: 'var(--text-primary)', backgroundColor: 'white' }}
              >
                <option value="Work">Work</option>
                <option value="Study">Study</option>
                <option value="Personal">Personal</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                PRIORITY
              </label>
              <select 
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '14px', color: 'var(--text-primary)', backgroundColor: 'white' }}
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                DAILY COMMITMENT (MINUTES)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>🕒</span>
                <input 
                  type="number" 
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '14px' }}
                />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-sidebar)', marginTop: '6px' }}>AI splits long tasks automatically</p>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                HARD DEADLINE
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>📅</span>
                <input 
                  type="datetime-local" 
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '14px' }}
                />
              </div>
            </div>
          </div>
          
          {burnoutWarning && (
            <div style={{ padding: '16px', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', marginTop: '8px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#9f1239', fontWeight: 600 }}>
                ⚠️ {burnoutWarning.message}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => {
                    setDeadline(burnoutWarning.suggestedDeadline);
                    setBurnoutWarning(null);
                  }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#e11d48', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Extend Deadline
                </button>
                <button 
                  onClick={() => handleEnqueue(true)}
                  style={{ flex: 1, padding: '10px', backgroundColor: 'transparent', color: '#9f1239', border: '1px solid #fecdd3', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Force Schedule Anyway
                </button>
              </div>
            </div>
          )}

          <button 
            onClick={() => handleEnqueue(false)}
            disabled={!title || isAnalyzing}
            style={{ width: '100%', backgroundColor: (title && !isAnalyzing) ? 'var(--bg-sidebar)' : '#cbd5e1', color: 'white', padding: '16px', borderRadius: 'var(--border-radius-sm)', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: (title && !isAnalyzing) ? 'pointer' : 'not-allowed' }}
          >
            <span style={{ fontSize: '18px', fontWeight: 'normal' }}>{isAnalyzing ? '✨' : '+'}</span> 
            {isAnalyzing ? 'AI is breaking down your task...' : 'Enqueue Project Task'}
          </button>
        </div>
      </div>

      {/* List Section */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <span style={{ color: 'var(--accent-blue)' }}>📈</span> Current Workload Priority
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLoading ? (
             <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading tasks...</div>
          ) : tasks.length === 0 ? (
             <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)' }}>No active tasks. Add one to get started!</div>
          ) : tasks.map((task) => (
            <div key={task.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: task.status === 'Skipped' ? 'var(--text-secondary)' : 'var(--text-sidebar-heading)', textDecoration: task.status === 'Skipped' ? 'line-through' : 'none' }}>
                    {task.title} <span style={{ color: '#cbd5e1' }}>🔧</span>
                  </h4>
                  <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: task.status === 'Done' ? '#dcfce7' : task.status === 'Partial' ? '#fef3c7' : task.status === 'Skipped' ? '#f1f5f9' : '#e0e7ff', color: task.status === 'Done' ? '#166534' : task.status === 'Partial' ? '#b45309' : task.status === 'Skipped' ? '#64748b' : '#3730a3', padding: '4px 10px', borderRadius: '12px' }}>
                    {task.status === 'Done' ? 'Completed' : task.status === 'Partial' ? 'Partially Completed' : task.status === 'Skipped' ? 'Skipped' : 'Pending'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', color: 'var(--text-sidebar)', fontSize: '13px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    🕒 {Math.round(task.durationHours * 60)} mins total
                  </span>
                  <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    📅 Deadline: {new Date(task.scheduledEnd).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', opacity: task.status === 'Skipped' ? 0.5 : 1 }}>
                  {task.priority && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', backgroundColor: task.priority === 'High' ? '#fee2e2' : task.priority === 'Medium' ? '#fef3c7' : '#e0e7ff', color: task.priority === 'High' ? '#b91c1c' : task.priority === 'Medium' ? '#b45309' : '#4338ca' }}>
                      {task.priority} Priority
                    </span>
                  )}
                  {task.workType && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', backgroundColor: '#f1f5f9', color: 'var(--text-secondary)' }}>
                      {task.workType}
                    </span>
                  )}
                </div>
                
                {task.progressNotes && (
                  <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: '8px', fontSize: '13px', color: '#92400e', borderLeft: '3px solid #f59e0b' }}>
                    <strong>Progress Notes:</strong> {task.progressNotes}
                  </div>
                )}
              </div>
              <button 
                onClick={() => handleDelete(task.id)}
                style={{ backgroundColor: 'transparent', color: '#b91c1c', fontSize: '18px', padding: '4px', cursor: 'pointer', border: 'none' }}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
}
