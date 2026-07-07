"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Routine } from '@/lib/mockData'; 

export default function FixedRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Work');
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('17:00');
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [userId, setUserId] = useState<string | null>(null);

  const fetchRoutines = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from('routines')
        .select('*')
        .order('start_time', { ascending: true });

      if (error) throw error;

      const formattedRoutines: Routine[] = data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        startTime: (r.start_time as string).substring(0, 5),
        endTime: (r.end_time as string).substring(0, 5),
        daysOfWeek: r.days_of_week as number[],
        category: (r.category as string) || 'Other',
      }));

      setRoutines(formattedRoutines);
    } catch (err) {
      console.error("Error fetching routines:", (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // We wrap it in a setTimeout to push it to the next tick, avoiding the synchronous setState warning
    setTimeout(() => fetchRoutines(), 0);
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setFormTitle('');
    setFormCategory('Work');
    setFormStart('09:00');
    setFormEnd('17:00');
    setFormDays([1, 2, 3, 4, 5]);
    setIsFormOpen(true);
  };

  const openEditForm = (routine: Routine) => {
    setEditingId(routine.id);
    setFormTitle(routine.title);
    setFormCategory(routine.category || 'Other');
    setFormStart(routine.startTime);
    setFormEnd(routine.endTime);
    setFormDays(routine.daysOfWeek);
    setIsFormOpen(true);
  };

  const toggleDay = (day: number) => {
    if (formDays.includes(day)) {
      setFormDays(formDays.filter(d => d !== day));
    } else {
      setFormDays([...formDays, day].sort());
    }
  };

  const handleSave = async () => {
    if (!formTitle) return;
    if (!userId) return alert("You must be logged in to save routines.");

    try {
      const dbPayload = {
        user_id: userId,
        title: formTitle,
        category: formCategory,
        start_time: formStart,
        end_time: formEnd,
        days_of_week: formDays,
      };

      if (editingId) {
        const { error } = await supabase
          .from('routines')
          .update(dbPayload)
          .eq('id', editingId);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('routines')
          .insert(dbPayload);
          
        if (error) throw error;
      }

      setIsFormOpen(false);
      fetchRoutines(); 
    } catch (err) {
      alert(`Error saving routine: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this routine?')) return;
    
    try {
      const { error } = await supabase
        .from('routines')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      fetchRoutines(); 
    } catch (err) {
      alert(`Error deleting routine: ${(err as Error).message}`);
    }
  };

  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--bg-sidebar)', margin: '0 0 8px 0' }}>Settings / Routine Manager</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Define the fixed blocks in your schedule (like classes or gym). SyncroTask AI will route active tasks around these times.
          </p>
        </div>
        <button className="btn" onClick={openAddForm}>+ Add Fixed Routine</button>
      </div>

      {isFormOpen && (
        <div className="card" style={{ padding: '24px', border: '1px solid var(--accent-blue)', backgroundColor: '#f0f9ff' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', fontSize: '16px' }}>{editingId ? 'Edit Routine' : 'Add New Routine'}</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '8px' }}>Routine Name</label>
                <input 
                  type="text" 
                  value={formTitle} 
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. College Lecture" 
                  style={{ width: '100%', padding: '12px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '8px' }}>Category</label>
                <select 
                  value={formCategory} 
                  onChange={(e) => setFormCategory(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'white' }}
                >
                  <option value="Work">Work</option>
                  <option value="Travel">Travel</option>
                  <option value="Sleep">Sleep</option>
                  <option value="Study">Study</option>
                  <option value="Personal">Personal</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '8px' }}>Start Time</label>
                <input 
                  type="time" 
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '8px' }}>End Time</label>
                <input 
                  type="time" 
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }} 
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-sidebar-heading)', marginBottom: '8px' }}>Active Days</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {dayNames.map((day, index) => {
                  const isActive = formDays.includes(index);
                  return (
                    <button
                      key={index}
                      onClick={() => toggleDay(index)}
                      style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        border: isActive ? 'none' : '1px solid var(--border-color)',
                        backgroundColor: isActive ? 'var(--accent-blue)' : 'white',
                        color: isActive ? 'white' : 'var(--text-secondary)',
                        fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button 
                style={{ padding: '10px 16px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'white', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setIsFormOpen(false)}
              >
                Cancel
              </button>
              <button className="btn" onClick={handleSave}>
                Save Routine
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading routines...</div>
        ) : routines.map(routine => (
          <div key={routine.id} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px' }}>
            <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: 'var(--bg-sidebar)' }}>{routine.title}</h3>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {routine.category === 'Work' ? '💼' : routine.category === 'Travel' ? '🚗' : routine.category === 'Sleep' ? '🌙' : routine.category === 'Study' ? '📚' : routine.category === 'Personal' ? '🧘' : '🏷️'} {routine.category}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--accent-blue)', fontWeight: 600, backgroundColor: 'rgba(0,100,147,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                  {routine.startTime} - {routine.endTime}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {dayNames.map((day, idx) => (
                    <span key={idx} style={{ 
                      fontSize: '11px', fontWeight: 700, 
                      color: routine.daysOfWeek.includes(idx) ? 'var(--bg-sidebar)' : '#cbd5e1' 
                    }}>
                      {day}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => openEditForm(routine)}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                ✏️ Edit
              </button>
              <button 
                onClick={() => handleDelete(routine.id)}
                style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '8px', cursor: 'pointer', color: '#b91c1c' }}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && routines.length === 0 && !isFormOpen && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--border-radius)', border: '1px dashed var(--border-color)' }}>
            No fixed routines defined yet. Click &quot;Add Fixed Routine&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
