'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `KES ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

export default function PerformancePage() {
  const [performance, setPerformance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPerformance();
  }, []);

  const fetchPerformance = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/performance/monthly`);
      setPerformance(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching performance:', err);
      setError('Failed to load performance data.');
    } finally {
      setLoading(false);
    }
  };

  const currentMonth = useMemo(() => performance?.[0], [performance]);

  return (
    <ProtectedRoute allowedRoles={['admin']}>
    <Layout title="Performance">
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Monthly Performance</h2>
              <p className="text-sm text-gray-500">
                Grouped by calendar month. New rows appear automatically as months roll over.
              </p>
            </div>
            <button
              onClick={fetchPerformance}
              className="text-sm font-semibold text-blue-700 hover:text-blue-900"
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}

          {currentMonth && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm text-blue-700">Current Month</p>
                <p className="text-lg font-bold text-blue-900 mt-1">{currentMonth.month}</p>
                <p className="text-xs text-blue-700/80 mt-1">Live data</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">Revenue</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(currentMonth.revenue)}</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">Expenses</p>
                <p className="text-2xl font-bold text-red-700 mt-1">{formatCurrency(currentMonth.expenses)}</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">Profit</p>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    Number(currentMonth.profit || 0) >= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {formatCurrency(currentMonth.profit)}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">Returns</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">
                  {Number(currentMonth.returns || 0).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expenses</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Profit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Orders</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Returns</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      Loading performance…
                    </td>
                  </tr>
                ) : performance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No performance data yet.
                    </td>
                  </tr>
                ) : (
                  performance.map((row) => (
                    <tr key={row.month} className={row === currentMonth ? 'bg-blue-50/50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {row.month}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(row.expenses)}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                          Number(row.profit || 0) >= 0 ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {formatCurrency(row.profit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.total_orders}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-amber-700 font-semibold">
                        {row.returns}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
    </ProtectedRoute>
  );
}
