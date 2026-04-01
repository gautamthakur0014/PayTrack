import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar
} from 'recharts';
import {
  TrendingUp, TrendingDown, BarChart2, PieChart as PieIcon,
  Zap, Award, AlertCircle, ArrowUpRight, ArrowDownRight, Target
} from 'lucide-react';
import { expenseAPI } from '../services/api';
import { PageHeader, Spinner } from '../components/ui/index';
import { format, subMonths } from 'date-fns';
import { useTheme } from '../context/ThemeContext';

const CATEGORY_COLORS = {
  food: '#14b8a6', travel: '#3b82f6', rent: '#8b5cf6',
  utilities: '#f59e0b', entertainment: '#ec4899', health: '#10b981',
  shopping: '#f97316', other: '#64748b'
};
const CATEGORY_EMOJI = {
  food: '🍕', travel: '✈️', rent: '🏠', utilities: '⚡',
  entertainment: '🎮', health: '💊', shopping: '🛍️', other: '📦'
};

const CustomAreaTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2.5 shadow-2xl border-teal-500/20 min-w-[140px]">
      <p className="text-muted-custom text-xs font-semibold mb-2 uppercase tracking-wider">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-bold text-sm text-primary-custom">${p.value?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

const CustomBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2.5 shadow-2xl border-teal-500/20">
      <p className="text-muted-custom text-xs mb-1">{label}</p>
      <p className="font-mono font-bold text-teal-400">{payload[0]?.value} expenses</p>
    </div>
  );
};

