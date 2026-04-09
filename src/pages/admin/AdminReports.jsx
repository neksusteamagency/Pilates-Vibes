import { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { Star, TrendingUp, Users, Award, DollarSign, ShoppingBag } from 'lucide-react';
import { useStats } from '../../hooks/useStats';
import { useClients } from '../../hooks/useClients';
import { useTrainers } from '../../hooks/useTrainers';
import { format } from 'date-fns';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#FAF7F2', border:'1px solid #E0D5C1', borderRadius:8, padding:'10px 14px', fontSize:'0.82rem', boxShadow:'0 2px 12px rgba(61,35,20,0.10)' }}>
      <div style={{ fontWeight:600, color:'#3D2314', marginBottom:4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color:'#6B5744' }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name !== 'rate' ? `$${p.value.toLocaleString()}` : p.value}{p.name === 'rate' ? '%' : ''}</strong>
        </div>
      ))}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:'20px 22px' }}>
      <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.15rem', fontWeight:500, color:'#3D2314', marginBottom:18 }}>{title}</div>
      {children}
    </div>
  );
}

function Stars({ rating }) {
  return (
    <span style={{ display:'inline-flex', gap:2 }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={12} fill={i <= Math.round(rating) ? '#C4893A':'none'} color={i <= Math.round(rating) ? '#C4893A':'#D4C4B0'} strokeWidth={1.5}/>
      ))}
    </span>
  );
}

const PACKAGE_COLORS = ['#3D2314','#A0673A','#7C8C5E','#C4AE8F'];

