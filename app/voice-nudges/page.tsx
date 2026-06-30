"use client";

import { useState, useEffect } from 'react';

export default function VoiceNudges() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState<number>(0);
  const [volume, setVolume] = useState<number>(80);
  const [speed, setSpeed] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [isAlertsEnabled, setIsAlertsEnabled] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [lastAlert, setLastAlert] = useState<{ text: string; time: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('syncrotask_voice_prefs');
    let savedName = '';
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        if (prefs.selectedVoiceName) savedName = prefs.selectedVoiceName;
        setTimeout(() => {
          if (prefs.volume !== undefined) setVolume(prefs.volume);
          if (prefs.speed !== undefined) setSpeed(prefs.speed);
          if (prefs.pitch !== undefined) setPitch(prefs.pitch);
          if (prefs.isAlertsEnabled !== undefined) setIsAlertsEnabled(prefs.isAlertsEnabled);
        }, 0);
      } catch {}
    }

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      setVoices(availableVoices);
      
      let voiceIndex = -1;
      if (savedName) {
        voiceIndex = availableVoices.findIndex(v => v.name === savedName);
      }
      if (voiceIndex === -1) {
        voiceIndex = availableVoices.findIndex(v => v.lang === 'en-US');
      }
      if (voiceIndex !== -1) {
        setSelectedVoiceIndex(voiceIndex);
      }
    };

    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    setTimeout(() => setIsLoaded(true), 0);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const name = voices[selectedVoiceIndex]?.name || '';
    localStorage.setItem('syncrotask_voice_prefs', JSON.stringify({
      selectedVoiceName: name, 
      volume, 
      speed, 
      pitch, 
      isAlertsEnabled
    }));
  }, [selectedVoiceIndex, voices, volume, speed, pitch, isAlertsEnabled, isLoaded]);

  const speak = (text: string) => {
    if (!isAlertsEnabled) return;
    
    window.speechSynthesis.cancel(); // Stop any currently playing audio
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (voices.length > 0) {
      utterance.voice = voices[selectedVoiceIndex];
    }
    utterance.volume = volume / 100;
    utterance.rate = speed;
    utterance.pitch = pitch;

    window.speechSynthesis.speak(utterance);
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    setLastAlert({ text, time: timeString });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '900px', margin: '0 auto' }}>
      
      <div className="card" style={{ padding: '32px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <span style={{ color: 'var(--accent-blue)', fontSize: '20px' }}>🔔</span> Proactive Nudge Service
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Custom Toggle Switch */}
            <div 
              style={{ 
                width: '44px', height: '24px', backgroundColor: isAlertsEnabled ? 'var(--accent-blue)' : '#cbd5e1', 
                borderRadius: '12px', position: 'relative', cursor: 'pointer', transition: '0.3s' 
              }}
              onClick={() => setIsAlertsEnabled(!isAlertsEnabled)}
            >
              <div style={{ 
                width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', 
                position: 'absolute', top: '2px', left: isAlertsEnabled ? '22px' : '2px', transition: '0.3s' 
              }} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-sidebar-heading)' }}>Voice Alerts</span>
          </div>
        </div>

        {/* 2-Column Layout */}
        <div className="responsive-form-grid" style={{ alignItems: 'flex-start' }}>
          
          {/* Left Column: Configuration */}
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '32px' }}>
              Configure the client-side voice notification engine. It scans your timeline in the background and proactively nudges you if an active focus session is overdue.
            </p>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '8px' }}>
                Voice Character
              </label>
              <select 
                value={selectedVoiceIndex}
                onChange={(e) => setSelectedVoiceIndex(Number(e.target.value))}
                style={{ width: '100%', padding: '12px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '14px', backgroundColor: 'white' }}
              >
                {voices.length === 0 ? <option>Loading English voices...</option> : null}
                {voices.map((v, index) => (
                  <option key={index} value={index}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '24px' }}>
              <div className="slider-container" style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)' }}>Volume ({volume}%)</label>
                <input 
                  type="range" className="custom-slider" 
                  min="0" max="100" value={volume} onChange={(e) => setVolume(Number(e.target.value))}
                  style={{ background: `linear-gradient(to right, var(--accent-blue) ${volume}%, #e2e8f0 ${volume}%)` }}
                />
              </div>
              <div className="slider-container" style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)' }}>Speed ({speed}x)</label>
                <input 
                  type="range" className="custom-slider" 
                  min="0.5" max="2" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                  style={{ background: `linear-gradient(to right, var(--accent-blue) ${((speed - 0.5) / 1.5) * 100}%, #e2e8f0 ${((speed - 0.5) / 1.5) * 100}%)` }}
                />
              </div>
              <div className="slider-container" style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)' }}>Pitch ({pitch})</label>
                <input 
                  type="range" className="custom-slider" 
                  min="0" max="2" step="0.1" value={pitch} onChange={(e) => setPitch(Number(e.target.value))}
                  style={{ background: `linear-gradient(to right, var(--accent-blue) ${(pitch / 2) * 100}%, #e2e8f0 ${(pitch / 2) * 100}%)` }}
                />
              </div>
            </div>

          </div>

          {/* Right Column: Test Engine */}
          <div style={{ backgroundColor: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-sidebar-heading)' }}>Status: All sessions on track</span>
            </div>

            <h4 style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '16px' }}>
              TEST NOTIFICATION ENGINE
            </h4>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '32px' }}>
              <button 
                className="btn" 
                style={{ backgroundColor: 'white', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '13px' }}
                onClick={() => speak("Are you ready to start your next focus session?")}
              >
                <span style={{ color: 'var(--accent-blue)' }}>🔊</span> &quot;Ready?&quot;
              </button>
              <button 
                className="btn" 
                style={{ backgroundColor: 'white', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '13px' }}
                onClick={() => speak("Emergency detected! Re-balancing your active workload to prevent burnout.")}
              >
                <span style={{ color: '#ef4444' }}>🔊</span> &quot;Emergency!&quot;
              </button>
              <button 
                className="btn" 
                style={{ backgroundColor: 'white', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '13px' }}
                onClick={() => speak("Great job! You have completed your scheduled tasks for the day.")}
              >
                <span style={{ color: '#10b981' }}>🔊</span> &quot;Done&quot;
              </button>
            </div>

            <h4 style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
              LAST SYNTHESIZED ALERT:
            </h4>
            
            {lastAlert ? (
              <p style={{ fontSize: '13px', color: 'var(--text-sidebar-heading)', fontStyle: 'italic', margin: 0, lineHeight: '1.5' }}>
                &quot;{lastAlert.text}&quot; (Spoken at {lastAlert.time})
              </p>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                No alerts synthesized yet.
              </p>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
