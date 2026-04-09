import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';

function LogoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#F5F0E8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={26} height={26}>
      <path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/>
    </svg>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [form, setForm] = useState({ name:'', phone:'', dob:'', email:'', password:'', confirm:'' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim())              return toast.error('Please enter your full name.');
    if (!form.phone.trim())             return toast.error('Please enter your phone number.');
    if (form.password.length < 6)       return toast.error('Password must be at least 6 characters.');
    if (form.password !== form.confirm) return toast.error('Passwords do not match.');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name.trim(), form.phone.trim(), form.dob);
      toast.success('Welcome to Pilates Vibes!');
      navigate('/client');
    } catch (err) {
      const msg =
        err.code === 'auth/email-already-in-use' ? 'This email is already registered. Try logging in.' :
        err.code === 'auth/invalid-email'         ? 'Please enter a valid email address.' :
        err.code === 'auth/weak-password'         ? 'Password must be at least 6 characters.' :
        err.message || 'Registration failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F5F0E8', position:'relative', overflow:'hidden', padding:'24px 0' }}>
      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'#EDE6D6', opacity:0.7, top:-120, right:-100 }} />
      <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:'#C4AE8F', opacity:0.25, bottom:-80, left:-60 }} />
      <div style={{ background:'#FAF7F2', borderRadius:22, boxShadow:'0 8px 32px rgba(61,35,20,0.14)', padding:'52px 48px', width:420, maxWidth:'95vw', position:'relative', zIndex:2, border:'1px solid #E0D5C1' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:56, height:56, background:'#3D2314', borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}><LogoIcon /></div>
          <h1 style={{ fontFamily:"'Cormorant Garant', serif", fontSize:'2rem', fontWeight:500, color:'#3D2314', letterSpacing:'0.01em' }}>Create Account</h1>
          <p style={{ fontSize:'0.8rem', color:'#9C8470', letterSpacing:'0.12em', textTransform:'uppercase', marginTop:2 }}>Pilates Vibes · Wellness</p>
        </div>
        <form onSubmit={handleSubmit}>
          {[
            { label:'Full Name',        key:'name',     type:'text',     placeholder:'e.g. Nour Haddad',    required:true  },
            { label:'Phone (WhatsApp)', key:'phone',    type:'tel',      placeholder:'+961 70 000 000',     required:true  },
            { label:'Date of Birth',    key:'dob',      type:'date',     placeholder:'',                    required:false },
            { label:'Email',            key:'email',    type:'email',    placeholder:'your@email.com',      required:true  },
            { label:'Password',         key:'password', type:'password', placeholder:'Min. 6 characters',   required:true  },
            { label:'Confirm Password', key:'confirm',  type:'password', placeholder:'Repeat your password',required:true  },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:18 }}>
              <label style={{ display:'block', fontSize:'0.78rem', fontWeight:500, color:'#6B5744', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:7 }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e => set(f.key, e.target.value)} required={f.required}
                style={{ width:'100%', padding:'12px 15px', boxSizing:'border-box', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#F5F0E8', fontFamily:"'DM Sans', sans-serif", fontSize:'0.95rem', color:'#2A1A0E', outline:'none' }}/>
            </div>
          ))}
          <button type="submit" disabled={loading} style={{ width:'100%', padding:14, background: loading ? '#6B3D25':'#3D2314', color:'#F5F0E8', border:'none', borderRadius:8, fontFamily:"'DM Sans', sans-serif", fontSize:'0.95rem', fontWeight:500, cursor: loading ? 'not-allowed':'pointer', letterSpacing:'0.04em', marginTop:6, transition:'all 0.2s' }}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p style={{ textAlign:'center', marginTop:24, fontSize:'0.82rem', color:'#9C8470' }}>
          Already have an account?{' '}<Link to="/login" style={{ color:'#A0673A', textDecoration:'none', fontWeight:500 }}>Sign in</Link>
        </p>
        <p style={{ textAlign:'center', marginTop:10, fontSize:'0.74rem', color:'#C4AE8F', lineHeight:1.5 }}>
          Already added by admin? Register with the same phone number to link your account automatically.
        </p>
      </div>
    </div>
  );
}