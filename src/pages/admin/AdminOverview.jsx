import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, DollarSign, Star, AlertTriangle, Clock, ChevronRight, Check, X } from 'lucide-react';
import { useClients } from '../../hooks/useClients';
import { useClasses } from '../../hooks/useClasses';
import { useAttendance } from '../../hooks/useAttendance';
import { useBookings } from '../../hooks/useBookings';
import { format, addDays, startOfWeek } from 'date-fns';
// ── Helpers ──────────────────────────────────────────────────
function fmt12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

// ── Sub-components ───────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div style={{ background: '#FAF7F2', borderRadius: 14, padding: 20, border: '1px solid #E0D5C1', boxShadow: '0 2px 16px rgba(61,35,20,0.10)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C8470' }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '2rem', fontWeight: 500, color: '#3D2314', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: '#7C8C5E', marginTop: 5 }}>{sub}</div>
    </div>
  );
}

function AlertBanner({ type, message }) {
  const styles = {
    urgent:  { bg: '#F7EDED', border: '#DDB0B0', color: '#8C3A3A' },
    warning: { bg: '#F5F1E0', border: '#DDD0A0', color: '#7A6020' },
    info:    { bg: '#EEF3E6', border: '#C8D9B0', color: '#4E6A2E' },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      <AlertTriangle size={15} style={{ flexShrink: 0 }} />
      <span dangerouslySetInnerHTML={{ __html: message }} />
    </div>
  );
}

