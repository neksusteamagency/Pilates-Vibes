import { useState } from 'react';
import { format, addDays, startOfWeek } from 'date-fns';
import { Check, X, Clock, ChevronLeft, ChevronRight, AlertTriangle, Search, User, MinusCircle } from 'lucide-react';
import { useClasses } from '../../hooks/useClasses';
import { useClients } from '../../hooks/useClients';
import { useAttendance } from '../../hooks/useAttendance';
import { useBookings } from '../../hooks/useBookings';
import toast from 'react-hot-toast';

const DAYS_LABEL = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function Card({ title, children, action, onAction }) {
  return (
    <div style={{ background:'#FAF7F2', borderRadius:14, boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:22, border:'1px solid #E0D5C1' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.15rem', fontWeight:500, color:'#3D2314' }}>{title}</span>
        {action && <button onClick={onAction} style={{ fontSize:'0.78rem', color:'#A0673A', background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>{action}</button>}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    attended:  { bg:'#EEF3E6', color:'#4E6A2E', label:'Attended',  icon: <Check size={11}/> },
    'no-show': { bg:'#F7EDED', color:'#8C3A3A', label:'No-show',   icon: <X size={11}/> },
    pending:   { bg:'#F5F0E8', color:'#9C8470', label:'Pending',   icon: <Clock size={11}/> },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:500, background:s.bg, color:s.color }}>
      {s.icon} {s.label}
    </span>
  );
}

function ClientAvatar({ avatar, size = 30 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:'#C4AE8F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Cormorant Garant',serif", fontSize: size > 30 ? '1rem' : '0.75rem', color:'#3D2314', fontWeight:600, flexShrink:0 }}>
      {avatar}
    </div>
  );
}

// ── Attendance Modal ──────────────────────────────────────────
// NOTE: useBookings is called here at the modal level with a specific classId filter —
// this is correct and does NOT violate Rules of Hooks (modal is always mounted when shown).
function AttendanceModal({ cls, weekStart, weekOf, clients, allAttendance, onSave, onClose }) {
  const date    = addDays(weekStart, cls.day);
  const dateStr = format(date, 'yyyy-MM-dd');

  const { bookings } = useBookings({ classId: cls.id });
  const bookedClients = bookings
    .filter(b => b.status === 'confirmed')
    .map(b => clients.find(c => c.id === b.clientId))
    .filter(Boolean);

  // Build initial logs from existing attendance records
  const existingLogs = {};
  allAttendance
    .filter(a => a.classId === cls.id && a.date === dateStr)
    .forEach(a => { if (a.clientId) existingLogs[a.clientId] = a.status; });

  const [localLogs,     setLocalLogs]     = useState(existingLogs);
  const [nonMemberName, setNonMemberName] = useState('');
  const [nonMembers,    setNonMembers]    = useState([]);
  const [search,        setSearch]        = useState('');
  const [saving,        setSaving]        = useState(false);

  function cycleStatus(clientId) {
    setLocalLogs(prev => {
      const cur  = prev[clientId] || 'pending';
      const next = cur === 'pending' ? 'attended' : cur === 'attended' ? 'no-show' : 'pending';
      return { ...prev, [clientId]: next };
    });
  }

  function addNonMember() {
    if (!nonMemberName.trim()) return;
    setNonMembers(prev => [...prev, { name: nonMemberName.trim(), status: 'attended' }]);
    setNonMemberName('');
  }

  const attended = Object.values(localLogs).filter(s => s === 'attended').length + nonMembers.filter(n => n.status === 'attended').length;
  const noShows  = Object.values(localLogs).filter(s => s === 'no-show').length;
  const pending  = Object.values(localLogs).filter(s => s === 'pending').length;

  const filteredClients = bookedClients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  async function handleSave() {
    setSaving(true);
    try {
      // BUG FIX #4: Pass weekOf so saveClassAttendance can correctly match booking records.
      await onSave(cls.id, dateStr, localLogs, nonMembers, weekOf);
      toast.success('Attendance saved!');
      onClose();
    } catch {
      toast.error('Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
         onClick={onClose}>
      <div style={{ background:'#FAF7F2', borderRadius:18, width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(61,35,20,0.18)', border:'1px solid #E0D5C1' }}
           onClick={e => e.stopPropagation()}>

        <div style={{ padding:'22px 24px 16px', borderBottom:'1px solid #E0D5C1' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, color:'#3D2314' }}>{cls.name}</div>
              <div style={{ fontSize:'0.8rem', color:'#9C8470', marginTop:3 }}>
                {format(date,'EEE, MMM d')} · {fmt12(cls.time)} · {cls.trainer}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470' }}><X size={18}/></button>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
            {[
              { label:`${attended} Attended`, bg:'#EEF3E6', color:'#4E6A2E' },
              { label:`${noShows} No-show`,   bg:'#F7EDED', color:'#8C3A3A' },
              { label:`${pending} Pending`,   bg:'#F5F0E8', color:'#9C8470' },
            ].map(p => (
              <span key={p.label} style={{ padding:'4px 12px', borderRadius:20, fontSize:'0.75rem', fontWeight:500, background:p.bg, color:p.color }}>{p.label}</span>
            ))}
          </div>
        </div>

        <div style={{ padding:'18px 24px 24px' }}>
          <div style={{ position:'relative', marginBottom:14 }}>
            <Search size={14} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'#9C8470' }}/>
            <input placeholder="Search client…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width:'100%', paddingLeft:34, padding:'9px 12px 9px 34px', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#F5F0E8', fontFamily:"'DM Sans',sans-serif", fontSize:'0.85rem', color:'#2A1A0E', outline:'none', boxSizing:'border-box' }} />
          </div>

          <div style={{ fontSize:'0.75rem', color:'#C4AE8F', marginBottom:12 }}>Tap a row to cycle: Pending → Attended → No-show</div>

          {filteredClients.length === 0 && (
            <div style={{ textAlign:'center', padding:'20px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>No booked clients found.</div>
          )}

          {filteredClients.map(client => {
            const status = localLogs[client.id] || 'pending';
            const isLow  = client.sessionsRemaining !== null && client.sessionsRemaining !== undefined && client.sessionsRemaining <= 2;
            return (
              <div key={client.id} onClick={() => cycleStatus(client.id)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 12px', borderRadius:10, marginBottom:6, cursor:'pointer', border:'1.5px solid #E0D5C1', background: status === 'attended' ? '#F3F7EE' : status === 'no-show' ? '#FAF1F1' : '#FFFDF9', transition:'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(61,35,20,0.10)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <ClientAvatar avatar={client.avatar} />
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:'0.9rem', fontWeight:500, color:'#2A1A0E' }}>{client.name}</span>
                    {isLow && <AlertTriangle size={12} color='#C08030'/>}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:'#9C8470', marginTop:1 }}>
                    {client.pkg}{client.sessionsRemaining !== null && client.sessionsRemaining !== undefined && ` · ${client.sessionsRemaining} left`}
                  </div>
                </div>
                <StatusBadge status={status} />
              </div>
            );
          })}

          {noShows > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:8, background:'#F7EDED', border:'1px solid #DDB0B0', color:'#8C3A3A', fontSize:'0.8rem', marginTop:8, marginBottom:14 }}>
              <MinusCircle size={13} style={{ flexShrink:0 }}/>
              {noShows} session{noShows > 1 ? 's' : ''} will be deducted for no-shows.
            </div>
          )}

          {/* Walk-ins */}
          <div style={{ borderTop:'1.5px solid #E0D5C1', marginTop:16, paddingTop:16 }}>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color:'#3D2314', marginBottom:10 }}>Walk-in / Non-member</div>
            {nonMembers.map((nm, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid #E0D5C1' }}>
                <User size={16} color='#C4AE8F'/>
                <span style={{ flex:1, fontSize:'0.88rem', color:'#2A1A0E' }}>{nm.name}</span>
                <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.7rem', fontWeight:500, background:'#EEF3E6', color:'#4E6A2E' }}>Walk-in</span>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <input placeholder="Full name…" value={nonMemberName} onChange={e => setNonMemberName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNonMember()}
                style={{ flex:1, padding:'9px 12px', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#F5F0E8', fontFamily:"'DM Sans',sans-serif", fontSize:'0.85rem', color:'#2A1A0E', outline:'none' }}/>
              <button onClick={addNonMember} style={{ padding:'9px 16px', background:'#7C8C5E', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.85rem', fontWeight:500 }}>Add</button>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            style={{ marginTop:20, width:'100%', padding:'13px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.92rem', fontWeight:600, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Attendance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminAttendance() {
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [savedClasses,  setSavedClasses]  = useState(new Set());
  const [selectedClass, setSelectedClass] = useState(null);
  const [dayFilter,     setDayFilter]     = useState('All');
  const [search,        setSearch]        = useState('');

  const { classes }  = useClasses();
  const { clients }  = useClients();

  const weekStart  = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const weekOf     = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayStr   = format(new Date(), 'yyyy-MM-dd');

  // BUG FIX #7: Filter attendance by current week's date range to avoid loading everything.
  const { attendance, saveClassAttendance, addWalkIn } = useAttendance({
    dateFrom: weekOf,
    dateTo:   weekEndStr,
  });

  const todayClasses   = classes.filter(c => c.day === todayIndex);
  const totalToday     = todayClasses.reduce((s, c) => s + (c.booked || 0), 0);
  const attendedToday  = attendance.filter(a => a.date === todayStr && a.status === 'attended').length;
  const noShowToday    = attendance.filter(a => a.date === todayStr && a.status === 'no-show').length;

  // BUG FIX #4: weekOf is now passed through to saveClassAttendance → logAttendance.
  async function handleSave(classId, dateStr, logs, nonMembers, weekOfDate) {
    await saveClassAttendance(classId, dateStr, logs, weekOfDate);
    for (const nm of nonMembers) {
      await addWalkIn(classId, dateStr, nm.name);
    }
    setSavedClasses(prev => new Set([...prev, classId]));
  }

  const filteredClasses = classes.filter(c => {
    const matchDay    = dayFilter === 'All' || DAYS_LABEL[c.day] === dayFilter;
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.trainer.toLowerCase().includes(search.toLowerCase());
    return matchDay && matchSearch;
  });

  const noShowEntries = attendance
    .filter(a => a.status === 'no-show')
    .map(a => {
      const cls    = classes.find(c => c.id === a.classId);
      const client = clients.find(c => c.id === a.clientId);
      return client && cls ? { client, cls } : null;
    })
    .filter(Boolean);

  const lowSessionClients = clients.filter(c =>
    c.sessionsRemaining !== null && c.sessionsRemaining !== undefined && c.sessionsRemaining <= 2
  );

  return (
    <div style={{ padding:'28px 32px 60px' }}>

      {selectedClass && (
        <AttendanceModal
          cls={selectedClass}
          weekStart={weekStart}
          weekOf={weekOf}
          clients={clients}
          allAttendance={attendance}
          onSave={handleSave}
          onClose={() => setSelectedClass(null)}
        />
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }} className="att-stats-resp">
        {[
          { label:"Today's Classes", value: todayClasses.length, sub:'scheduled today',    color:'#A0673A' },
          { label:'Total Booked',    value: totalToday,          sub:'across all classes', color:'#3D2314' },
          { label:'Attended',        value: attendedToday,       sub:'logged so far',      color:'#7C8C5E' },
          { label:'No-shows',        value: noShowToday,         sub:'sessions deducted',  color:'#C4AE8F' },
        ].map(s => (
          <div key={s.label} style={{ background:'#FAF7F2', borderRadius:14, padding:20, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)' }}>
            <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470', marginBottom:12 }}>{s.label}</div>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'2rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:'0.78rem', color:'#7C8C5E', marginTop:5 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setWeekOffset(w => w-1)} style={navBtn}><ChevronLeft size={15}/></button>
          <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.05rem', color:'#3D2314', minWidth:200, textAlign:'center' }}>
            {format(weekStart,'MMM d')} – {format(addDays(weekStart,6),'MMM d, yyyy')}
          </span>
          <button onClick={() => setWeekOffset(w => w+1)} style={navBtn}><ChevronRight size={15}/></button>
          <button onClick={() => setWeekOffset(0)} style={{ ...navBtn, width:'auto', padding:'5px 12px', borderRadius:8, fontSize:'0.78rem' }}>Today</button>
        </div>
        <div style={{ position:'relative' }}>
          <Search size={14} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'#9C8470' }}/>
          <input placeholder="Search class or trainer…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft:32, padding:'8px 12px 8px 32px', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#FAF7F2', fontFamily:"'DM Sans',sans-serif", fontSize:'0.84rem', color:'#2A1A0E', outline:'none', width:220 }}/>
        </div>
      </div>

      {/* Day filter */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {['All', ...DAYS_LABEL].map(d => (
          <button key={d} onClick={() => setDayFilter(d)} style={{
            padding:'5px 14px', borderRadius:20, fontSize:'0.78rem', fontWeight:500,
            cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s',
            background: dayFilter === d ? '#3D2314' : '#FAF7F2',
            color:       dayFilter === d ? '#F5F0E8' : '#9C8470',
            border:      dayFilter === d ? 'none' : '1.5px solid #E0D5C1',
          }}>{d}</button>
        ))}
      </div>

      {/* Main layout */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:16, alignItems:'start' }} className="att-main-resp">

        <Card title="Class Attendance Log">
          {filteredClasses.length === 0 && (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#C4AE8F', fontSize:'0.88rem' }}>No classes match your filter.</div>
          )}
          {filteredClasses.map((cls, i) => {
            const date    = addDays(weekStart, cls.day);
            const dateStr = format(date, 'yyyy-MM-dd');
            const classAttendance = attendance.filter(a => a.classId === cls.id && a.date === dateStr);
            const attended = classAttendance.filter(a => a.status === 'attended').length;
            const noShows  = classAttendance.filter(a => a.status === 'no-show').length;
            const isSaved  = savedClasses.has(cls.id) || classAttendance.length > 0;
            const isToday  = format(date,'yyyy-MM-dd') === todayStr;

            return (
              <div key={cls.id}
                style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 0', borderBottom: i < filteredClasses.length-1 ? '1px solid #E0D5C1' : 'none' }}>
                <div style={{ textAlign:'center', minWidth:44 }}>
                  <div style={{ fontSize:'0.65rem', textTransform:'uppercase', color:'#9C8470', fontWeight:500 }}>{DAYS_LABEL[cls.day]}</div>
                  <div style={{
                    fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, lineHeight:1,
                    color: isToday ? '#FAF7F2' : '#3D2314',
                    background: isToday ? '#3D2314' : 'transparent',
                    width:32, height:32, borderRadius:'50%', display:'inline-flex',
                    alignItems:'center', justifyContent:'center', marginTop:2,
                  }}>{format(date,'d')}</div>
                </div>
                <div style={{ width:1.5, height:40, background:'#E0D5C1', flexShrink:0, borderRadius:2 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontWeight:500, fontSize:'0.92rem', color:'#2A1A0E' }}>{cls.name}</span>
                    {isSaved && <span style={{ fontSize:'0.68rem', color:'#4E6A2E', background:'#EEF3E6', padding:'2px 8px', borderRadius:20, fontWeight:500 }}>✓ Logged</span>}
                  </div>
                  <div style={{ fontSize:'0.78rem', color:'#9C8470', marginTop:2 }}>
                    {fmt12(cls.time)} · {cls.trainer} · {cls.booked || 0}/{cls.capacity} booked
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:7, alignItems:'center' }}>
                    {isSaved ? (
                      <>
                        <span style={{ fontSize:'0.7rem', color:'#4E6A2E', background:'#EEF3E6', padding:'2px 8px', borderRadius:20 }}>✓ {attended}</span>
                        {noShows > 0 && <span style={{ fontSize:'0.7rem', color:'#8C3A3A', background:'#F7EDED', padding:'2px 8px', borderRadius:20 }}>✗ {noShows}</span>}
                      </>
                    ) : (
                      <div style={{ display:'flex', gap:3 }}>
                        {Array.from({ length: cls.booked || 0 }).map((_, ai) => (
                          <div key={ai} style={{ width:8, height:8, borderRadius:'50%', background:'#E0D5C1' }}/>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedClass(cls)} style={{
                  padding:'8px 14px', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  fontSize:'0.8rem', fontWeight:500, transition:'all 0.18s',
                  background: isSaved ? '#FAF7F2' : '#3D2314',
                  color:      isSaved ? '#A0673A' : '#F5F0E8',
                  border:     isSaved ? '1.5px solid #E0D5C1' : 'none',
                }}>
                  {isSaved ? 'Edit' : 'Log'}
                </button>
              </div>
            );
          })}
        </Card>

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          <Card title="Today's Summary">
            {todayClasses.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>No classes today.</div>
            ) : todayClasses.map((cls, i) => {
              const clsAttended = attendance.filter(a => a.classId === cls.id && a.date === todayStr && a.status === 'attended').length;
              const clsNoShows  = attendance.filter(a => a.classId === cls.id && a.date === todayStr && a.status === 'no-show').length;
              const total = cls.booked || 0;
              const pct   = total > 0 ? Math.round((clsAttended / total) * 100) : 0;
              return (
                <div key={cls.id} style={{ marginBottom: i < todayClasses.length-1 ? 14 : 0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:5 }}>
                    <span style={{ fontSize:'0.88rem', fontWeight:500, color:'#2A1A0E' }}>{cls.name}</span>
                    <span style={{ fontSize:'0.75rem', color:'#9C8470' }}>{fmt12(cls.time)}</span>
                  </div>
                  <div style={{ background:'#E0D5C1', borderRadius:20, height:7, overflow:'hidden', marginBottom:5 }}>
                    <div style={{ background:'#7C8C5E', height:7, borderRadius:20, width:`${pct}%`, transition:'width 0.4s' }}/>
                  </div>
                  <div style={{ display:'flex', gap:10, fontSize:'0.72rem' }}>
                    <span style={{ color:'#4E6A2E' }}>✓ {clsAttended} attended</span>
                    {clsNoShows > 0 && <span style={{ color:'#8C3A3A' }}>✗ {clsNoShows} no-show</span>}
                    <span style={{ color:'#9C8470', marginLeft:'auto' }}>{total} booked</span>
                  </div>
                  {i < todayClasses.length-1 && <div style={{ height:1, background:'#E0D5C1', marginTop:12 }}/>}
                </div>
              );
            })}
          </Card>

          <Card title="No-shows This Week">
            {noShowEntries.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>No no-shows logged yet.</div>
            ) : noShowEntries.map(({ client, cls }, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom: i < noShowEntries.length-1 ? '1px solid #E0D5C1' : 'none' }}>
                <ClientAvatar avatar={client.avatar} size={28}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:500, color:'#2A1A0E' }}>{client.name}</div>
                  <div style={{ fontSize:'0.72rem', color:'#9C8470', marginTop:1 }}>{cls.name} · {fmt12(cls.time)}</div>
                </div>
                <span style={{ fontSize:'0.68rem', color:'#8C3A3A', background:'#F7EDED', padding:'2px 8px', borderRadius:20, fontWeight:500 }}>–1 session</span>
              </div>
            ))}
          </Card>

          <Card title="Low Sessions Alert">
            {lowSessionClients.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>All clients have sufficient sessions.</div>
            ) : lowSessionClients.map((c, i, arr) => (
              <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom: i < arr.length-1 ? '1px solid #E0D5C1' : 'none' }}>
                <ClientAvatar avatar={c.avatar} size={28}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:500, color:'#2A1A0E' }}>{c.name}</div>
                  <div style={{ fontSize:'0.72rem', color:'#9C8470', marginTop:1 }}>{c.pkg}</div>
                </div>
                <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.1rem', fontWeight:500, color:'#C0412A' }}>{c.sessionsRemaining}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) { .att-main-resp  { grid-template-columns: 1fr !important; } }
        @media (max-width: 700px) { .att-stats-resp { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </div>
  );
}

const navBtn = { width:30, height:30, borderRadius:'50%', background:'#FAF7F2', border:'1.5px solid #E0D5C1', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.2s', color:'#6B5744' };