'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter, useParams } from 'next/navigation';
import Layout from '../../../components/Layout';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const [formData, setFormData] = useState(null);
  const [products, setProducts] = useState([]);
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id) {
      Promise.all([
        axios.get(`${API_URL}/api/orders/${id}`),
        axios.get(`${API_URL}/api/products`),
        axios.get(`${API_URL}/api/websites`),
      ])
      .then(([orderRes, productsRes, websitesRes]) => {
        setProducts(productsRes.data);
        setWebsites(websitesRes.data);

        const existing = orderRes.data;
        const matchedProduct = productsRes.data.find(p => p.id === existing.product_id);
        setFormData({
          ...existing,
          sku: matchedProduct?.sku || existing.sku || ''
        });
      })
      .catch(err => {
        console.error('Error fetching data:', err);
        setError('Failed to load order data.');
      })
      .finally(() => setLoading(false));
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'product_id') {
      const selected = products.find(p => p.id === value);
      setFormData(prev => ({
        ...prev,
        product_id: value,
        sku: selected?.sku || '',
        product_name: selected?.name || prev.product_name
      }));
      return;
    }

    if (name === 'sku') {
      const selected = products.find(p => (p.sku || '').toLowerCase() === value.toLowerCase());
      setFormData(prev => ({
        ...prev,
        sku: value,
        product_id: selected?.id || '',
        product_name: selected?.name || prev.product_name
      }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if ((formData.status === 'completed' || formData.status === 'returned') && !formData.product_id) {
      setError('Select a SKU/product before marking an order as completed or returned.');
      setLoading(false);
      return;
    }

    try {
      await axios.put(`${API_URL}/api/orders/${id}`, formData);
      alert('Order updated successfully!');
      router.push('/');
    } catch (err) {
      console.error('Error updating order:', err);
      setError(err.response?.data?.error || 'Failed to update order.');
      setLoading(false);
    }
  };

  if (loading) {
    return <Layout title="Edit Order"><p>Loading...</p></Layout>;
  }

  if (error) {
    return <Layout title="Edit Order"><p className="text-red-500">{error}</p></Layout>;
  }

  return (
    <Layout title="Edit Order">
      <div className="bg-white rounded-lg shadow p-8">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Website */}
          <div className="md:col-span-2">
            <label htmlFor="website_id" className="block text-sm font-medium text-gray-700">Website</label>
            <select id="website_id" name="website_id" value={formData.website_id} onChange={handleChange} required className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
              {websites.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          {/* SKU */}
          <div>
            <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU</label>
            <select
              id="sku"
              name="sku"
              value={formData.sku || ''}
              onChange={handleChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="">None (no stock update)</option>
              {products.map(p => (
                <option key={p.id} value={p.sku || ''}>{p.sku || '(No SKU)'} — {p.name}</option>
              ))}
            </select>
          </div>

          {/* Product */}
          <div>
            <label htmlFor="product_id" className="block text-sm font-medium text-gray-700">Product</label>
            <select id="product_id" name="product_id" value={formData.product_id} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
              <option value="">None (no stock update)</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Customer Name */}
          <div>
            <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700">Customer Name</label>
            <input type="text" id="customer_name" name="customer_name" value={formData.customer_name} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
            <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* Alt Phone */}
          <div>
            <label htmlFor="alt_phone" className="block text-sm font-medium text-gray-700">Alternative Phone</label>
            <input type="tel" id="alt_phone" name="alt_phone" value={formData.alt_phone} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* Email */}
          <div className="md:col-span-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
            <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* County */}
          <div>
            <label htmlFor="county" className="block text-sm font-medium text-gray-700">County</label>
            <input type="text" id="county" name="county" value={formData.county} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* Location */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700">Location Details</label>
            <input type="text" id="location" name="location" value={formData.location} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* Pieces */}
          <div>
            <label htmlFor="pieces" className="block text-sm font-medium text-gray-700">Pieces</label>
            <input type="number" id="pieces" name="pieces" value={formData.pieces} onChange={handleChange} min="1" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="amount_kes" className="block text-sm font-medium text-gray-700">Amount (KES)</label>
            <input type="number" id="amount_kes" name="amount_kes" value={formData.amount_kes} onChange={handleChange} step="0.01" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" />
          </div>

          {/* Status */}
          <div className="md:col-span-1">
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
            <select id="status" name="status" value={formData.status} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
              <option>pending</option>
              <option>approved</option>
              <option>cancelled</option>
              <option>rescheduled</option>
              <option>completed</option>
              <option>returned</option> {/* Added 'returned' status */}
            </select>
          </div>

          {/* Courier */}
          <div className="md:col-span-1">
            <label htmlFor="courier" className="block text-sm font-medium text-gray-700">Courier</label>
            <select id="courier" name="courier" value={formData.courier || 'Rowney'} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
              <option value="Speedaf">Speedaf</option>
              <option value="Standard Courier">Standard Courier</option>
              <option value="G4S">G4S</option>
              <option value="Star Sea">Star Sea</option>
              <option value="Wells Fargo">Wells Fargo</option>
              <option value="JP">JP</option>
              <option value="Buscar">Buscar</option>
              <option value="Rowney">Rowney</option>
            </select>
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea id="notes" name="notes" rows="3" value={formData.notes} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"></textarea>
          </div>

          {error && <div className="md:col-span-2 text-red-600 text-sm">{error}</div>}

          <div className="md:col-span-2 flex justify-end gap-4">
            <Link href="/" className="bg-gray-200 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-300">Cancel</Link>
            <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