function InsightCard({ icon: Icon, color, title, value, sub, trend }) {
  const colors = {
    teal: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
    yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  };
  const c = colors[color] || colors.teal;
  return (
    <div className={`card border ${c.border} flex items-start gap-4`}>
      <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={c.text} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-muted-custom text-xs font-medium uppercase tracking-wider">{title}</p>
        <p className="font-display font-bold text-2xl text-primary-custom mt-0.5">{value}</p>
        {sub && (
          <p className={`text-xs mt-0.5 flex items-center gap-1 ${trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400' : 'text-muted-custom'}`}>
            {trend === 'up' && <ArrowUpRight size={12} />}
            {trend === 'down' && <ArrowDownRight size={12} />}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState(6);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ trend: [], categories: [], balance: null });
  const { user } = useSelector(s => s.auth);
  const { isDark } = useTheme();

  const axisColor = isDark ? '#475569' : '#94a3b8';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  useEffect(() => { loadAnalytics(); }, [period]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const months = Array.from({ length: period }, (_, i) => {
        const d = subMonths(now, period - 1 - i);
        return { year: d.getFullYear(), month: d.getMonth() + 1, label: format(d, 'MMM yy') };
      });

      const trendData = await Promise.all(
        months.map(async ({ year, month, label }) => {
          try {
            const { data: d } = await expenseAPI.monthlyTotal({ year, month });
            return { label, total: d.data?.total || 0, count: d.data?.count || 0 };
          } catch { return { label, total: 0, count: 0 }; }
        })
      );

      const { data: expData } = await expenseAPI.list({ limit: 200 });
      const catMap = {};
      (expData.data?.expenses || []).forEach(e => {
        const cat = e.category || 'other';
        catMap[cat] = (catMap[cat] || 0) + (e.amount || 0);
      });
      const categories = Object.entries(catMap)
        .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value);

      const { data: balData } = await expenseAPI.balanceSummary();

      setData({ trend: trendData, categories, balance: balData.data });
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally { setLoading(false); }
  };

  const totalSpent = data.trend.reduce((s, d) => s + d.total, 0);
  const avgMonthly = data.trend.length ? totalSpent / data.trend.length : 0;
  const lastMonth = data.trend[data.trend.length - 1]?.total || 0;
  const prevMonth = data.trend[data.trend.length - 2]?.total || 0;
  const momChange = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0;
  const topCategory = data.categories[0];
  const monthlyIncome = parseFloat(user?.monthlyIncome || 0);
  const savingsRate = monthlyIncome > 0 ? Math.max(0, ((monthlyIncome - avgMonthly) / monthlyIncome) * 100) : null;

  const radialData = data.categories.slice(0, 5).map((c, i) => ({
    name: c.name,
    value: Math.round((c.value / (totalSpent || 1)) * 100),
    fill: CATEGORY_COLORS[c.name] || '#64748b',
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Insights"
        subtitle="Deep dive into your spending habits"
        action={
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            {[3, 6, 12].map(m => (
              <button key={m} onClick={() => setPeriod(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  period === m
                    ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                    : 'text-muted-custom hover:text-secondary-custom'
                }`}>{m}M</button>
            ))}
          </div>
        }
      />

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard
          icon={BarChart2} color="teal"
          title={`Total (${period}m)`}
          value={`$${totalSpent.toFixed(0)}`}
          sub={`${data.trend.filter(d => d.total > 0).length} active months`}
        />
        <InsightCard
          icon={Target} color="blue"
          title="Monthly avg"
          value={`$${avgMonthly.toFixed(0)}`}
          sub="per month"
        />
        <InsightCard
          icon={momChange >= 0 ? TrendingUp : TrendingDown}
          color={momChange > 10 ? 'red' : momChange < -10 ? 'green' : 'yellow'}
          title="vs last month"
          value={`${momChange >= 0 ? '+' : ''}${momChange.toFixed(1)}%`}
          sub={`$${lastMonth.toFixed(0)} this month`}
          trend={momChange > 5 ? 'up' : momChange < -5 ? 'down' : undefined}
        />
        {savingsRate !== null ? (
          <InsightCard
            icon={Award} color={savingsRate >= 30 ? 'green' : savingsRate >= 15 ? 'yellow' : 'red'}
            title="Savings rate"
            value={`${savingsRate.toFixed(0)}%`}
            sub={savingsRate >= 20 ? '👏 Great job!' : 'Could improve'}
          />
        ) : (
          <InsightCard
            icon={TrendingDown} color="red"
            title="You owe"
            value={`$${(data.balance?.youOwe || 0).toFixed(0)}`}
            sub="to others"
          />
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner size={32} />
          <p className="text-muted-custom text-sm">Crunching your numbers…</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Spending Trend ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
                  <TrendingUp size={16} className="text-teal-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-custom">Monthly Spending Trend</h3>
                  <p className="text-xs text-muted-custom">Last {period} months</p>
                </div>
              </div>
              {momChange !== 0 && (
                <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  momChange > 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                }`}>
                  {momChange > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(momChange).toFixed(1)}% MoM
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={data.trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTeal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={55} />
                <Tooltip content={<CustomAreaTooltip />} cursor={{ stroke: '#14b8a6', strokeWidth: 1, strokeDasharray: '4 2' }} />
                <Area type="monotone" dataKey="total" name="Total" stroke="#14b8a6" strokeWidth={2.5}
                  fill="url(#gradTeal)" dot={{ fill: '#14b8a6', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#14b8a6', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-5 gap-5">
            {/* ── Category breakdown ──────────────────────────────────────── */}
            <div className="card lg:col-span-3">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <PieIcon size={16} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-custom">Spending by Category</h3>
                  <p className="text-xs text-muted-custom">{data.categories.length} categories tracked</p>
                </div>
              </div>
              {data.categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <AlertCircle size={28} className="text-muted-custom" />
                  <p className="text-muted-custom text-sm">No spending data yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.categories.slice(0, 7).map((cat, i) => {
                    const pct = ((cat.value / (totalSpent || 1)) * 100).toFixed(1);
                    const color = CATEGORY_COLORS[cat.name] || '#64748b';
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{CATEGORY_EMOJI[cat.name]}</span>
                            <span className="text-sm text-secondary-custom font-medium capitalize">{cat.name}</span>
                            {i === 0 && (
                              <span className="badge text-[10px] px-1.5 py-0.5" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                                Top
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-custom">{pct}%</span>
                            <span className="font-mono text-sm font-semibold text-primary-custom">${cat.value.toFixed(0)}</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700 delay-100"
                            style={{
                              width: `${(cat.value / (data.categories[0]?.value || 1)) * 100}%`,
                              background: `linear-gradient(to right, ${color}, ${color}bb)`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Donut + radial ──────────────────────────────────────────── */}
            <div className="card lg:col-span-2 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Zap size={16} className="text-blue-400" />
                </div>
                <h3 className="font-semibold text-primary-custom text-sm">Distribution</h3>
              </div>

              {data.categories.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-muted-custom text-sm">No data yet</p>
                </div>
              ) : (
                <>
                  <div className="relative flex items-center justify-center">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={data.categories} cx="50%" cy="50%" innerRadius={52} outerRadius={82}
                          paddingAngle={2} dataKey="value" strokeWidth={0}>
                          {data.categories.map((entry, i) => (
                            <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#64748b'} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v) => [`$${v.toFixed(2)}`, '']}
                          contentStyle={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-xs text-muted-custom">Total</p>
                      <p className="font-display font-bold text-lg text-primary-custom">${totalSpent.toFixed(0)}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {data.categories.slice(0, 6).map(cat => (
                      <div key={cat.name} className="flex items-center gap-1.5 text-xs text-muted-custom">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: CATEGORY_COLORS[cat.name] || '#64748b' }} />
                        <span className="capitalize truncate">{cat.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Expense count bar chart ─────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart2 size={16} className="text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-custom">Expense Frequency</h3>
                <p className="text-xs text-muted-custom">Number of transactions per month</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(20,184,166,0.05)' }} />
                <Bar dataKey="count" name="Count" fill="#3b82f6" radius={[5, 5, 0, 0]} fillOpacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Balance summary strip ───────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card border-green-500/20 bg-green-500/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={22} className="text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-custom uppercase tracking-wider font-semibold mb-0.5">You Receive</p>
                <p className="font-display font-bold text-2xl text-green-400">
                  ${(data.balance?.youReceive || 0).toFixed(2)}
                </p>
                <p className="text-xs text-muted-custom">Outstanding balance</p>
              </div>
            </div>
            <div className="card border-red-500/20 bg-red-500/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <TrendingDown size={22} className="text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-custom uppercase tracking-wider font-semibold mb-0.5">You Owe</p>
                <p className="font-display font-bold text-2xl text-red-400">
                  ${(data.balance?.youOwe || 0).toFixed(2)}
                </p>
                <p className="text-xs text-muted-custom">To friends</p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
