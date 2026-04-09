import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Users, DollarSign,
  ShoppingBag, ClipboardList, Star, Bell, FileText
} from 'lucide-react';

const NAV = {
  admin: [
    { to: '/admin',               label: 'Overview',      icon: LayoutDashboard, end: true },
    { to: '/admin/schedule',      label: 'Schedule',      icon: Calendar },
    { to: '/admin/clients',       label: 'Clients',       icon: Users },
    { to: '/admin/trainers',      label: 'Trainers',      icon: Star },
    { to: '/admin/finance',       label: 'Finance',       icon: DollarSign },
    { to: '/admin/pos',           label: 'POS / Shop',    icon: ShoppingBag },
    { to: '/admin/attendance',    label: 'Attendance',    icon: ClipboardList },
    { to: '/admin/reports',       label: 'Reports',       icon: FileText },
    { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  ],
  client: [
    { to: '/client',           icon: LayoutDashboard, label: 'Home',    end: true },
    { to: '/client/book',      icon: Calendar,        label: 'Book' },
    { to: '/client/history',   icon: ClipboardList,   label: 'History' },
  ],
  trainer: [
    { to: '/trainer/schedule', icon: Calendar, label: 'Schedule' },
  ],
};

export default function MobileNav({ role }) {
  const items = NAV[role] || [];

  return (
    <nav
      className="md:hidden flex mobile-nav"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#FAF7F2', borderTop: '1.5px solid #E0D5C1',
        zIndex: 100,
        flexWrap: 'nowrap',               // ← one single row
        overflowX: 'auto',                // ← horizontal scroll
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch', // ← smooth on iOS
        scrollbarWidth: 'none',           // ← hide scrollbar Firefox
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              flexShrink: 0,              // ← don't shrink
              flexGrow: 0,               // ← don't grow
              minWidth: 64,              // ← fixed width per item
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '10px 8px',
              cursor: 'pointer',
              textDecoration: 'none',
              color: isActive ? '#3D2314' : '#9C8470',
              fontSize: '0.62rem',
            })}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}