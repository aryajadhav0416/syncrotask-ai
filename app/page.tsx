"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Task, Routine } from '@/lib/mockData';
import { findAvailableSlots } from '@/lib/schedulingEngine';

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState('');

  const [burnoutStats, setBurnoutStats] = useState<{ percentage: number; status: string; advice: string; productivityTip?: string } | null>(null);
  const [isAnalyzingBurnout, setIsAnalyzingBurnout] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date());

  // Task Status Update State
  const [activeStatusTask, setActiveStatusTask] = useState<string | null>(null);
  const [statusFormValue, setStatusFormValue] = useState<'Done' | 'Partial' | 'Skipped'>('Done');
  const [progressNotes, setProgressNotes] = useState('');
  const [remainingNotes, setRemainingNotes] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  
  // Generate next 7 days starting from today
  const [weekDays] = useState(() => {
    const today = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  });

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [routinesRes, tasksRes] = await Promise.all([
        supabase.from('routines').select('*').order('start_time', { ascending: true }),
        supabase.from('tasks').select('*').order('scheduled_start', { ascending: true })
      ]);

      if (routinesRes.error) throw routinesRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const formattedRoutines = routinesRes.data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        startTime: (r.start_time as string).substring(0, 5),
        endTime: (r.end_time as string).substring(0, 5),
        daysOfWeek: r.days_of_week as number[],
        category: r.category as string,
      }));

      const formattedTasks = tasksRes.data.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        projectId: t.project_id as string,
        title: t.title as string,
        durationHours: t.duration_hours as number,
        scheduledStart: t.scheduled_start as string,
        scheduledEnd: t.scheduled_end as string,
        status: t.status as 'Pending' | 'Done',
        priority: t.priority as string,
        workType: t.work_type as string,
        category: t.category as string,
        progressNotes: t.progress_notes as string,
      }));

      setRoutines(formattedRoutines);
      setTasks(formattedTasks);
    } catch (err) {
      console.error("Error fetching dashboard data:", (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => fetchData(), 0);
  }, []);

  useEffect(() => {
    const analyzeBurnout = async () => {
      // Don't analyze if we haven't loaded base data yet
      if (isLoading) return;
      
      const dayOfWeek = selectedDate.getDay();
      const currentRoutines = routines.filter(r => r.daysOfWeek.includes(dayOfWeek));
      const currentTasks = tasks.filter(t => new Date(t.scheduledStart).toDateString() === selectedDate.toDateString());

      if (currentRoutines.length === 0 && currentTasks.length === 0) {
        setBurnoutStats({ percentage: 0, status: "Rest Day", advice: "You have no scheduled tasks or routines today. Take it easy!", productivityTip: "Use this rest day to disconnect entirely. Active rest is just as important as active work." });
        return;
      }

      setIsAnalyzingBurnout(true);
      try {
        const res = await fetch('/api/analyze-burnout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routines: currentRoutines,
            tasks: currentTasks,
            dateString: selectedDate.toDateString()
          })
        });
        if (res.ok) {
          const data = await res.json();
          setBurnoutStats(data);
        }
      } catch (err) {
        console.error("Burnout analysis failed", err);
      } finally {
        setIsAnalyzingBurnout(false);
      }
    };

    // Debounce the analysis slightly to avoid double-fetching during fast clicks
    const timeoutId = setTimeout(analyzeBurnout, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedDate, routines, tasks, isLoading]);

  const handleEmergencyOverride = async () => {
    setIsRecalculating(true);
    try {
      const pendingTasks = tasks.filter(t => t.status === 'Pending');
      // Sort pending tasks by their old start date to preserve relative priority
      pendingTasks.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
      
      const existingTasks = tasks.filter(t => t.status === 'Done' || t.status === 'Partial');
      
      for (const t of pendingTasks) {
        const durationMins = Math.round(t.durationHours * 60);
        
        // If the task was scheduled in the past, we search starting from NOW.
        // If it was scheduled for tomorrow, we keep it starting from tomorrow so we don't clump tasks!
        const origStart = new Date(t.scheduledStart);
        const searchStart = origStart < new Date() ? new Date() : origStart;
        
        const slot = findAvailableSlots(durationMins, routines, existingTasks, searchStart);
        
        await supabase
          .from('tasks')
          .update({ 
            scheduled_start: slot.start.toISOString(), 
            scheduled_end: slot.end.toISOString() 
          })
          .eq('id', t.id);
          
        // Add it to existingTasks so the engine flows around it for the next task
        existingTasks.push({
          ...t,
          scheduledStart: slot.start.toISOString(),
          scheduledEnd: slot.end.toISOString()
        });
      }

      await fetchData();
      setRecalcMessage("I have completely rebuilt your schedule. Overdue tasks have been elegantly packed into your next available free time blocks, respecting your fixed routines!");
    } catch (err) {
      console.error("Error recalculating:", (err as Error).message);
    } finally {
      setIsRecalculating(false);
    }
  };

  const updateTaskStatus = async (task: Task) => {
    setIsRescheduling(true);
    try {
      const payload: Record<string, string> = { status: statusFormValue };
      if (statusFormValue === 'Partial' && progressNotes) {
        payload.progress_notes = progressNotes;
      }
      
      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.id);

      if (error) throw error;

      // If skipped, reschedule the entire task starting from now
      if (statusFormValue === 'Skipped') {
        const searchStart = new Date();
        const slot = findAvailableSlots(task.durationHours * 60, routines, tasks, searchStart);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: insertErr } = await supabase.from('tasks').insert({
            user_id: user.id,
            project_id: task.projectId,
            title: task.title,
            duration_hours: task.durationHours,
            scheduled_start: slot.start.toISOString(),
            scheduled_end: slot.end.toISOString(),
            status: 'Pending',
            priority: task.priority || 'Medium',
            work_type: task.workType || 'Deep Work',
          });
          if (insertErr) throw insertErr;
        }
      }
      
      // If partial and remaining work is described, call AI to reschedule remainder
      if (statusFormValue === 'Partial' && remainingNotes) {
        const res = await fetch('/api/reschedule-partial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            originalTitle: task.title, 
            remainingNotes 
          })
        });

        if (res.ok) {
          const { estimatedMinutes, optimizedTitle } = await res.json();
          
          // Search for a slot starting from NOW so it gets distributed into current work
          const searchStart = new Date();
          const slot = findAvailableSlots(estimatedMinutes, routines, tasks, searchStart);
          
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            const { error: insertErr } = await supabase.from('tasks').insert({
              user_id: user.id,
              project_id: task.projectId,
              title: optimizedTitle,
              duration_hours: estimatedMinutes / 60,
              scheduled_start: slot.start.toISOString(),
              scheduled_end: slot.end.toISOString(),
              status: 'Pending',
              priority: task.priority || 'Medium',
              work_type: task.workType || 'Deep Work',
            });
            if (insertErr) throw insertErr;
          }
        }
      }

      setActiveStatusTask(null);
      setProgressNotes('');
      setRemainingNotes('');
      fetchData();
    } catch (err) {
      alert(`Error updating status: ${(err as Error).message}`);
    } finally {
      setIsRescheduling(false);
    }
  };

  const selectedDayOfWeek = selectedDate.getDay(); // 0 is Sunday
  
  const filteredRoutines = routines.filter(r => r.daysOfWeek.includes(selectedDayOfWeek));
  
  const filteredTasks = tasks.filter(t => {
    const taskDate = new Date(t.scheduledStart);
    return taskDate.toDateString() === selectedDate.toDateString();
  });

  const formattedSelectedDateTitle = selectedDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const timelineItems = [
    ...filteredRoutines.map(r => ({ type: 'routine', data: r, startSort: parseInt(r.startTime.replace(':', '')) })),
    ...filteredTasks.map(t => {
      const d = new Date(t.scheduledStart);
      return { type: 'task', data: t, startSort: d.getHours() * 100 + d.getMinutes() };
    })
  ].sort((a, b) => a.startSort - b.startSort);

  const playBriefing = () => {
    const saved = localStorage.getItem('syncrotask_voice_prefs');
    let prefs = { selectedVoiceName: '', volume: 80, speed: 1, pitch: 1 };
    if (saved) { try { prefs = { ...prefs, ...JSON.parse(saved) }; } catch {} }

    const pendingCount = filteredTasks.filter(t => t.status === 'Pending').length;
    const utterance = new SpeechSynthesisUtterance(`Good morning! You have ${pendingCount} pending tasks scheduled for today. Let's get to work!`);
    
    const availableVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    if (prefs.selectedVoiceName && availableVoices.length > 0) {
      const v = availableVoices.find(v => v.name === prefs.selectedVoiceName);
      if (v) utterance.voice = v;
    } else if (availableVoices.length > 0) {
      utterance.voice = availableVoices[0];
    }
    utterance.volume = prefs.volume / 100;
    utterance.rate = prefs.speed;
    utterance.pitch = prefs.pitch;
    window.speechSynthesis.speak(utterance);
  };

  const overdueTasks = tasks.filter(t => {
    const taskEnd = new Date(t.scheduledEnd);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return t.status === 'Pending' && taskEnd < startOfToday;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* Briefing Banner */}
      <div className="briefing-banner">
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: recalcMessage ? 'flex-start' : 'center' }}>
          <div style={{ width: '48px', height: '48px', backgroundColor: '#1f2937', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
            ✨
          </div>
          <div>
            {!recalcMessage && (
              <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '8px' }}>
                DYNAMIC ASSISTANT BRIEFING
              </h3>
            )}
            <p style={{ fontSize: '15px', color: '#cbd5e1', lineHeight: '1.6', margin: 0, maxWidth: '600px' }}>
              {recalcMessage || "Ready to maximize your week! Sign in with your Google Calendar to sync real-time commitments, or click 'Recalculate with AI' to re-balance tasks perfectly around your routines."}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn" onClick={playBriefing} style={{ flexShrink: 0, backgroundColor: 'white', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            ▶️ Play Briefing
          </button>
          <button className="btn btn-primary" onClick={handleEmergencyOverride} disabled={isRecalculating} style={{ flexShrink: 0 }}>
            {isRecalculating ? "🔄 Rebalancing..." : "🔄 Recalculate with AI"}
          </button>
        </div>
      </div>

      {/* Overdue Action Center */}
      {overdueTasks.length > 0 && (
        <div style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ fontSize: '20px' }}>⚠️</div>
              <div>
                <h4 style={{ margin: 0, color: '#be123c', fontSize: '15px', fontWeight: 600 }}>{overdueTasks.length} Overdue Tasks Need Attention</h4>
                <p style={{ margin: 0, color: '#9f1239', fontSize: '13px' }}>You have tasks from past days still marked as Pending.</p>
              </div>
            </div>
            <button 
              onClick={() => setShowOverdue(!showOverdue)}
              style={{ padding: '8px 16px', backgroundColor: '#e11d48', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
            >
              {showOverdue ? 'Hide' : 'Review & Update'}
            </button>
          </div>
          
          {showOverdue && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              {overdueTasks.map(task => {
                const startDate = new Date(task.scheduledStart);
                const endDate = new Date(task.scheduledEnd);
                const timeString = `${startDate.toLocaleDateString()} ${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')} - ${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
                
                return (
                  <div key={`overdue-${task.id}`} style={{ backgroundColor: 'white', border: '1px solid #fecdd3', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--bg-sidebar)', marginBottom: '4px' }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          🕒 Originally scheduled: {timeString}
                        </div>
                      </div>
                      {activeStatusTask !== task.id && (
                        <button 
                          style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                          onClick={() => {
                            setActiveStatusTask(task.id);
                            setStatusFormValue('Done');
                          }}
                        >
                          Update Status
                        </button>
                      )}
                    </div>

                    {activeStatusTask === task.id && (
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed var(--border-color)', marginTop: '16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input type="radio" name="status" value="Done" checked={statusFormValue === 'Done'} onChange={() => setStatusFormValue('Done')} />
                            ✅ Fully Completed
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input type="radio" name="status" value="Partial" checked={statusFormValue === 'Partial'} onChange={() => setStatusFormValue('Partial')} />
                            ⏳ Partially Completed
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input type="radio" name="status" value="Skipped" checked={statusFormValue === 'Skipped'} onChange={() => setStatusFormValue('Skipped')} />
                            ❌ Skipped / Not Done
                          </label>
                        </div>
                        
                        {statusFormValue === 'Partial' && (
                          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '4px' }}>What was accomplished?</label>
                              <textarea value={progressNotes} onChange={(e) => setProgressNotes(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px' }} rows={2} />
                            </div>
                            <div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '4px' }}>✨ What is left to do?</label>
                              <textarea value={remainingNotes} onChange={(e) => setRemainingNotes(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--accent-blue)', fontSize: '13px' }} rows={2} />
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setActiveStatusTask(null)} disabled={isRescheduling} style={{ padding: '8px 16px', backgroundColor: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Cancel</button>
                          <button onClick={() => updateTaskStatus(task)} disabled={isRescheduling} style={{ padding: '8px 16px', backgroundColor: 'var(--accent-blue)', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                            {isRescheduling ? '✨ Updating...' : 'Save Status'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Week View */}
      <div className="card" style={{ padding: '16px 24px' }}>
        <div className="week-view">
          {weekDays.map((d, i) => {
            const isActive = d.toDateString() === selectedDate.toDateString();
            const isToday = i === 0;
            const name = isToday ? 'TODAY' : d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            
            // Calculate load for this day
            const dayOfWeek = d.getDay();
            const dayRoutines = routines.filter(r => r.daysOfWeek.includes(dayOfWeek) && (r.category === 'Work' || r.category === 'Study'));
            const dayTasks = tasks.filter(t => 
              new Date(t.scheduledStart).toDateString() === d.toDateString() &&
              (t.category === 'Work' || t.category === 'Study' || !t.category)
            );
            
            let loadMinutes = 0;
            dayRoutines.forEach(r => {
              const [startH, startM] = r.startTime.split(':').map(Number);
              const [endH, endM] = r.endTime.split(':').map(Number);
              let diff = (endH * 60 + endM) - (startH * 60 + startM);
              if (diff < 0) diff += 24 * 60; 
              loadMinutes += diff;
            });
            dayTasks.forEach(t => {
              loadMinutes += t.durationHours * 60;
            });
            
            // Let's say 8 hours (480 mins) is 100% packed for this visual gauge
            const packedPercentage = Math.min(100, Math.round((loadMinutes / 480) * 100));
            // Green if low load, yellow if medium, red if high load
            const indicatorColor = packedPercentage > 80 ? '#e11d48' : packedPercentage > 40 ? '#f59e0b' : '#10b981';

            return (
              <div 
                key={d.toISOString()} 
                className={`day-card ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedDate(d)}
                style={{ cursor: 'pointer' }}
              >
                <div className="day-name">{name}</div>
                <div className="day-number">{d.getDate()}</div>
                <div style={{ width: '100%', padding: '0 4px', marginTop: '4px' }}>
                  <div style={{ width: '100%', height: '4px', backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${packedPercentage}%`, height: '100%', backgroundColor: indicatorColor, transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Responsive Dashboard Grid */}
      <div className="dashboard-grid">
        
        {/* Left Column: Timeline */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bg-sidebar)' }}>
                <span style={{ color: 'var(--accent-blue)' }}>📅</span> {formattedSelectedDateTitle}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Showing blended schedule of calendar events, routines, and task sessions
              </p>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-sidebar)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              📈 {filteredRoutines.length + filteredTasks.length} Blocks
            </div>
          </div>
          
          <div className="timeline">
            {isLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading schedule...</div>
            ) : filteredRoutines.length === 0 && filteredTasks.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)' }}>Your schedule is empty for this day.</div>
            ) : (
              <>
                {timelineItems.map(item => {
                  if (item.type === 'routine') {
                    const routine = item.data as Routine;
                    return (
                      <div key={`routine-${routine.id}`} className="timeline-item">
                        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '16px', padding: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ width: '40px', height: '40px', backgroundColor: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, border: '1px solid #e2e8f0' }}>
                            {routine.title.toLowerCase().includes('sleep') ? '🌙' : '🏢'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#1e3a8a', fontWeight: 600 }}>
                              {routine.title}
                            </h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              {routine.category && (
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(0,0,0,0.05)', color: '#475569' }}>
                                  {routine.category === 'Work' ? '💼' : routine.category === 'Travel' ? '🚗' : routine.category === 'Sleep' ? '🌙' : routine.category === 'Study' ? '📚' : routine.category === 'Personal' ? '🧘' : '🏷️'} {routine.category}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.5px' }}>
                                FIXED PROTECTED ROUTINE
                              </span>
                              <span style={{ fontSize: '13px', color: '#64748b' }}>
                                🕒 {routine.startTime} - {routine.endTime}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const task = item.data as Task;
                    const startDate = new Date(task.scheduledStart);
                    const endDate = new Date(task.scheduledEnd);
                    const timeString = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')} - ${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
                    
                    return (
                      <div key={`task-${task.id}`} className="timeline-item">
                        <div style={{ backgroundColor: task.status === 'Done' ? '#f0fdf4' : task.status === 'Partial' ? '#fffbeb' : task.status === 'Skipped' ? '#f8fafc' : 'var(--bg-card)', border: task.status === 'Done' ? '1px solid #bbf7d0' : task.status === 'Partial' ? '1px solid #fef3c7' : task.status === 'Skipped' ? '1px solid #e2e8f0' : '1px solid var(--border-color)', borderRadius: '16px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ width: '40px', height: '40px', backgroundColor: task.status === 'Done' ? '#dcfce7' : task.status === 'Partial' ? '#fef3c7' : task.status === 'Skipped' ? '#f1f5f9' : '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, border: task.status === 'Done' ? '1px solid #86efac' : task.status === 'Partial' ? '1px solid #fde68a' : task.status === 'Skipped' ? '1px solid #e2e8f0' : '1px solid #e2e8f0' }}>
                              {task.status === 'Done' ? '✅' : task.status === 'Partial' ? '⏳' : task.status === 'Skipped' ? '❌' : '📝'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: task.status === 'Skipped' ? 'var(--text-secondary)' : 'var(--bg-sidebar)', marginBottom: '4px', textDecoration: task.status === 'Skipped' ? 'line-through' : 'none' }}>
                                {task.title}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                {task.priority && (
                                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '12px', backgroundColor: task.priority === 'High' ? '#fee2e2' : task.priority === 'Medium' ? '#fef3c7' : '#e0e7ff', color: task.priority === 'High' ? '#b91c1c' : task.priority === 'Medium' ? '#b45309' : '#4338ca', opacity: task.status === 'Skipped' ? 0.5 : 1 }}>
                                    {task.priority}
                                  </span>
                                )}
                                {task.workType && (
                                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '12px', backgroundColor: '#f1f5f9', color: 'var(--text-secondary)', opacity: task.status === 'Skipped' ? 0.5 : 1 }}>
                                    {task.workType}
                                  </span>
                                )}
                                {task.category && task.category !== 'Work' && task.category !== 'Study' && (
                                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '12px', backgroundColor: '#f3f4f6', color: '#6b7280', opacity: task.status === 'Skipped' ? 0.5 : 1 }}>
                                    🏷️ {task.category}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: task.status === 'Done' ? '#166534' : task.status === 'Partial' ? '#b45309' : task.status === 'Skipped' ? '#64748b' : '#475569', letterSpacing: '0.5px' }}>
                                  {task.status === 'Done' ? 'COMPLETED TASK' : task.status === 'Partial' ? 'PARTIALLY COMPLETED' : task.status === 'Skipped' ? 'SKIPPED' : 'SCHEDULED TASK SESSION'}
                                </span>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>
                                  🕒 {timeString}
                                </span>
                              </div>
                              {task.progressNotes && (
                                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: '8px', fontSize: '13px', color: '#92400e', borderLeft: '3px solid #f59e0b' }}>
                                  <strong>Progress Notes:</strong> {task.progressNotes}
                                </div>
                              )}
                            </div>
                            {task.status === 'Pending' && activeStatusTask !== task.id && (
                              <button 
                                style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', height: 'fit-content' }}
                                onClick={() => {
                                  setActiveStatusTask(task.id);
                                  setStatusFormValue('Done');
                                }}
                              >
                                Update Status
                              </button>
                            )}
                          </div>

                        {/* Inline Update Status Form */}
                        {activeStatusTask === task.id && (
                          <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed var(--border-color)', marginTop: '8px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" name="status" value="Done" checked={statusFormValue === 'Done'} onChange={() => setStatusFormValue('Done')} />
                                ✅ Fully Completed
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" name="status" value="Partial" checked={statusFormValue === 'Partial'} onChange={() => setStatusFormValue('Partial')} />
                                ⏳ Partially Completed
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" name="status" value="Skipped" checked={statusFormValue === 'Skipped'} onChange={() => setStatusFormValue('Skipped')} />
                                ❌ Skipped / Not Done
                              </label>
                            </div>
                            
                            {statusFormValue === 'Partial' && (
                              <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '4px' }}>What was accomplished? (Notes for this task)</label>
                                  <textarea 
                                    value={progressNotes}
                                    onChange={(e) => setProgressNotes(e.target.value)}
                                    placeholder="e.g. Finished the rough draft"
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px', resize: 'vertical' }}
                                    rows={2}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '4px' }}>
                                    ✨ What is left to do? (AI will schedule this)
                                  </label>
                                  <textarea 
                                    value={remainingNotes}
                                    onChange={(e) => setRemainingNotes(e.target.value)}
                                    placeholder="e.g. Need to write the conclusion and format the bibliography."
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--accent-blue)', fontSize: '13px', resize: 'vertical' }}
                                    rows={2}
                                  />
                                </div>
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button 
                                onClick={() => setActiveStatusTask(null)}
                                disabled={isRescheduling}
                                style={{ padding: '8px 16px', backgroundColor: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: isRescheduling ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={() => updateTaskStatus(task)}
                                disabled={isRescheduling}
                                style={{ padding: '8px 16px', backgroundColor: 'var(--accent-blue)', color: 'white', borderRadius: '6px', border: 'none', cursor: isRescheduling ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                              >
                                {isRescheduling ? '✨ Rescheduling...' : 'Save Status'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
              })}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Burnout Risk Analyzer */}
          <div className="card">
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-sidebar)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', textTransform: 'uppercase' }}>
              <span>📈</span> Burnout Risk Analyzer
            </h3>
            
            {isAnalyzingBurnout || !burnoutStats ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                ✨ AI analyzing your schedule...
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 800, color: burnoutStats.percentage > 80 ? '#e11d48' : burnoutStats.percentage > 50 ? '#d97706' : '#10b981' }}>
                    {burnoutStats.percentage}%
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-sidebar)', fontWeight: 500 }}>Risk Level</span>
                </div>
                
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-sidebar-heading)' }}>Stress Limit Status</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--bg-sidebar)' }}>{burnoutStats.status}</span>
                </div>
                
                <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', marginBottom: '24px' }}>
                  <div style={{ width: `${burnoutStats.percentage}%`, height: '100%', backgroundColor: burnoutStats.percentage > 80 ? '#e11d48' : burnoutStats.percentage > 50 ? '#f59e0b' : '#10b981', borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                </div>
                
                <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: 'var(--border-radius)', fontSize: '13px', color: 'var(--text-sidebar-heading)', lineHeight: '1.6' }}>
                  <strong style={{ color: 'var(--bg-sidebar)' }}>AI Coach:</strong> {burnoutStats.advice}
                </div>
              </>
            )}
          </div>

          {/* Productivity Tip */}
          <div className="card" style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--bg-sidebar)', color: 'white' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '32px', height: '32px', backgroundColor: '#1e293b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                🔥
              </div>
              Productivity Tip
            </h3>
            
            {isAnalyzingBurnout || !burnoutStats ? (
              <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', margin: 0 }}>
                Loading AI tip...
              </p>
            ) : (
              <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', margin: 0 }}>
                {burnoutStats.productivityTip || 'Spacing tasks with a 15-minute routine block like "Refuel Break" before starting a new task can boost cognitive focus by up to 22%.'}
              </p>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
