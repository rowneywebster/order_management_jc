'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { useAuth } from '../providers/AuthProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusBadge = {
  unassigned: 'bg-amber-100 text-amber-800 border border-amber-200',
  assigned: 'bg-blue-100 text-blue-800 border border-blue-200',
  delivered: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function NairobiOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Riders land on unassigned by default so they only see what can be claimed
  const [statusFilter, setStatusFilter] = useState('unassigned');
  const [assigning, setAssigning] = useState(null);
  const [riderPhone, setRiderPhone] = useState('');
  const [riderName, setRiderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState({
    customer_first_name: '',
    customer_full_name: '',
    phone: '',
    alt_phone: '',
    address: '',
    product: '',
    amount_payable: '',
  });
  const [creatingBusy, setCreatingBusy] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/nairobi-orders`, {
        params: {
          status: statusFilter || undefined,
        },
      });
      setOrders(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching Nairobi orders:', err);
      setError('Could not load Nairobi orders.');
    } finally {
      setLoading(false);
    }
  };

  const submitAssignment = async () => {
    if (!assigning || !riderPhone) return;
    const approvalPendingMessage =
      'Your request has been sent to Admin Rowney for approval. You will receive a WhatsApp message once approved. Thank you!';
    try {
      const response = await axios.post(`${API_URL}/api/nairobi-orders/${assigning.id}/assign`, {
        rider_phone: riderPhone,
        rider_name: riderName || undefined,
      });
      if (response?.data?.pending) {
        setError(approvalPendingMessage);
      }
      setAssigning(null);
      setRiderPhone('');
      setRiderName('');
      await fetchOrders();
    } catch (err) {
      console.error('Error assigning Nairobi order:', err);
      if (err.response?.data?.pending) {
        setError(approvalPendingMessage);
      } else {
        setError(err.response?.data?.error || 'Failed to assign order.');
      }
      setAssigning(null);
      setRiderPhone('');
      setRiderName('');
    }
  };

  const markDelivered = async (orderId) => {
    try {
      await axios.patch(`${API_URL}/api/nairobi-orders/${orderId}/status`, { status: 'delivered' });
      await fetchOrders();
    } catch (err) {
      console.error('Error updating Nairobi order:', err);
      setError(err.response?.data?.error || 'Failed to update order status.');
    }
  };

  const updateCreatingField = (field, value) => {
    setCreatingOrder((prev) => ({ ...prev, [field]: value }));
  };

  const submitCreate = async () => {
    const payload = {
      ...creatingOrder,
      amount_payable: creatingOrder.amount_payable ? Number(creatingOrder.amount_payable) : undefined,
    };
    if (!payload.customer_first_name || !payload.address || !payload.product || payload.amount_payable === undefined) {
      setError('Please fill required fields: first name, address, product, amount payable.');
      return;
    }

    setCreatingBusy(true);
    try {
      await axios.post(`${API_URL}/api/nairobi-orders`, payload);
      setCreating(false);
      setCreatingOrder({
        customer_first_name: '',
        customer_full_name: '',
        phone: '',
        alt_phone: '',
        address: '',
        product: '',
        amount_payable: '',
      });
      await fetchOrders();
    } catch (err) {
      console.error('Error creating Nairobi order:', err);
      setError(err.response?.data?.error || 'Failed to create Nairobi order.');
    } finally {
      setCreatingBusy(false);
    }
  };

  return (
    <Layout title="Nairobi Same-Day">
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Nairobi Same-Day Deliveries</h2>
              <p className="text-sm text-gray-500">
                Minimal rider view. Inventory is not affected by these orders.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <button
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
                >
                  + Add Nairobi Order
                </button>
              )}
              {['unassigned', 'assigned', 'delivered', null].map((status) => (
                <button
                  key={status || 'all'}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    statusFilter === status
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {status ? status : 'all'}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
            {loading ? (
              <div className="col-span-full text-center text-gray-500 py-6">Loading Nairobi orders…</div>
            ) : orders.length === 0 ? (
              <div className="col-span-full text-center text-gray-500 py-6">No orders in this view.</div>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="border border-gray-200 rounded-xl p-4 shadow-sm bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">Customer</p>
                      <p className="text-lg font-semibold text-gray-900">{order.customer_first_name}</p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge[order.status]}`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-gray-700">
                    <div>
                      <p className="text-gray-500 text-xs uppercase">Address</p>
                      <p>{order.address}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs uppercase">Product</p>
                      <p>{order.product}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs uppercase">Amount payable</p>
                      <p className="font-semibold text-emerald-700">{formatCurrency(order.amount_payable)}</p>
                    </div>
                    {order.assigned_to && (
                      <div>
                        <p className="text-gray-500 text-xs uppercase">Assigned rider</p>
                        <p className="font-semibold text-blue-700">{order.assigned_to}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    {order.status === 'unassigned' && (
                      <button
                        onClick={() => setAssigning(order)}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
                      >
                        Accept & verify
                      </button>
                    )}
                    {order.status === 'assigned' && (
                      <button
                        onClick={() => markDelivered(order.id)}
                        className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700"
                      >
                        Mark delivered
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Add Nairobi Order</h3>
              <button
                onClick={() => setCreating(false)}
                className="text-gray-500 hover:text-gray-800 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer first name *</label>
                <input
                  type="text"
                  value={creatingOrder.customer_first_name}
                  onChange={(e) => updateCreatingField('customer_first_name', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer full name</label>
                <input
                  type="text"
                  value={creatingOrder.customer_full_name}
                  onChange={(e) => updateCreatingField('customer_full_name', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={creatingOrder.phone}
                  onChange={(e) => updateCreatingField('phone', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alt phone</label>
                <input
                  type="tel"
                  value={creatingOrder.alt_phone}
                  onChange={(e) => updateCreatingField('alt_phone', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={creatingOrder.address}
                  onChange={(e) => updateCreatingField('address', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
                <input
                  type="text"
                  value={creatingOrder.product}
                  onChange={(e) => updateCreatingField('product', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount payable (KES) *</label>
                <input
                  type="number"
                  min="0"
                  value={creatingOrder.amount_payable}
                  onChange={(e) => updateCreatingField('amount_payable', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setCreating(false);
                  setCreatingOrder({
                    customer_first_name: '',
                    customer_full_name: '',
                    phone: '',
                    alt_phone: '',
                    address: '',
                    product: '',
                    amount_payable: '',
                  });
                }}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitCreate}
                disabled={creatingBusy}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingBusy ? 'Saving…' : 'Create order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assigning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Accept order</h3>
            <p className="text-sm text-gray-600 mb-4">
              Verify with your phone number to receive full details on WhatsApp.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rider name (optional)</label>
                <input
                  type="text"
                  value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Rider"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rider phone (required)</label>
                <input
                  type="tel"
                  value={riderPhone}
                  onChange={(e) => setRiderPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0712..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={submitAssignment}
                disabled={!riderPhone}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm & notify
              </button>
              <button
                onClick={() => {
                  setAssigning(null);
                  setRiderPhone('');
                  setRiderName('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-200"
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
