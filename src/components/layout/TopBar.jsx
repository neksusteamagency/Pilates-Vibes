import { useLocation, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

// Map routes to page titles
const TITLES = {
  '/admin':               'Overview',
  '/admin/schedule':      'Schedule',
  '/admin/clients':       'Clients',
  '/admin/trainers':      'Trainers',
  '/admin/finance':       'Finance',
  '/admin/pos':           'POS / Shop',
  '/admin/attendance':    'Attendance',
  '/admin/reports':       'Reports',
  '/admin/notifications': 'Notifications',
  '/client':              'My Dashboard',
  '/client/book':         'Book a Class',
  '/client/history':      'Session History',
  '/client/freeze':       'Manage Subscription',
  '/trainer/schedule':    'My Schedule',
  '/trainer/ratings':     'My Ratings',
  '/trainer':             'My Schedule',
};

export default function TopBar() {
  const { user, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const title = TITLES[location.pathname] || 'Pilates Vibes';
  const notifPath = role === 'admin' ? '/admin/notifications' : null;

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 32px', background: '#FAF7F2',
      borderBottom: '1px solid #E0D5C1', flexShrink: 0,
    }}>
      {/* Title */}
      <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.1rem', color: '#3D2314' }}>
        {title}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Bell */}
        {notifPath && (
          <button
            onClick={() => navigate(notifPath)}
            style={{ width: 34, height: 34, borderRadius: '50%', background: '#F5F0E8', border: '1.5px solid #E0D5C1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: 'all var(--transition)' }}
          >
            <Bell size={16} color="#6B5744" />
            <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: '#C0412A' }} />
          </button>
        )}

        {/* User chip */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#FAF7F2', border: '1.5px solid #E0D5C1', borderRadius: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#A0673A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 600, color: '#F5F0E8' }}>
              {user.avatar || user.name?.slice(0,2).toUpperCase()}
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#2A1A0E' }}>{user.name}</span>
          </div>
        )}
      </div>
    </header>
  );
}