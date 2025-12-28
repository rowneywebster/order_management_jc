'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RidersPage() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [approvals, setApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRiders();
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    setApprovalsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/rider-approvals`);
      setApprovals(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching approvals:', err);
      setError(err.response?.data?.error || 'Failed to load rider approval requests.');
    } finally {
      setApprovalsLoading(false);
    }
  };

  const fetchRiders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/riders`);
      setRiders(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching riders:', err);
      setError('Failed to load riders.');
    } finally {
      setLoading(false);
    }
  };

  const addRider = async () => {
    if (!name || !phone) return;
    setSaving(true);
    try {
      await axios.post(`${API_URL}/api/riders`, { name, phone });
      setName('');
      setPhone('');
      await fetchRiders();
    } catch (err) {
      console.error('Error adding rider:', err);
      setError(err.response?.data?.error || 'Failed to add rider.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRider = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/riders/${id}/toggle`);
      await fetchRiders();
    } catch (err) {
      console.error('Error toggling rider:', err);
      setError(err.response?.data?.error || 'Failed to update rider.');
    }
  };

  const deleteRider = async (id) => {
    if (!confirm('Remove this rider from notifications?')) return;
    try {
      await axios.delete(`${API_URL}/api/riders/${id}`);
      await fetchRiders();
    } catch (err) {
      console.error('Error deleting rider:', err);
      setError(err.response?.data?.error || 'Failed to delete rider.');
    }
  };

  const approveRequest = async (id) => {
    try {
      await axios.post(`${API_URL}/api/rider-approvals/${id}/approve`);
      setSuccess('Request approved. Rider notified and assignment sent.');
      setError('');
      await Promise.all([fetchApprovals(), fetchRiders()]);
    } catch (err) {
      console.error('Error approving rider request:', err);
      setError(err.response?.data?.error || 'Failed to approve request.');
      setSuccess('');
    }
  };

  const rejectRequest = async (id) => {
    const notes = prompt('Add rejection notes (optional):');
    if (notes === null) return;
    try {
      await axios.post(`${API_URL}/api/rider-approvals/${id}/reject`, { notes: notes || undefined });
      setSuccess('Request rejected.');
      setError('');
      await fetchApprovals();
    } catch (err) {
      console.error('Error rejecting rider request:', err);
      setError(err.response?.data?.error || 'Failed to reject request.');
      setSuccess('');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin']}>
    <Layout title="Riders">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-gray-900">Rider Notifications</h2>
          <p className="text-sm text-gray-500">
            Add or disable riders who receive Nairobi same-day WhatsApp notifications.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">{success}</div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Pending Approval Requests</h3>
              <p className="text-sm text-gray-500">Approve or reject Nairobi rider claims.</p>
            </div>
            <span className="text-sm text-gray-600">
              {approvals.length} pending
            </span>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rider</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {approvalsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-center text-gray-500">Loading requests…</td>
                  </tr>
                ) : approvals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-center text-gray-500">No pending requests.</td>
                  </tr>
                ) : (
                  approvals.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{request.rider_name || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{request.rider_phone}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{request.product}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{request.customer_first_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{request.address}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {request.requested_at ? new Date(request.requested_at).toLocaleString('en-KE') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap space-x-2">
                        <button
                          onClick={() => approveRequest(request.id)}
                          className="px-3 py-1 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectRequest(request.id)}
                          className="px-3 py-1 rounded-lg text-white bg-red-600 hover:bg-red-700 text-xs font-semibold"
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rider name"
            className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telephone"
            className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addRider}
            disabled={!name || !phone || saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add rider'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Loading riders…
                  </td>
                </tr>
              ) : riders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    No riders yet.
                  </td>
                </tr>
              ) : (
                riders.map((rider) => (
                  <tr key={rider.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{rider.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{rider.phone}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          rider.is_active
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}
                      >
                        {rider.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                      <button
                        onClick={() => toggleRider(rider.id)}
                        className="text-blue-700 hover:text-blue-900 font-semibold"
                      >
                        {rider.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => deleteRider(rider.id)}
                        className="text-red-700 hover:text-red-900 font-semibold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
    </ProtectedRoute>
  );
}
