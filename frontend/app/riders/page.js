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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRiders();
  }, []);

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
