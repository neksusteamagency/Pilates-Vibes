import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, Calendar, Users, Star, DollarSign,
  ShoppingBag, Bell, FileText, ClipboardList, LogOut,
} from 'lucide-react';

// ── Nav config per role ──────────────────────────────────
const NAV = {
  admin: [
    { to: '/admin',              label: 'Overview',       icon: LayoutDashboard, end: true },
    { to: '/admin/schedule',     label: 'Schedule',       icon: Calendar },
    { to: '/admin/clients',      label: 'Clients',        icon: Users },
    { to: '/admin/trainers',     label: 'Trainers',       icon: Star },
    { to: '/admin/finance',      label: 'Finance',        icon: DollarSign },
    { to: '/admin/pos',          label: 'POS / Shop',     icon: ShoppingBag },
    { to: '/admin/attendance',   label: 'Attendance',     icon: ClipboardList },
    { to: '/admin/reports',      label: 'Reports',        icon: FileText },
    { to: '/admin/notifications',label: 'Notifications',  icon: Bell, badge: true },
  ],
  client: [
    { to: '/client',         label: 'My Dashboard', icon: LayoutDashboard, end: true },
    { to: '/client/book',    label: 'Book a Class', icon: Calendar },
    { to: '/client/history', label: 'My History',   icon: ClipboardList },
  ],
  trainer: [
    { to: '/trainer/schedule', label: 'My Schedule', icon: Calendar },
  ],
};

const ROLE_LABEL = {
  admin:   'Admin Portal',
  client:  'Member',
  trainer: 'Instructor',
};

export default function Sidebar({ role }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = NAV[role] || [];

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside
      className="hidden md:flex flex-col flex-shrink-0 overflow-y-auto"
      style={{ width: 'var(--sidebar-w)', background: '#3D2314', color: '#F5F0E8' }}
    >
      {/* Header */}
      <div style={{ padding: '28px 22px 20px', borderBottom: '1px solid rgba(245,240,232,0.12)' }}>
        <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.35rem', fontWeight: 500, color: '#F5F0E8', lineHeight: 1.2 }}>
          Pilates <br /> Vibes
        </div>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#C4AE8F', marginTop: 4 }}>
          {ROLE_LABEL[role]}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '18px 0' }}>
        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(245,240,232,0.4)', padding: '14px 22px 6px' }}>
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '10px 22px', cursor: 'pointer', textDecoration: 'none',
                fontSize: '0.88rem', fontWeight: isActive ? 500 : 400,
                color: isActive ? '#F5F0E8' : 'rgba(245,240,232,0.72)',
                background: isActive ? 'rgba(245,240,232,0.12)' : 'transparent',
                borderLeft: `3px solid ${isActive ? '#C4AE8F' : 'transparent'}`,
                transition: 'all var(--transition)',
              })}
              onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) { e.currentTarget.style.background = 'rgba(245,240,232,0.07)'; e.currentTarget.style.color = '#F5F0E8'; }}}
              onMouseLeave={e => { if (!e.currentTarget.getAttribute('aria-current')) { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; }}}
            >
              <Icon size={17} style={{ opacity: 0.8, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.label}</span>

            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '18px 22px', borderTop: '1px solid rgba(245,240,232,0.12)' }}>
        {/* User info */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#A0673A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, color: '#F5F0E8', flexShrink: 0 }}>
              {user.avatar || user.name?.slice(0,2).toUpperCase()}
            </div>
            <span style={{ fontSize: '0.82rem', color: 'rgba(245,240,232,0.8)', fontWeight: 500 }}>{user.name}</span>
          </div>
        )}
        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'rgba(245,240,232,0.55)', fontSize: '0.84rem', cursor: 'pointer', background: 'none', border: 'none', transition: 'color var(--transition)', padding: 0, fontFamily: "'DM Sans', sans-serif" }}
          onMouseEnter={e => e.currentTarget.style.color = '#F5F0E8'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(245,240,232,0.55)'}
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}