'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Layout from '../components/Layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Websites() {
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact_email: '',
    contact_phone: '',
    website_url: ''
  });

  useEffect(() => {
    fetchWebsites();
  }, []);

  const fetchWebsites = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/websites`);
      setWebsites(response.data);
    } catch (error) {
      console.error('Error fetching websites:', error);
      alert('Failed to load websites');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/websites`, formData);
      setFormData({ name: '', contact_email: '', contact_phone: '', website_url: '' });
      setShowForm(false);
      fetchWebsites();
    } catch (error) {
      console.error('Error adding website:', error);
      alert('Failed to add website');
    }
  };

  const toggleWebsite = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/websites/${id}/toggle`);
      fetchWebsites();
    } catch (error) {
      console.error('Error toggling website:', error);
      alert('Failed to update website');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (loading) {
    return (
      <Layout title="Websites">
        <div className="flex items-center justify-center">
          <div className="text-xl">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Websites">
        {/* Add Website Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
          >
            {showForm ? 'Cancel' : '+ Add New Website'}
          </button>
        </div>

        {/* Add Website Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Add New Website</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Website Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="e.g., My Online Store"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="contact@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="+254712345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Website URL
                </label>
                <input
                  type="url"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="https://example.com"
                />
              </div>
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium"
              >
                Save Website
              </button>
            </form>
          </div>
        )}

        {/* Websites List */}
        <div className="space-y-4">
          {websites.map((website) => (
            <div key={website.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{website.name}</h3>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    {website.website_url && (
                      <div>🌐 {website.website_url}</div>
                    )}
                    {website.contact_email && (
                      <div>📧 {website.contact_email}</div>
                    )}
                    {website.contact_phone && (
                      <div>📞 {website.contact_phone}</div>
                    )}
                    <div>📦 {website.total_orders} total orders</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleWebsite(website.id)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    website.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {website.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Webhook URL */}
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Webhook URL:</label>
                  <button
                    onClick={() => copyToClipboard(`${API_URL}/api/webhook/${website.webhook_key}`)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Copy
                  </button>
                </div>
                <code className="block text-sm bg-white p-3 rounded border border-gray-200 overflow-x-auto">
                  {API_URL}/api/webhook/{website.webhook_key}
                </code>
              </div>

              {/* Integration Instructions */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                  Show Integration Instructions
                </summary>
                <div className="mt-3 p-4 bg-blue-50 rounded-lg text-sm">
                  <p className="font-medium mb-2">Update your WordPress code:</p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-700">
                    <li>Replace the Google Script URL with the webhook URL above</li>
                    <li>The webhook accepts the same JSON format</li>
                    <li>Test by submitting a form - you'll get WhatsApp notifications!</li>
                  </ol>
                  <div className="mt-4">
                    <p className="font-medium mb-2">Example PHP code:</p>
                    <pre className="bg-white p-3 rounded border border-gray-200 overflow-x-auto text-xs">
{`wp_remote_post('${API_URL}/api/webhook/${website.webhook_key}', [
  'headers' => ['Content-Type' => 'application/json'],
  'body' => json_encode($data),
  'timeout' => 15
]);`}
                    </pre>
                  </div>
                </div>
              </details>
            </div>
          ))}
        </div>
    </Layout>
  );
}
