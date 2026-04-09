import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

// Layouts
import AppLayout from './components/layout/AppLayout';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Guest
import GuestBookingPage from './pages/guest/GuestBookingPage';

// Admin pages
import AdminOverview    from './pages/admin/AdminOverview';
import AdminSchedule    from './pages/admin/AdminSchedule';
import AdminClients     from './pages/admin/AdminClients';
import AdminTrainers    from './pages/admin/AdminTrainers';
import AdminFinance     from './pages/admin/AdminFinance';
import AdminPOS         from './pages/admin/AdminPOS';
import AdminNotifications from './pages/admin/AdminNotifications';
import AdminReports     from './pages/admin/AdminReports';
import AdminAttendance  from './pages/admin/AdminAttendance';

// Client pages
import ClientDashboard  from './pages/client/ClientDashboard';
import ClientBook       from './pages/client/ClientBook';
import ClientHistory    from './pages/client/ClientHistory';

// Trainer pages
import TrainerSchedule  from './pages/trainer/TrainerSchedule';

// ── Route guards ────────────────────────────────────
function RequireAuth({ children, allowedRoles }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-beige"><span className="font-serif text-brown text-xl">Loading…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/login" replace />;
  return children;
}

// ────────────────────────────────────────────────────
export default function App() {
  const { role } = useAuth();

  // Default redirect after login based on role
  const defaultPath = role === 'admin' ? '/admin' : role === 'trainer' ? '/trainer/schedule' : '/client';

  return (
    <Routes>
      {/* Public */}
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/book"     element={<GuestBookingPage />} />

      {/* Admin */}
      <Route path="/admin" element={
        <RequireAuth allowedRoles={['admin']}>
          <AppLayout role="admin" />
        </RequireAuth>
      }>
        <Route index                 element={<AdminOverview />} />
        <Route path="schedule"       element={<AdminSchedule />} />
        <Route path="clients"        element={<AdminClients />} />
        <Route path="trainers"       element={<AdminTrainers />} />
        <Route path="finance"        element={<AdminFinance />} />
        <Route path="pos"            element={<AdminPOS />} />
        <Route path="notifications"  element={<AdminNotifications />} />
        <Route path="reports"        element={<AdminReports />} />
        <Route path="attendance"     element={<AdminAttendance />} />
      </Route>

      {/* Client */}
      <Route path="/client" element={
        <RequireAuth allowedRoles={['client']}>
          <AppLayout role="client" />
        </RequireAuth>
      }>
        <Route index             element={<ClientDashboard />} />
        <Route path="book"       element={<ClientBook />} />
        <Route path="history"    element={<ClientHistory />} />
      </Route>

      {/* Trainer */}
      <Route path="/trainer" element={
        <RequireAuth allowedRoles={['trainer']}>
          <AppLayout role="trainer" />
        </RequireAuth>
      }>
        <Route index             element={<TrainerSchedule />} />
        <Route path="schedule"   element={<TrainerSchedule />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to={role ? defaultPath : '/login'} replace />} />
    </Routes>
  );
}