function Card({ title, children, action, onAction }) {
  return (
    <div style={{ background: '#FAF7F2', borderRadius: 14, boxShadow: '0 2px 16px rgba(61,35,20,0.10)', padding: 22, border: '1px solid #E0D5C1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.15rem', fontWeight: 500, color: '#3D2314' }}>{title}</span>
        {action && (
          <button onClick={onAction} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#A0673A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            {action} <ChevronRight size={13} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function AdminOverview() {
  const navigate = useNavigate();
  const today    = todayStr();
  const todayDay = (new Date().getDay() + 6) % 7; // 0 = Monday

  const { clients }                      = useClients();
  const { classes }                      = useClasses();
  const { attendance, logAttendance }    = useAttendance({ date: today });
  const { waitlist }                     = useBookings();

  // ── Derived stats ────────────────────────────────────────
  const activeMembers  = clients.filter(c => c.status === 'active' && !c.isFrozen).length;
const weekStart      = startOfWeek(new Date(), { weekStartsOn: 1 });
const todayClasses   = classes.filter(c => {
  if (c.day !== todayDay) return false;
  const expectedDate = format(addDays(weekStart, c.day), 'yyyy-MM-dd');
  if (c.date && c.date !== expectedDate) return false;
  return true;
});
const sessionsToday  = todayClasses.length;
const now            = new Date();
const currentHour    = now.getHours() + now.getMinutes() / 60;
const remainingToday = todayClasses.filter(c => {
  const [h, m] = c.time.split(':').map(Number);
  return h + m / 60 > currentHour;
}).length;

  // ── Alerts: low sessions + low attendance classes ────────
  const lowSessionClients = clients.filter(c =>
    c.sessionsRemaining !== null && c.sessionsRemaining !== undefined && c.sessionsRemaining <= 2
  );
  const lowAttendanceClasses = todayClasses.filter(c => c.booked <= 2 && c.booked > 0);

  const alerts = [
    ...lowSessionClients.length > 0 ? [{
      type: 'urgent',
      message: `<strong>${lowSessionClients.map(c => c.name).join('</strong> &amp; <strong>')}</strong> ${lowSessionClients.length === 1 ? 'has' : 'have'} only ${lowSessionClients.length === 1 ? lowSessionClients[0].sessionsRemaining : '≤2'} session(s) left — action needed.`,
    }] : [],
    ...lowAttendanceClasses.map(c => ({
      type: 'warning',
      message: `${fmt12(c.time)} ${c.name} has only ${c.booked} participant${c.booked === 1 ? '' : 's'} — consider cancellation.`,
    })),
  ];

  // ── Today's attendance records ───────────────────────────
  // Build a flat list: for each today class × each booked client
  const todayAttendanceRows = attendance.map(a => {
    const cls    = classes.find(c => c.id === a.classId);
    const client = clients.find(c => c.id === a.clientId);
    return {
      id:       a.id,
      classId:  a.classId,
      clientId: a.clientId,
      name:     client?.name  || a.clientName || 'Unknown',
      class:    cls ? `${cls.name} ${fmt12(cls.time)}` : '—',
      status:   a.status || 'pending',
    };
  });

  async function toggleAttendance(row) {
    const next = row.status === 'attended' ? 'no-show' : 'attended';
    await logAttendance(row.classId, row.clientId, today, next);
  }

  // ── Upcoming classes (after now) ─────────────────────────
  const upcomingClasses = todayClasses
    .filter(c => {
      const [h, m] = c.time.split(':').map(Number);
      return h + m / 60 > currentHour;
    })
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 5);

  // ── Waitlist (first 3) ───────────────────────────────────
  const waitlistRows = waitlist.slice(0, 3).map(w => {
    const cls    = classes.find(c => c.id === w.classId);
    const client = clients.find(c => c.id === w.clientId);
    // Time remaining for notified person
    let timer = null;
    if (w.status === 'notified' && w.confirmBy) {
      const msLeft = new Date(w.confirmBy) - new Date();
      if (msLeft > 0) {
        const minsLeft = Math.round(msLeft / 60000);
        timer = `${minsLeft} min left`;
      }
    }
    return {
      id:       w.id,
      name:     client?.name || 'Unknown',
      class:    cls ? `${cls.name} ${fmt12(cls.time)}` : '—',
      position: w.position,
      timer,
    };
  });

  return (
    <div style={{ padding: '28px 32px 40px' }}>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }} className="stats-resp">
        {[
          { label: 'Active Members',   value: activeMembers || '—',   sub: `${clients.length} total clients`,  icon: Users,      color: '#7C8C5E' },
          { label: 'Sessions Today',   value: sessionsToday || '—',   sub: `${remainingToday} remaining`,      icon: Calendar,   color: '#A0673A' },
          { label: 'Low Sessions',     value: lowSessionClients.length || '0', sub: 'clients need renewal',   icon: DollarSign, color: '#3D2314' },
          { label: 'Frozen',           value: clients.filter(c => c.isFrozen).length || '0', sub: 'subscriptions paused', icon: Star, color: '#C4AE8F' },
        ].map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          {alerts.map((a, i) => <AlertBanner key={i} {...a} />)}
        </div>
      )}

      {/* Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="two-resp">

        {/* Today's Attendance */}
        <Card title="Today's Attendance" action="Full log" onAction={() => navigate('/admin/attendance')}>
          {todayAttendanceRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#C4AE8F', fontSize: '0.85rem' }}>
              No attendance records yet for today.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Client', 'Class', 'Status'].map(h => (
                      <th key={h} style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C8470', padding: '8px 10px', textAlign: 'left', borderBottom: '1.5px solid #E0D5C1', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todayAttendanceRows.map((a, i) => (
                    <tr key={a.id || i} onClick={() => toggleAttendance(a)} style={{ cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F5F0E8'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 10px', fontSize: '0.88rem', color: '#2A1A0E', borderBottom: '1px solid #E0D5C1' }}>{a.name}</td>
                      <td style={{ padding: '10px 10px', fontSize: '0.82rem', color: '#9C8470', borderBottom: '1px solid #E0D5C1' }}>{a.class}</td>
                      <td style={{ padding: '10px 10px', borderBottom: '1px solid #E0D5C1' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 500,
                          background: a.status === 'attended' ? '#EEF3E6' : a.status === 'no-show' ? '#F7EDED' : '#F5F0E8',
                          color: a.status === 'attended' ? '#4E6A2E' : a.status === 'no-show' ? '#8C3A3A' : '#9C8470',
                        }}>
                          {a.status === 'attended' ? <Check size={11} /> : a.status === 'no-show' ? <X size={11} /> : <Clock size={11} />}
                          {a.status === 'attended' ? 'Attended' : a.status === 'no-show' ? 'No-show' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Upcoming Classes */}
        <Card title="Today's Remaining Classes" action="Full schedule" onAction={() => navigate('/admin/schedule')}>
          {upcomingClasses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#C4AE8F', fontSize: '0.85rem' }}>No more classes today.</div>
          ) : upcomingClasses.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < upcomingClasses.length - 1 ? '1px solid #E0D5C1' : 'none' }}>
              <div style={{ textAlign: 'center', minWidth: 48 }}>
                <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.1rem', fontWeight: 500, color: '#3D2314' }}>{fmt12(c.time).split(' ')[0]}</div>
                <div style={{ fontSize: '0.65rem', color: '#9C8470' }}>{fmt12(c.time).split(' ')[1]}</div>
              </div>
              <div style={{ width: 1.5, height: 36, background: '#E0D5C1', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.92rem', color: '#2A1A0E' }}>{c.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#9C8470', marginTop: 2 }}>{c.trainer} · {c.booked} participants</div>
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 500,
                background: c.status === 'full' ? '#F5EDE8' : '#EEF3E6',
                color: c.status === 'full' ? '#8C4A2A' : '#4E6A2E',
              }}>
                {c.status === 'full' ? 'Full' : 'Available'}
              </span>
            </div>
          ))}
        </Card>
      </div>

      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="two-resp">

        {/* Waitlist */}
        <Card title="Active Waitlist">
          {waitlistRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#C4AE8F', fontSize: '0.85rem' }}>No active waitlist entries.</div>
          ) : waitlistRows.map((w, i) => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < waitlistRows.length - 1 ? '1px solid #E0D5C1' : 'none' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#3D2314', color: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                {w.position}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#2A1A0E' }}>{w.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#9C8470', marginTop: 1 }}>{w.class}</div>
              </div>
              {w.timer && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600, color: '#8C4A2A', background: '#F5EDE8', padding: '3px 8px', borderRadius: 20 }}>
                  <Clock size={11} /> {w.timer}
                </span>
              )}
            </div>
          ))}
        </Card>

        {/* Quick Actions */}
        <Card title="Quick Actions">
          {[
            { label: 'Create a Booking', bg: '#3D2314', color: '#F5F0E8', border: 'none',    path: '/admin/schedule' },
            { label: 'Add New Client',   bg: '#FAF7F2', color: '#3D2314', border: '#E0D5C1', path: '/admin/clients'  },
            { label: 'Record Expense',   bg: '#FAF7F2', color: '#3D2314', border: '#E0D5C1', path: '/admin/finance'  },
            { label: 'Open POS / Shop',  bg: '#7C8C5E', color: '#FFFFFF', border: 'none',    path: '/admin/pos'      },
          ].map((btn, i) => (
            <button key={i} onClick={() => navigate(btn.path)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '12px 16px', marginBottom: i < 3 ? 8 : 0,
              background: btn.bg, color: btn.color,
              border: btn.border !== 'none' ? `1.5px solid ${btn.border}` : 'none',
              borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.88rem', fontWeight: 500, transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {btn.label} <ChevronRight size={15} />
            </button>
          ))}
        </Card>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .stats-resp { grid-template-columns: 1fr 1fr !important; }
          .two-resp   { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}