import { useState, useEffect, useRef } from 'react';
import { MessageSquare, AlertTriangle, Clock, Check, Bell, ShoppingBag } from 'lucide-react';
import { useClients } from '../../hooks/useClients';
import { useClasses } from '../../hooks/useClasses';
import { useBookings } from '../../hooks/useBookings';
import { db } from '../../firebase/config';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';

const TYPE_ICONS = {
  'low-sessions':   { icon: AlertTriangle, color:'#8C3A3A', bg:'#F7EDED' },
  'low-attendance': { icon: AlertTriangle, color:'#7A6020', bg:'#F5F1E0' },
  'expiry':         { icon: Clock,         color:'#7A6020', bg:'#F5F1E0' },
  'waitlist':       { icon: Clock,         color:'#3A5A8C', bg:'#EDF0F6' },
  'booking':        { icon: Check,         color:'#4E6A2E', bg:'#EEF3E6' },
  'unpaid':         { icon: ShoppingBag,   color:'#8C3A3A', bg:'#F7EDED' },
  'rating':         { icon: Bell,          color:'#7C8C5E', bg:'#EEF3E6' },
};

export default function AdminNotifications() {
  const { clients }  = useClients();
  const { classes }  = useClasses();
  const { bookings } = useBookings();
  const [readIds,    setReadIds]    = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pv_read_notifs') || '[]')); } catch { return new Set(); }
  });
  const [filter, setFilter] = useState('all');

  const today    = format(new Date(), 'yyyy-MM-dd');
  const todayDay = (new Date().getDay() + 6) % 7;

  // ── Build notifications from live data ────────────────────
  const notifications = [];

  // 1. Low sessions
  clients
    .filter(c => c.sessionsRemaining != null && c.sessionsRemaining <= 2 && c.sessionsRemaining > 0)
    .forEach(c => {
      notifications.push({
        id:     `low-${c.id}`,
        type:   'low-sessions',
        urgent: true,
        time:   new Date(),
        title:  `Low Sessions — ${c.name}`,
        body:   `${c.name} has only ${c.sessionsRemaining} session(s) remaining. Package expires ${c.expiry || 'soon'}.`,
        action: c.phone ? { label:`WhatsApp ${c.name.split(' ')[0]}`, msg:`Hi ${c.name}! You have ${c.sessionsRemaining} session(s) left on your Pilates Vibes package${c.expiry ? `, expiring ${c.expiry}` : ''}. Reach out to renew! 🌿`, phone: c.phone.replace(/\D/g,'') } : null,
      });
    });

  // 2. Unpaid packages
  clients
    .filter(c => !c.paymentVerified && c.pkg)
    .forEach(c => {
      notifications.push({
        id:     `unpaid-${c.id}`,
        type:   'unpaid',
        urgent: true,
        time:   new Date(),
        title:  `Payment Pending — ${c.name}`,
        body:   `${c.name} has not paid for their ${c.pkg} package (${c.paymentMethod || 'Cash/Whish'}).`,
        action: c.phone ? { label:`Remind ${c.name.split(' ')[0]}`, msg:`Hi ${c.name}! We noticed your payment for your Pilates Vibes package hasn't been confirmed. Please send your payment at your earliest convenience. Thank you! 🌿`, phone: c.phone.replace(/\D/g,'') } : null,
      });
    });

  // 3. Expiring soon (within 7 days)
  clients
    .filter(c => {
      if (!c.expiry) return false;
      const diff = (new Date(c.expiry) - new Date()) / 86400000;
      return diff >= 0 && diff <= 7;
    })
    .forEach(c => {
      notifications.push({
        id:     `expiry-${c.id}`,
        type:   'expiry',
        urgent: false,
        time:   new Date(),
        title:  `Expiring Soon — ${c.name}`,
        body:   `${c.name}'s ${c.pkg} expires on ${c.expiry}.`,
        action: c.phone ? { label:`Remind ${c.name.split(' ')[0]}`, msg:`Hi ${c.name}! Your Pilates Vibes package expires on ${c.expiry}. Reach out to renew! 🌿`, phone: c.phone.replace(/\D/g,'') } : null,
      });
    });

  // 4. Low attendance today (≤2 participants)
  classes
    .filter(c => c.day === todayDay && (c.booked || 0) <= 2 && (c.booked || 0) > 0)
    .forEach(c => {
      const [h, m] = c.time.split(':').map(Number);
      const fmt = `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
      notifications.push({
        id:     `low-att-${c.id}`,
        type:   'low-attendance',
        urgent: true,
        time:   new Date(),
        title:  `Low Attendance — ${fmt} ${c.name}`,
        body:   `${c.name} with ${c.trainer} has only ${c.booked} participant${c.booked===1?'':'s'} today. 24hrs notice required to cancel.`,
        action: null,
      });
    });

  // 5. Recent new bookings (today)
  const todayBookings = bookings.filter(b => {
    if (!b.createdAt?.toDate) return false;
    return format(b.createdAt.toDate(), 'yyyy-MM-dd') === today && b.status === 'confirmed';
  });
  if (todayBookings.length > 0) {
    notifications.push({
      id:     `bookings-today`,
      type:   'booking',
      urgent: false,
      time:   new Date(),
      title:  `${todayBookings.length} New Booking${todayBookings.length > 1 ? 's' : ''} Today`,
      body:   `${todayBookings.length} booking${todayBookings.length > 1 ? 's were' : ' was'} confirmed today.`,
      action: null,
    });
  }

  // 6. Pending payments from bookings
  const pendingPaymentBookings = bookings.filter(b => b.paymentStatus === 'pending' && b.status === 'confirmed');
  pendingPaymentBookings.forEach(b => {
    const client = clients.find(c => c.id === b.clientId);
    if (client) {
      notifications.push({
        id:     `pending-pay-${b.id}`,
        type:   'unpaid',
        urgent: true,
        time:   b.createdAt?.toDate ? b.createdAt.toDate() : new Date(),
        title:  `Pending Payment — ${client.name}`,
        body:   `${client.name} booked a session but payment (${b.paymentMethod || 'Cash'}) is not yet confirmed.`,
        action: client.phone ? { label:`WhatsApp ${client.name.split(' ')[0]}`, msg:`Hi ${client.name}! Please confirm your payment for your upcoming session at Pilates Vibes. Thank you! 🌿`, phone: client.phone.replace(/\D/g,'') } : null,
      });
    }
  });

  // Sort urgent first
  notifications.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));

  // ── Notification sound (Web Audio API — no sound file needed) ──
  function playChime() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      [[520, 0, 0.18], [660, 0.2, 0.22]].forEach(([freq, start, duration]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      });
    } catch (e) {
      // silently ignore if AudioContext unavailable
    }
  }

  // Track previous unread count — chime only when count increases
  const prevUnreadRef = useRef(0);
  useEffect(() => {
    const currentUnread = notifications.filter(n => !readIds.has(n.id)).length;
    if (currentUnread > prevUnreadRef.current) playChime();
    prevUnreadRef.current = currentUnread;
  }, [notifications.length, readIds.size]);

  function markRead(id) {
    setReadIds(prev => {
      const next = new Set([...prev, id]);
      localStorage.setItem('pv_read_notifs', JSON.stringify([...next]));
      return next;
    });
  }

  function markAllRead() {
    const allIds = notifications.map(n => n.id);
    setReadIds(prev => {
      const next = new Set([...prev, ...allIds]);
      localStorage.setItem('pv_read_notifs', JSON.stringify([...next]));
      return next;
    });
  }

  const unread   = notifications.filter(n => !readIds.has(n.id)).length;
  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !readIds.has(n.id);
    if (filter === 'urgent') return n.urgent;
    return true;
  });

  return (
    <div style={{ padding:'28px 32px 40px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', gap:6 }}>
          {[['all','All'],['unread','Unread'],['urgent','Urgent']].map(([val,label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{ padding:'7px 14px', borderRadius:20, border:'1.5px solid', cursor:'pointer', fontSize:'0.78rem', fontWeight:500, fontFamily:"'DM Sans',sans-serif", background: filter===val ? '#3D2314':'#FAF7F2', color: filter===val ? '#F5F0E8':'#6B5744', borderColor: filter===val ? '#3D2314':'#E0D5C1', transition:'all 0.18s' }}>
              {label}{val==='unread' && unread > 0 ? ` (${unread})` : ''}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} style={{ fontSize:'0.8rem', color:'#A0673A', background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Mark all as read
          </button>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.map(n => {
          const isRead   = readIds.has(n.id);
          const typeInfo = TYPE_ICONS[n.type] || TYPE_ICONS['booking'];
          const Icon     = typeInfo.icon;
          return (
            <div key={n.id} onClick={() => markRead(n.id)}
              style={{ background:'#FAF7F2', borderRadius:12, border:`1.5px solid ${isRead ? '#E0D5C1' : n.urgent ? '#DDB0B0':'#C8D9B0'}`, padding:'16px 18px', cursor: isRead ? 'default':'pointer', boxShadow: isRead ? 'none':'0 2px 12px rgba(61,35,20,0.08)', opacity: isRead ? 0.75 : 1, transition:'all 0.18s' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:typeInfo.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                  <Icon size={15} color={typeInfo.color}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontWeight:500, fontSize:'0.92rem', color:'#2A1A0E' }}>{n.title}</span>
                    {!isRead && <span style={{ width:7, height:7, borderRadius:'50%', background:'#C0412A', display:'inline-block', flexShrink:0 }}/>}
                    {n.urgent && <span style={{ fontSize:'0.68rem', padding:'1px 7px', borderRadius:20, background:'#F7EDED', color:'#8C3A3A', fontWeight:500 }}>Urgent</span>}
                  </div>
                  <p style={{ fontSize:'0.83rem', color:'#6B5744', marginBottom: n.action ? 10 : 0, lineHeight:1.5 }}>{n.body}</p>
                  {n.action && (
                    <a href={`https://wa.me/${n.action.phone}?text=${encodeURIComponent(n.action.msg)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', background:'#F0FAF4', border:'1.5px solid #B8DFC8', borderRadius:8, color:'#1A5C35', textDecoration:'none', fontSize:'0.8rem', fontWeight:500, fontFamily:"'DM Sans',sans-serif", transition:'opacity 0.18s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity='0.8'}
                      onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                      <MessageSquare size={13}/> {n.action.label}
                    </a>
                  )}
                </div>
                <span style={{ fontSize:'0.72rem', color:'#9C8470', flexShrink:0, marginTop:2 }}>
                  {n.time ? formatDistanceToNow(n.time, { addSuffix: true }) : ''}
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 0', color:'#9C8470', fontSize:'0.88rem' }}>
            <Bell size={28} color='#E0D5C1' style={{ marginBottom:10, display:'block', margin:'0 auto 10px' }}/>
            {notifications.length === 0 ? 'All clear — no alerts right now.' : 'No notifications match this filter.'}
          </div>
        )}
      </div>
    </div>
  );
}