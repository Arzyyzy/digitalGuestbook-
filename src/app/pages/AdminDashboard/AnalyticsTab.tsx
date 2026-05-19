import { useState, useEffect } from 'react';
import { useGuestbook } from '../../contexts/GuestbookContext';
import { getGuestMessages, getEventMessageCount, getActiveDeviceCount } from '../../../lib/supabaseMessages';
import { Card } from '../../components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const EVENT_ID = 'default-event';

export function AnalyticsTab() {
  const { isOnline, queueSize } = useGuestbook();
  const [totalMessages, setTotalMessages] = useState(0);
  const [activeDevices, setActiveDevices] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<Array<{ hour: string; count: number }>>([]);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get total messages
        const count = await getEventMessageCount(EVENT_ID);
        setTotalMessages(count);

        // Get active device count
        const deviceCount = await getActiveDeviceCount(EVENT_ID);
        setActiveDevices(deviceCount);

        // Get messages and calculate hourly distribution
        const messages = await getGuestMessages(EVENT_ID);
        const hourly: Record<string, number> = {};

        messages.forEach(msg => {
          const date = new Date(msg.createdAt);
          const hour = `${date.getHours().toString().padStart(2, '0')}:00`;
          hourly[hour] = (hourly[hour] || 0) + 1;
        });

        const chartData = Object.entries(hourly)
          .map(([hour, count]) => ({ hour, count }))
          .sort((a, b) => a.hour.localeCompare(b.hour));

        setChartData(chartData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();

    // Refresh every 30 seconds
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-slate-400">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Analytics & Monitoring</h2>
        <p className="text-slate-400">Real-time event statistics</p>
      </div>

      {/* Status indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Messages */}
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-blue-700/50 p-6">
          <div className="space-y-2">
            <p className="text-sm text-blue-200">Total Messages</p>
            <p className="text-4xl font-bold text-blue-50">{totalMessages}</p>
          </div>
        </Card>

        {/* Active Devices */}
        <Card className="bg-gradient-to-br from-green-900/50 to-green-800/30 border-green-700/50 p-6">
          <div className="space-y-2">
            <p className="text-sm text-green-200">Active Devices (5m)</p>
            <p className="text-4xl font-bold text-green-50">{activeDevices}</p>
          </div>
        </Card>

        {/* Pending Queue */}
        <Card
          className={`bg-gradient-to-br p-6 border ${
            queueSize > 0
              ? 'from-yellow-900/50 to-yellow-800/30 border-yellow-700/50'
              : 'from-slate-900/50 to-slate-800/30 border-slate-700/50'
          }`}
        >
          <div className="space-y-2">
            <p className={`text-sm ${queueSize > 0 ? 'text-yellow-200' : 'text-slate-400'}`}>
              Pending Queue
            </p>
            <p
              className={`text-4xl font-bold ${
                queueSize > 0 ? 'text-yellow-50' : 'text-slate-300'
              }`}
            >
              {queueSize}
            </p>
          </div>
        </Card>
      </div>

      {/* Connection Status */}
      <Card className="bg-slate-800 border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <p className="text-slate-300">Connection Status</p>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <p className={`font-medium ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 ? (
        <Card className="bg-slate-800 border-slate-700 p-6">
          <h3 className="text-lg font-semibold mb-4">Messages by Hour</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="hour" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      ) : (
        <Card className="bg-slate-800 border-slate-700 p-6 text-center">
          <p className="text-slate-400">No data available yet</p>
        </Card>
      )}

      {/* Stats Table */}
      <Card className="bg-slate-800 border-slate-700 overflow-hidden">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Statistics</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-slate-700">
              <span className="text-slate-300">Messages per hour (avg)</span>
              <span className="font-medium">
                {totalMessages > 0 ? (totalMessages / 24).toFixed(1) : '0'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-700">
              <span className="text-slate-300">Peak hour</span>
              <span className="font-medium">
                {chartData.length > 0
                  ? chartData.reduce((a, b) => (a.count > b.count ? a : b)).hour
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-300">Last update</span>
              <span className="font-medium text-xs">
                {new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