export default function AdminReports() {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const { stats, loading, fetchStats } = useStats();
  const { clients }  = useClients();
  const { trainers } = useTrainers();

  useEffect(() => { fetchStats(currentMonth); }, [currentMonth]);

  // Package distribution from real clients
  const pkgCounts = clients.reduce((acc, c) => {
    if (c.pkg) acc[c.pkg] = (acc[c.pkg] || 0) + 1;
    return acc;
  }, {});
  const packageSplit = Object.entries(pkgCounts).map(([name, value], i) => ({
    name, value, color: PACKAGE_COLORS[i % PACKAGE_COLORS.length],
  }));

  // Trainer performance from stats
  const trainerPerformance = trainers.map(t => ({
    ...t,
    sessions: stats?.trainers?.sessions?.[t.name] || 0,
  })).sort((a, b) => b.sessions - a.sessions);

  const topTrainer = trainerPerformance[0];

  // Finance values from stats (all based on actual expenses / accrual)
  const finance = stats?.finance || {};
  const totalIncome     = finance.totalIncome     || 0;
  const posIncome       = finance.posIncome       || 0;
  const actualExpenses  = finance.actualExpenses  || 0;
  const monthlyExpenses = finance.monthlyExpenses || 0;
  const profit          = finance.profit          || 0;

  // Chart: income vs actual expenses (current month real data; prior months placeholder)
  const chartData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return {
      month:    format(d, 'MMM'),
      income:   i === 5 ? totalIncome   : 0,
      expenses: i === 5 ? actualExpenses : 0,
      rate:     i === 5 ? (stats?.attendance?.rate || 0) : 0,
    };
  });

  if (loading) {
    return (
      <div style={{ padding:'28px 32px', textAlign:'center', color:'#C4AE8F', fontSize:'0.88rem' }}>
        Loading reports…
      </div>
    );
  }

  return (
    <div style={{ padding:'28px 32px 40px' }}>

      {/* KPI row — 6 cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:14, marginBottom:22 }} className="rep-6">
        {[
          { icon:TrendingUp,  label:'Total Income',      val: `$${totalIncome.toLocaleString()}`,     sub: format(new Date(),'MMMM yyyy'),              color:'#7C8C5E' },
          { icon:ShoppingBag, label:'POS Income',        val: `$${posIncome.toLocaleString()}`,        sub:'Retail sales',                               color:'#A0673A' },
          { icon:DollarSign,  label:'Actual Expenses',   val: `$${actualExpenses.toLocaleString()}`,   sub:'Accrual basis',                              color:'#8C3A3A' },
          { icon:TrendingUp,  label:'Profit',            val: `$${profit.toLocaleString()}`,           sub:'Income minus actual expenses',               color: profit >= 0 ? '#4E6A2E' : '#8C3A3A' },
          { icon:Users,       label:'Active Members',    val: stats?.clients?.active || 0,             sub:`${stats?.clients?.total || 0} total`,        color:'#3D2314' },
          { icon:Star,        label:'Attendance Rate',   val: `${stats?.attendance?.rate || 0}%`,      sub:`${stats?.attendance?.attended || 0} attended`,color:'#C4893A' },
        ].map(k => (
          <div key={k.label} style={{ background:'#FAF7F2', borderRadius:14, padding:18, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470' }}>{k.label}</span>
              <k.icon size={14} color={k.color}/>
            </div>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.8rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:'0.76rem', color:k.color, marginTop:5 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14 }} className="rep-2">
        <Card title="Income vs Actual Expenses">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0D5C1" vertical={false}/>
              <XAxis dataKey="month" tick={{ fontSize:12, fill:'#9C8470', fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11, fill:'#9C8470' }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="income"   fill="#7C8C5E" radius={[4,4,0,0]}/>
              <Bar dataKey="expenses" fill="#C4AE8F" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', alignItems:'center', gap:16, justifyContent:'center', marginTop:8 }}>
            {[{ color:'#7C8C5E', label:'Total Income' },{ color:'#C4AE8F', label:'Actual Expenses' }].map(l=>(
              <div key={l.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.78rem', color:'#9C8470' }}>
                <span style={{ width:10, height:10, borderRadius:2, background:l.color, display:'inline-block' }}/>{l.label}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Package Distribution">
          {packageSplit.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>No clients yet.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={packageSplit} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {packageSplit.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Pie>
                  <Tooltip formatter={(val,name) => [val+' clients', name]}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:8 }}>
                {packageSplit.map(p => (
                  <div key={p.name} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.78rem', color:'#6B5744' }}>
                    <span style={{ width:10, height:10, borderRadius:2, background:p.color, display:'inline-block', flexShrink:0 }}/>
                    <span style={{ flex:1 }}>{p.name}</span>
                    <span style={{ fontWeight:500, color:'#3D2314' }}>{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Row 2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="rep-2">

        <Card title="Trainer Performance">
          {trainerPerformance.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>No trainer data yet.</div>
          ) : trainerPerformance.map((t, i) => (
            <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom: i < trainerPerformance.length-1 ? '1px solid #E0D5C1':'none' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'#C4AE8F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Cormorant Garant',serif", fontSize:'0.9rem', color:'#3D2314', fontWeight:600, flexShrink:0 }}>
                {t.avatar}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:500, fontSize:'0.9rem', color:'#2A1A0E', display:'flex', alignItems:'center', gap:6 }}>
                  {t.name}
                  {i === 0 && <span style={{ fontSize:'0.68rem', padding:'1px 7px', borderRadius:20, background:'#F5F1E0', color:'#7A6020', fontWeight:500 }}>Top Trainer</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3 }}>
                  <Stars rating={t.avgRating || 0}/>
                  <span style={{ fontSize:'0.76rem', color:'#9C8470' }}>{t.avgRating || '—'} · {t.sessions} sessions</span>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.3rem', fontWeight:500, color:'#3D2314' }}>{t.sessions}</div>
                <div style={{ fontSize:'0.68rem', color:'#9C8470' }}>sessions</div>
              </div>
            </div>
          ))}
        </Card>

        <Card title="Attendance Rate Trend">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0D5C1" vertical={false}/>
              <XAxis dataKey="month" tick={{ fontSize:12, fill:'#9C8470' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11, fill:'#9C8470' }} axisLine={false} tickLine={false} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Line type="monotone" dataKey="rate" stroke="#7C8C5E" strokeWidth={2.5} dot={{ fill:'#7C8C5E', r:4 }} activeDot={{ r:6 }}/>
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', justifyContent:'center', gap:24, marginTop:10 }}>
            {[
              { label:'Current Rate', val:`${stats?.attendance?.rate || 0}%`,  color:'#7C8C5E' },
              { label:'No-shows',     val: stats?.attendance?.noShows || 0,     color:'#9C8470' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.5rem', fontWeight:500, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:'0.72rem', color:'#9C8470' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <style>{`
        @media(max-width:1200px){ .rep-6{grid-template-columns:repeat(3,1fr)!important;} }
        @media(max-width:750px) { .rep-6{grid-template-columns:repeat(2,1fr)!important;} }
        @media(max-width:500px) { .rep-6{grid-template-columns:1fr!important;} }
        @media(max-width:900px) { .rep-2{grid-template-columns:1fr!important;} }
      `}</style>
    </div>
  );
}