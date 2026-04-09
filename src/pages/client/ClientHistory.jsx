import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useBookings } from '../../hooks/useBookings';
import { useClasses } from '../../hooks/Useclasses';
import { Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const FILTERS = ['All', 'Attended', 'Cancelled', 'No-show'];

function statusStyle(s) {
  if (s === 'attended')  return { bg:'#EEF3E6', color:'#4E6A2E' };
  if (s === 'cancelled') return { bg:'#F5F1E0', color:'#7A6020' };
  if (s === 'no-show')   return { bg:'#F7EDED', color:'#8C3A3A' };
  return { bg:'#F0EAE3', color:'#3D2314' };
}

// Format Firestore weekOf string (yyyy-MM-dd) for display
function formatDate(weekOf) {
  if (!weekOf) return { month: '—', day: '—' };
  try {
    const d = parseISO(weekOf);
    return { month: format(d, 'MMM'), day: format(d, 'd') };
  } catch {
    return { month: '—', day: '—' };
  }
}

const inp = {
  width:'100%', padding:'9px 13px 9px 36px', border:'1.5px solid #E0D5C1', borderRadius:8,
  background:'#FAF7F2', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#2A1A0E', outline:'none',
};

export default function ClientHistory() {
  const { user }  = useAuth();
  const [filter, setFilter] = useState('All');
  const [search,  setSearch]  = useState('');

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling,   setCancelling]   = useState(false);

  // Fetch all bookings for this client
  const { bookings, loading, clientCancelBooking } = useBookings({ clientId: user?.uid });
  const { classes } = useClasses();

  // FIXED: Show past/completed bookings INCLUDING 'confirmed'
  // 'confirmed' bookings will appear until attendance is marked
  const history = bookings.filter(b =>
    ['confirmed', 'attended', 'cancelled', 'no-show'].includes(b.status)
  );

  // Join with class data
  function getClass(classId) {
    return classes.find(c => c.id === classId);
  }

  // Apply filter + search
  const filterMap = {
    'Attended':  'attended',
    'Cancelled': 'cancelled',
    'No-show':   'no-show',
  };

  const filtered = history.filter(b => {
    const cls = getClass(b.classId);
    const matchFilter = filter === 'All' || b.status === filterMap[filter];
    const matchSearch = !search ||
      cls?.name?.toLowerCase().includes(search.toLowerCase()) ||
      cls?.trainer?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  // Summary counts (from full history, not filtered)
  const attended  = history.filter(b => b.status === 'attended').length;
  const cancelled = history.filter(b => b.status === 'cancelled').length;
  const noShow    = history.filter(b => b.status === 'no-show').length;
  const total     = history.length || 1; // avoid div by 0

  async function handleCancel() {
    if (!cancelTarget) return;
    const cls = classes.find(c => c.id === cancelTarget.classId);
    if (!cls) { toast.error('Class not found.'); return; }
    setCancelling(true);
    try {
      await clientCancelBooking(cancelTarget.id, cancelTarget.classId, cls.date, cls.time, cls);
      toast.success('Booking cancelled.');
      setCancelTarget(null);
    } catch (err) {
      if (err.message === 'WITHIN_24H') {
        toast.error('Cannot cancel within 24 hours of the class. Please contact the studio.');
      } else {
        toast.error('Failed to cancel. Please try again.');
      }
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div style={{ padding:'28px 32px 40px' }}>

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:22 }} className="hist-resp">
        {[
          { label:'Sessions Attended', val:attended,  color:'#4E6A2E', bg:'#EEF3E6' },
          { label:'Cancellations',     val:cancelled, color:'#7A6020', bg:'#F5F1E0' },
          { label:'No-shows',          val:noShow,    color:'#8C3A3A', bg:'#F7EDED' },
        ].map(s => (
          <div key={s.label} style={{ background:'#FAF7F2', borderRadius:14, padding:18, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)' }}>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'2rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{s.val}</div>
            <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.08em', color:'#9C8470', marginTop:5 }}>{s.label}</div>
            <div style={{ height:3, borderRadius:10, background:s.bg, border:`1px solid ${s.color}33`, marginTop:8 }}>
              <div style={{ height:3, borderRadius:10, background:s.color, width:`${(s.val / total) * 100}%` }}/>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:180 }}>
          <Search size={14} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'#9C8470' }}/>
          <input
            placeholder="Search class or trainer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={inp}
          />
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:'7px 13px', borderRadius:20, border:'1.5px solid', cursor:'pointer',
              fontSize:'0.78rem', fontWeight:500, fontFamily:"'DM Sans',sans-serif",
              background:    filter === f ? '#3D2314' : '#FAF7F2',
              color:         filter === f ? '#F5F0E8' : '#6B5744',
              borderColor:   filter === f ? '#3D2314' : '#E0D5C1',
              transition:'all 0.18s',
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* History list */}
      <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:'32px', textAlign:'center', color:'#9C8470', fontSize:'0.88rem' }}>Loading your history…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', color:'#9C8470', fontSize:'0.88rem' }}>No sessions match your filter.</div>
        ) : filtered.map((b, i) => {
          const cls  = getClass(b.classId);
          const st   = statusStyle(b.status);
          const { month, day } = formatDate(b.weekOf);
          return (
            <div key={b.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #E0D5C1':'none', transition:'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F0E8'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {/* Date */}
              <div style={{ textAlign:'center', minWidth:42, flexShrink:0 }}>
                <div style={{ fontSize:'0.65rem', textTransform:'uppercase', color:'#9C8470' }}>{month}</div>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.7rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{day}</div>
              </div>
              <div style={{ width:1.5, height:38, background:'#E0D5C1', flexShrink:0 }}/>
              {/* Class info */}
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:500, fontSize:'0.92rem', color:'#2A1A0E' }}>{cls?.name || 'Unknown class'}</div>
                <div style={{ fontSize:'0.78rem', color:'#9C8470', marginTop:2 }}>
                  {cls?.trainer || ''}{cls?.time ? ` · ${cls.time}` : ''}
                </div>
              </div>
              {/* Cancel button — only for confirmed bookings */}
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                {b.status === 'confirmed' && (
                  <button onClick={() => setCancelTarget(b)}
                    style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:500, background:'#F7EDED', color:'#8C3A3A', border:'1px solid #DDB0B0', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                )}
                <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:500, background:st.bg, color:st.color, textTransform:'capitalize' }}>
                  {b.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel Confirm Dialog */}
      {cancelTarget && (() => {
        const cls = classes.find(c => c.id === cancelTarget.classId);
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'#FAF7F2', borderRadius:16, maxWidth:360, width:'100%', padding:24, border:'1px solid #E0D5C1', boxShadow:'0 8px 32px rgba(61,35,20,0.18)' }}>
              <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.25rem', fontWeight:500, color:'#3D2314', marginBottom:10 }}>Cancel Booking?</div>
              <div style={{ fontSize:'0.88rem', color:'#6B5744', marginBottom:6, lineHeight:1.5 }}>
                Are you sure you want to cancel <strong>{cls?.name}</strong>?
              </div>
              <div style={{ background:'#EEF3E6', border:'1px solid #C8D9B0', borderRadius:8, padding:'9px 13px', fontSize:'0.8rem', color:'#4E6A2E', marginBottom:20 }}>
                ℹ️ Cancellations are not allowed within 24 hours of the class start time.
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setCancelTarget(null)} style={{ flex:1, padding:'11px', background:'#F5F0E8', border:'1.5px solid #E0D5C1', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#6B5744' }}>
                  Keep Booking
                </button>
                <button onClick={handleCancel} disabled={cancelling} style={{ flex:1, padding:'11px', background:'#8C3A3A', color:'#F5F0E8', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', fontWeight:500, opacity: cancelling ? 0.6 : 1 }}>
                  {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`@media(max-width:700px){.hist-resp{grid-template-columns:1fr!important;}}`}</style>
    </div>
  );
}