"use client";

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface SupabaseTask {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  work_type: string | null;
}

export default function ProactiveNudge() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Track spoken alerts so we don't spam them on re-renders or multiple polls
  const spokenStarts = useRef(new Set<string>());
  const spokenEnds = useRef(new Set<string>());
  const spokenDeepWork = useRef(new Set<string>());
  const spokenOverdue = useRef(new Set<string>());
  
  useEffect(() => {
    const handleInteraction = () => setHasInteracted(true);
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en')));
    };
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (!hasInteracted) return;

    const runEngine = async () => {
      // 1. Get User Preferences
      const saved = localStorage.getItem('syncrotask_voice_prefs');
      let prefs = { selectedVoiceName: '', volume: 80, speed: 1, pitch: 1, isAlertsEnabled: true };
      if (saved) {
        try { prefs = { ...prefs, ...JSON.parse(saved) }; } catch {}
      }

      if (!prefs.isAlertsEnabled) return;

      // Helper to speak
      const speak = (text: string) => {
        const utterance = new SpeechSynthesisUtterance(text);
        if (prefs.selectedVoiceName && voices.length > 0) {
          const v = voices.find(v => v.name === prefs.selectedVoiceName);
          if (v) utterance.voice = v;
        } else if (voices.length > 0) {
          // Default to first English voice
          utterance.voice = voices[0];
        }
        utterance.volume = prefs.volume / 100;
        utterance.rate = prefs.speed;
        utterance.pitch = prefs.pitch;
        window.speechSynthesis.speak(utterance);
      };

      // 2. Fetch Tasks
      const { data: tasksData, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'Pending'); // only care about pending tasks for most alerts

      if (error || !tasksData) return;

      const now = new Date();

      // (Feature 1 removed: Replaced by manual 'Play Briefing' button on Dashboard)

      // 3. Process Each Task
      tasksData.forEach((task: SupabaseTask) => {
        if (!task.scheduled_start || !task.scheduled_end) return;
        
        const start = new Date(task.scheduled_start);
        const end = new Date(task.scheduled_end);
        const msUntilStart = start.getTime() - now.getTime();
        const minsUntilStart = msUntilStart / 60000;
        
        const msSinceEnd = now.getTime() - end.getTime();
        const minsSinceEnd = msSinceEnd / 60000;

        const durationMs = end.getTime() - start.getTime();

        // Feature 2A: Task Start Nudge (5 mins before)
        if (minsUntilStart > 0 && minsUntilStart <= 5 && !spokenStarts.current.has(task.id)) {
          spokenStarts.current.add(task.id);
          speak(`Hey, your focus session for '${task.title}' starts in 5 minutes. Get ready.`);
        }

        // Feature 2B: Task End Nudge
        if (minsSinceEnd > 0 && minsSinceEnd <= 2 && !spokenEnds.current.has(task.id)) {
          spokenEnds.current.add(task.id);
          speak(`Time's up for '${task.title}'. Please go to the dashboard to mark your progress or reschedule.`);
        }

        // Feature 3: Overdue Intervention (> 15 mins overdue, still pending)
        if (minsSinceEnd > 15 && minsSinceEnd < 60 && !spokenOverdue.current.has(task.id)) {
          spokenOverdue.current.add(task.id);
          speak(`Your session for '${task.title}' has ended, but it's still pending. Do you need to update its status?`);
        }

        // Feature 4: Deep Work Anti-Burnout (halfway through a > 90 min task)
        const durationMins = durationMs / 60000;
        if (task.work_type === 'Deep Work' && durationMins > 90) {
          const halfwayTime = start.getTime() + (durationMs / 2);
          const msSinceHalfway = now.getTime() - halfwayTime;
          const minsSinceHalfway = msSinceHalfway / 60000;
          
          if (minsSinceHalfway > 0 && minsSinceHalfway <= 5 && !spokenDeepWork.current.has(task.id)) {
            spokenDeepWork.current.add(task.id);
            speak(`You've been focused on '${task.title}' for over 45 minutes. Don't forget to look away from the screen, stretch, and hydrate to prevent burnout.`);
          }
        }
      });
    };

    // Run engine immediately once, then every 60 seconds
    runEngine();
    const interval = setInterval(runEngine, 60000);
    return () => clearInterval(interval);

  }, [hasInteracted, voices]);

  return null;
}
