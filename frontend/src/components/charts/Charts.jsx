import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

const axis = { fontSize: 12, fill: '#8aa0ab' };
const tip = { borderRadius: 14, border: '1px solid #dde8eb', boxShadow: '0 18px 40px -18px rgba(6,40,52,.35)', fontSize: 13, padding: '10px 12px' };
const leg = { fontSize: 13, paddingTop: 8 };

// recharts only renders its own child components, so gradients are built as a plain <defs> element.
const defs = (items) => (
  <defs>
    {items.map(([id, c]) => (
      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".32" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient>
    ))}
  </defs>
);
const area = (key, name, color, gid, extra = {}) => (
  <Area type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={2.6} fill={`url(#${gid})`} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff', fill: color }} animationDuration={900} {...extra} />
);

export function TrendChart({ data, height = 230 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        {defs([['gA', '#12a98a'], ['gH', '#d4304a']])}
        <CartesianGrid stroke="#e8f0f2" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tip} cursor={{ stroke: '#c7d6db', strokeDasharray: '4 4' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={leg} />
        {area('analyses', 'Total analyses', '#12a98a', 'gA')}
        {area('high', 'High risk', '#d4304a', 'gH')}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PlatformChart({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        {defs([['gP1', '#0a6a78'], ['gP2', '#2bd9b5'], ['gP3', '#f4b23f']])}
        <CartesianGrid stroke="#e8f0f2" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tip} cursor={{ stroke: '#c7d6db', strokeDasharray: '4 4' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={leg} />
        {area('analyses', 'Analyses', '#0a6a78', 'gP1')}
        {area('users', 'Users', '#12b99a', 'gP2')}
        {area('logins', 'Logins', '#e59a1f', 'gP3')}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RoleDonut({ data, height = 190 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={82} paddingAngle={3} cornerRadius={6} stroke="none" animationDuration={900}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip contentStyle={tip} />
      </PieChart>
    </ResponsiveContainer>
  );
}
