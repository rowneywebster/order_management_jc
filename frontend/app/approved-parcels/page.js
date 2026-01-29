'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 25;

const getStatusColor = (status) => {
  const colors = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    rescheduled: 'bg-blue-100 text-blue-800',
    completed: 'bg-gray-100 text-gray-800',
    returned: 'bg-purple-100 text-purple-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

const formatLocation = (order) => {
  const parts = [order.county, order.location].filter((p) => p && p.trim());
  if (parts.length === 0) return '—';
  return parts.join(' – ');
};

const formatWaybill = (order) => {
  const hasComment = order.notes && order.notes.trim().length > 0;
  if (order.courier?.toLowerCase() === 'speedaf' && hasComment) {
    return order.notes;
  }
  if (hasComment) return order.notes;
  return 'None';
};

export default function ApprovedParcelsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [completeOrder, setCompleteOrder] = useState(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchApprovedOrders();
  }, [page, search]);

  const fetchApprovedOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/orders`, {
        params: {
          paginated: true,
          page,
          limit: PAGE_SIZE,
          status: 'approved',
          search: search?.trim() || undefined,
        },
      });

      const { orders: rows = [], total = 0, totalPages = 1, page: currentPage } = response.data;
      setOrders(rows);
      setTotal(total);
      setTotalPages(totalPages);
      if (currentPage && currentPage !== page) {
        setPage(currentPage);
      }
      setError('');
    } catch (err) {
      console.error('Error fetching approved parcels:', err);
      setError('Failed to load approved parcels. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, status, rescheduledDate = null, paymentAmount = null) => {
    try {
      await axios.patch(`${API_URL}/api/orders/${orderId}`, {
        status,
        ...(rescheduledDate && { rescheduled_date: rescheduledDate }),
        ...(paymentAmount && { amount_kes: paymentAmount }),
      });
      await fetchApprovedOrders();
      setSelectedOrder(null);
      setCompleteOrder(null);
      setRescheduleDate('');
      setAmount('');
      setError('');
    } catch (err) {
      console.error('Error updating order:', err);
      setError(err.response?.data?.error || 'Unable to update order right now.');
    }
  };

  const insights = useMemo(() => {
    if (!orders.length) {
      return {
        oldestDate: null,
        uniqueWebsites: 0,
      };
    }
    const oldestDate = orders.reduce(
      (oldest, order) => {
        const created = new Date(order.created_at);
        return !oldest || created < oldest ? created : oldest;
      },
      null
    );
    const uniqueWebsites = new Set(orders.map((o) => o.website_name).filter(Boolean)).size;
    return { oldestDate, uniqueWebsites };
  }, [orders]);

  const startIndex = (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);

  if (loading && orders.length === 0) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'user']}>
        <Layout title="Approved Parcels">
          <div className="min-h-[50vh] flex items-center justify-center">
            <p className="text-gray-700 text-lg">Loading approved parcels…</p>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'user']}>
      <Layout title="Approved Parcels">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-green-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-green-700">Approved parcels</p>
            <p className="mt-1 text-3xl font-bold text-green-900">{total.toLocaleString()}</p>
            <p className="text-xs text-green-700/80">Across all websites</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-blue-700">Window</p>
            <p className="mt-1 text-lg font-semibold text-blue-900">
              {total === 0 ? '—' : `${startIndex}–${endIndex} of ${total}`}
            </p>
            <p className="text-xs text-blue-700/80">Page size {PAGE_SIZE}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-emerald-700">Oldest approved</p>
            <p className="mt-1 text-lg font-semibold text-emerald-900">
              {insights.oldestDate
                ? insights.oldestDate.toLocaleDateString('en-KE', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'No data'}
            </p>
            <p className="text-xs text-emerald-700/80">Based on current view</p>
          </div>
          <div className="rounded-xl border border-purple-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-purple-700">Websites</p>
            <p className="mt-1 text-3xl font-bold text-purple-900">{insights.uniqueWebsites}</p>
            <p className="text-xs text-purple-700/80">Unique on this page</p>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 flex flex-col gap-3 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Approved parcels</h2>
              <p className="text-sm text-gray-500">
                Track orders that have been approved. Page size: {PAGE_SIZE}.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search approved parcels…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full sm:w-72 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">⌕</span>
              </div>
              <Link
                href="/orders"
                className="text-sm font-medium text-blue-700 hover:text-blue-900 text-right"
              >
                Go to all orders →
              </Link>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-600">
              No approved parcels found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waybill / Comment</th>
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
                        <div className="text-gray-500 text-xs">{order.entry_id}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{order.customer_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.phone}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{formatLocation(order)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{formatWaybill(order)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-wrap gap-2">
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
          )}

          {orders.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 text-sm text-gray-600">
              <div>
                Showing {startIndex}-{endIndex} of {total} approved parcels
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                >
                  Prev
                </button>
                <span className="px-2 text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        {selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold mb-4">Reschedule Parcel</h3>
              <p className="text-gray-600 mb-4">
                {selectedOrder.product_name} — {selectedOrder.customer_name}
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

        {completeOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold mb-4">Complete Parcel</h3>
              <p className="text-gray-600 mb-4">
                {completeOrder.product_name} — {completeOrder.customer_name}
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
    </ProtectedRoute>
  );
}
