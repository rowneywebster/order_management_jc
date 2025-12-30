'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../providers/AuthProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 20;

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

const STATUS_SEQUENCE = [null, 'completed', 'pending', 'returned'];
const STATUS_KEYWORDS = ['completed', 'pending', 'returned'];

export default function OrdersPage() {
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
  const [statusFilter, setStatusFilter] = useState(null);
  const [commentOrder, setCommentOrder] = useState(null);
  const [commentText, setCommentText] = useState('');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Auto-detect status keywords in search to keep the filter in sync (e.g., typing "pending")
  useEffect(() => {
    const term = searchInput.trim().toLowerCase();
    const match = STATUS_KEYWORDS.find((keyword) => term.includes(keyword));
    if (match && statusFilter !== match) {
      setStatusFilter(match);
    }
  }, [searchInput, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [page, search, statusFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/orders`, {
        params: {
          paginated: true,
          page,
          limit: PAGE_SIZE,
          search: search?.trim() || undefined,
          status: statusFilter || undefined,
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
      console.error('Error fetching orders:', err);
      setError('Failed to load orders. Please try again.');
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
      await fetchOrders();
      setSelectedOrder(null);
      setRescheduleDate('');
      setError('');
    } catch (err) {
      console.error('Error updating order:', err);
      setError(err.response?.data?.error || 'Unable to update order right now.');
    }
  };

  const updateOrderNotes = async (orderId, notes) => {
    try {
      await axios.patch(`${API_URL}/api/orders/${orderId}`, { notes });
      await fetchOrders();
      setCommentOrder(null);
      setCommentText('');
      setError('');
    } catch (err) {
      console.error('Error updating notes:', err);
      setError(err.response?.data?.error || 'Unable to update comments right now.');
    }
  };

  const cycleStatusFilter = () => {
    const currentIndex = STATUS_SEQUENCE.indexOf(statusFilter);
    const nextIndex = (currentIndex + 1) % STATUS_SEQUENCE.length;
    const nextStatus = STATUS_SEQUENCE[nextIndex];
    setStatusFilter(nextStatus);
    setPage(1);
  };

  const startIndex = (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);

  return (
    <ProtectedRoute allowedRoles={['admin', 'user']}>
    <Layout title="Orders">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-col gap-4 px-6 py-5 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
            <p className="text-sm text-gray-500">
              Up to 500 recent orders. Page size: {PAGE_SIZE} per page.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <input
                type="text"
                placeholder="Search orders…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full sm:w-72 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-xs text-gray-400">⌕</span>
            </div>
            <Link
              href="/rescheduled"
              className="text-sm font-medium text-blue-700 hover:text-blue-900 text-right"
            >
              Rescheduled queue →
            </Link>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <button
                    className="inline-flex items-center gap-2 text-left text-gray-700 hover:text-blue-700"
                    onClick={cycleStatusFilter}
                  >
                    Status
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                      {statusFilter ? statusFilter : 'all'}
                    </span>
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Loading orders…
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className={`hover:bg-gray-50 ${
                      order.status === 'returned' ? 'bg-purple-50/70' : ''
                    }`}
                  >
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
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{order.county}</div>
                      {order.location && <div className="text-xs text-gray-500">{order.location}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-wrap gap-2">
                        {(order.status === 'pending' || order.status === 'rescheduled') && (
                          <>
                            <button
                              onClick={() => setCompleteOrder(order)}
                              className="text-green-600 hover:text-green-900 font-medium"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => {
                                setSelectedOrder(order);
                                setRescheduleDate(order.rescheduled_date ? order.rescheduled_date.split('T')[0] : '');
                              }}
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
                        <button
                          onClick={() => {
                            setCommentOrder(order);
                            setCommentText(order.notes || '');
                          }}
                          className="text-gray-600 hover:text-gray-900 font-medium"
                        >
                          Comments
                        </button>
                        {isAdmin && (
                          <Link
                            href={`/orders/${order.id}/edit`}
                            className="text-gray-600 hover:text-gray-900 font-medium"
                          >
                            Edit
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5 border-t border-gray-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-600">
            Showing {orders.length === 0 ? 0 : startIndex}-{endIndex} of {total}
          </div>
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>
      </div>

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

      {/* Comments Modal */}
      {commentOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold mb-4">Order Comments</h3>
            <p className="text-gray-600 mb-4">
              Order: {commentOrder.product_name} - {commentOrder.customer_name}
            </p>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={5}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4"
              placeholder="Add your comments or updates for this order..."
            />
            <div className="flex gap-4">
              <button
                onClick={() => updateOrderNotes(commentOrder.id, commentText)}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setCommentOrder(null);
                  setCommentText('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
    </ProtectedRoute>
  );
}
