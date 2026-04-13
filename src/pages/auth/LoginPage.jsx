import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';

// Lotus/dumbbell icon (inline SVG matching original)
function LogoIcon() {
  return (
<img 
      src="/logo.jpeg" 
      alt="Company Logo" 
      width={26} 
      height={26} 
    />
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      // Redirect based on role
      if (user.role === 'admin')   navigate('/admin');
      else if (user.role === 'trainer') navigate('/trainer/schedule');
      else navigate('/client');
    } catch (err) {
      toast.error(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F0E8', position: 'relative', overflow: 'hidden' }}>
      {/* Background circles */}
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: '#EDE6D6', opacity: 0.7, top: -120, right: -100 }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: '#C4AE8F', opacity: 0.25, bottom: -80, left: -60 }} />

      {/* Card */}
      <div className="animate-fade-up" style={{
        background: '#FAF7F2', borderRadius: 22, boxShadow: '0 8px 32px rgba(61,35,20,0.14)',
        padding: '52px 48px', width: 420, maxWidth: '95vw',
        position: 'relative', zIndex: 2, border: '1px solid #E0D5C1',
      }}>
        {/* Logo */}
<div style={{ textAlign: 'center', marginBottom: 32 }}>
  <div style={{ 
    width: 56, 
    height: 56, 
    background: '#3D2314', 
    borderRadius: '50%', 
    display: 'inline-flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 12,
    overflow: 'hidden' // Important: keeps the logo inside the circle
  }}>
    <img 
      src="/logo.svg" 
      alt="Logo" 
      style={{ 
        width: '100%', 
        height: '100%', 
        objectFit: 'cover' // Use 'contain' if the logo is getting cut off
      }} 
    />
  </div>
  <h1 style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '2rem', fontWeight: 500, color: '#3D2314', letterSpacing: '0.01em' }}>
    Pilates Vibes
  </h1>
  <p style={{ fontSize: '0.8rem', color: '#9C8470', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
    Pilates &amp; Wellness
  </p>
</div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <FieldGroup label="Email">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </FieldGroup>

          <FieldGroup label="Password">
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </FieldGroup>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 14, background: loading ? '#6B3D25' : '#3D2314',
              color: '#F5F0E8', border: 'none', borderRadius: 8,
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.95rem', fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
              marginTop: 6, transition: 'all var(--transition)',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        

        {/* Register link */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.82rem', color: '#9C8470' }}>
          New here?{' '}
          <Link to="/register" style={{ color: '#A0673A', textDecoration: 'none', fontWeight: 500 }}>
            Create an account
          </Link>
          {' · '}
        </p>
      </div>
    </div>
  );
}

// Reusable field group
function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: '#6B5744', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>
        {label}
      </label>
      {/* Clone child input with shared styles */}
      <div style={{ position: 'relative' }}>
        {children}
      </div>
      <style>{`
        div input, div select {
          width: 100%; padding: 12px 15px;
          border: 1.5px solid #E0D5C1; border-radius: 8px;
          background: #F5F0E8; font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem; color: #2A1A0E; outline: none;
          transition: border-color var(--transition);
        }
        div input:focus, div select:focus { border-color: #A0673A; }
      `}</style>
    </div>
  );
}