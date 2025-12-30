'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RescheduledOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleOrder, setRescheduleOrder] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [commentOrder, setCommentOrder] = useState(null);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    fetchRescheduledOrders();
  }, []);

  const fetchRescheduledOrders = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/orders/rescheduled`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching rescheduled orders:', error);
      alert('Failed to load rescheduled orders');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, status, newDate = null, notes = undefined) => {
    try {
      await axios.patch(`${API_URL}/api/orders/${orderId}`, {
        status,
        ...(newDate && { rescheduled_date: newDate }),
        ...(notes !== undefined ? { notes } : {}),
      });
      fetchRescheduledOrders();
      setRescheduleOrder(null);
      setRescheduleDate('');
      setRescheduleNotes('');
      setCommentOrder(null);
      setCommentText('');
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Failed to update order');
    }
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
      <Layout title="Rescheduled Orders">
        <div className="flex items-center justify-center">
          <div className="text-xl">Loading...</div>
        </div>
      </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
    <Layout title="Rescheduled Orders">
        {orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 text-lg">No rescheduled orders</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Scheduled Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => {
                    const schedDate = new Date(order.rescheduled_date);
                    const isToday = schedDate.toDateString() === new Date().toDateString();
                    
                    return (
                      <tr key={order.id} className={`hover:bg-gray-50 ${isToday ? 'bg-yellow-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="font-medium text-gray-900">
                            {schedDate.toLocaleDateString('en-KE', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          {isToday && (
                            <span className="text-xs text-yellow-600 font-medium">TODAY</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="font-medium">{order.product_name}</div>
                          <div className="text-gray-500 text-xs">{order.website_name}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {order.customer_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.phone}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div>{order.county}</div>
                          {order.notes && (
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {order.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setRescheduleOrder(order);
                                setRescheduleDate(order.rescheduled_date ? order.rescheduled_date.split('T')[0] : '');
                                setRescheduleNotes(order.notes || '');
                              }}
                              className="text-blue-600 hover:text-blue-900 font-medium"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => {
                                setCommentOrder(order);
                                setCommentText(order.notes || '');
                              }}
                              className="text-gray-600 hover:text-gray-900 font-medium"
                            >
                              Comments
                            </button>
                            <button
                              onClick={() => updateOrderStatus(order.id, 'approved')}
                              className="text-green-600 hover:text-green-900 font-medium"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => updateOrderStatus(order.id, 'cancelled')}
                              className="text-red-600 hover:text-red-900 font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      {rescheduleOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold mb-4">Reschedule Order</h3>
            <p className="text-gray-600 mb-4">
              Order: {rescheduleOrder.product_name} - {rescheduleOrder.customer_name}
            </p>
            <input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4"
              />
            <textarea
              value={rescheduleNotes}
              onChange={(e) => setRescheduleNotes(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4"
              placeholder="Add or update comments for this order..."
            />
            <div className="flex gap-4">
              <button
                onClick={() => {
                  if (rescheduleDate) {
                    updateOrderStatus(rescheduleOrder.id, 'rescheduled', rescheduleDate, rescheduleNotes);
                  }
                }}
                disabled={!rescheduleDate}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setRescheduleOrder(null);
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
                onClick={() => updateOrderStatus(commentOrder.id, commentOrder.status, null, commentText)}
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
