'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Layout from './components/Layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `KES ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatNumber = (value) => Number(value || 0).toLocaleString('en-KE');

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [completeOrder, setCompleteOrder] = useState(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        axios.get(`${API_URL}/api/orders/stats`),
        axios.get(`${API_URL}/api/orders`, { params: { limit: 5 } })
      ]);
      setStats(statsRes.data);
      setOrders(ordersRes.data);
      setError('');
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, status, rescheduleDate = null, amount = null) => {
    try {
      await axios.patch(`${API_URL}/api/orders/${orderId}`, {
        status,
        ...(rescheduleDate && { rescheduled_date: rescheduleDate }),
        ...(amount && { amount_kes: amount })
      });
      fetchData(); // Refresh data
      setSelectedOrder(null);
      setRescheduleDate('');
      setError('');
    } catch (error) {
      console.error('Error updating order:', error);
      setError(error.response?.data?.error || 'Failed to update order');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      rescheduled: 'bg-blue-100 text-blue-800',
      completed: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
    };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-gray-800">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  const allTime = stats?.all_time || {};
  const currentMonth = stats?.current_month || {};

  const totalProfit = Number(stats?.total_profit || 0);
  const currentProfit = Number(currentMonth.profit || 0);

  return (
    <Layout title="Dashboard">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <section className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">All-Time Snapshot</h2>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Live data</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-emerald-700 mt-2">{formatCurrency(allTime.revenue)}</p>
                <p className="text-xs text-gray-500 mt-1">Completed orders</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-red-700 mt-2">{formatCurrency(allTime.expenses)}</p>
                <p className="text-xs text-gray-500 mt-1">All-time spend</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Total Profit</p>
                <p
                  className={`text-2xl font-bold mt-2 ${
                    totalProfit >= 0 ? 'text-blue-700' : 'text-amber-700'
                  }`}
                >
                  {formatCurrency(totalProfit)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Revenue - expenses</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{formatNumber(allTime.orders)}</p>
                <p className="text-xs text-gray-500 mt-1">Lifetime volume</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Pending Orders</p>
                <p className="text-2xl font-bold text-amber-700 mt-2">
                  {formatNumber(allTime.pending_orders || stats?.pending_count)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Awaiting action</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Current Month</h2>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Calendar month</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
                <p className="text-sm text-blue-700">Revenue</p>
                <p className="text-2xl font-bold text-blue-900 mt-2">{formatCurrency(currentMonth.revenue)}</p>
                <p className="text-xs text-blue-700/80 mt-1">Completed orders</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Expenses</p>
                <p className="text-2xl font-bold text-red-700 mt-2">{formatCurrency(currentMonth.expenses)}</p>
                <p className="text-xs text-gray-500 mt-1">This month spend</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Profit</p>
                <p
                  className={`text-2xl font-bold mt-2 ${
                    currentProfit >= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {formatCurrency(currentProfit)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Live calculation</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Orders</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{formatNumber(currentMonth.orders)}</p>
                <p className="text-xs text-gray-500 mt-1">This month</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-amber-700 mt-2">
                  {formatNumber(currentMonth.pending_orders)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Awaiting fulfillment</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Recent Orders</h2>
              <p className="text-sm text-gray-500">Latest five orders across all websites</p>
            </div>
            <Link href="/orders" className="text-blue-600 font-medium hover:text-blue-800 text-sm">
              View all orders →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(order.created_at).toLocaleString('en-KE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{order.product_name}</div>
                      <div className="text-gray-500 text-xs">{order.website_name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{order.customer_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.phone}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{order.county}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-wrap gap-2">
                        {order.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setCompleteOrder(order)}
                              className="text-green-600 hover:text-green-900 font-medium"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="text-blue-600 hover:text-blue-900 font-medium"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => updateOrderStatus(order.id, 'cancelled')}
                              className="text-red-600 hover:text-red-900 font-medium"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        <Link
                          href={`/orders/${order.id}/edit`}
                          className="text-gray-600 hover:text-gray-900 font-medium"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reschedule Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold mb-4">Reschedule Order</h3>
              <p className="text-gray-600 mb-4">
                Order: {selectedOrder.product_name} - {selectedOrder.customer_name}
              </p>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4"
              />
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    if (rescheduleDate) {
                      updateOrderStatus(selectedOrder.id, 'rescheduled', rescheduleDate);
                    }
                  }}
                  disabled={!rescheduleDate}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setSelectedOrder(null);
                    setRescheduleDate('');
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Complete Order Modal */}
        {completeOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold mb-4">Complete Order</h3>
              <p className="text-gray-600 mb-4">
                Order: {completeOrder.product_name} - {completeOrder.customer_name}
              </p>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                Amount (KES)
              </label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
              />
              <div className="flex gap-4 mt-4">
                <button
                  onClick={() => {
                    if (amount) {
                      updateOrderStatus(completeOrder.id, 'completed', null, amount);
                      setCompleteOrder(null);
                      setAmount('');
                    }
                  }}
                  disabled={!amount}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setCompleteOrder(null);
                    setAmount('');
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </Layout>
  );
}
