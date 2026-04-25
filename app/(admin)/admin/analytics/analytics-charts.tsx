'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  days: { day: string; count: number; revenue: number }[];
  statusCounts: Record<string, number>;
  tierCounts: Record<string, number>;
}

const PIE_COLORS = ['#0B7A6B', '#F4A261', '#10B981', '#F59E0B', '#EF4444'];

export function AnalyticsCharts({ days, statusCounts, tierCounts }: Props) {
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const tierData = Object.entries(tierCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Revenue line */}
      <Card className="lg:col-span-2">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-1">Filings (last 30 days)</h3>
          <p className="text-xs text-ink-muted mb-4">Daily new filings and revenue</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={days} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EBEA" />
              <XAxis dataKey="day" stroke="#8A9A95" fontSize={11} />
              <YAxis stroke="#8A9A95" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #E5EBEA',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="count" stroke="#0B7A6B" strokeWidth={2.5} dot={false} name="Filings" />
              <Line type="monotone" dataKey="revenue" stroke="#F4A261" strokeWidth={2.5} dot={false} name="Revenue ($)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Status donut */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-1">Filing status mix</h3>
          <p className="text-xs text-ink-muted mb-4">Distribution by status</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                dataKey="value"
                paddingAngle={2}
              >
                {statusData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tier bar */}
      <Card className="lg:col-span-3">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-1">Service tier mix</h3>
          <p className="text-xs text-ink-muted mb-4">Filings per pricing tier</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={tierData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EBEA" />
              <XAxis dataKey="name" stroke="#8A9A95" fontSize={11} />
              <YAxis stroke="#8A9A95" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #E5EBEA',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="#0B7A6B" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
