'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Layout from '../../../components/Layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function NewPurchasePage() {
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    product_id: '',
    sku: '',
    quantity: 1,
    cost_per_item_kes: '',
    supplier_name: '',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    axios.get(`${API_URL}/api/products`)
      .then(res => {
        setProducts(res.data);
      })
      .catch(err => {
        console.error('Error fetching products:', err);
        setError('Failed to load products.');
      });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'product_id') {
      const selected = products.find(p => p.id === value);
      setFormData(prev => ({
        ...prev,
        product_id: value,
        sku: selected?.sku || '',
      }));
      return;
    }

    if (name === 'sku') {
      const selected = products.find(p => (p.sku || '').toLowerCase() === value.toLowerCase());
      setFormData(prev => ({
        ...prev,
        sku: value,
        product_id: selected?.id || '',
      }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.product_id) {
      setError('Select a SKU/product before adding a purchase.');
      setLoading(false);
      return;
    }

    try {
      await axios.post(`${API_URL}/api/stock-purchases`, formData);
      alert('Stock purchase recorded successfully!');
      router.push('/inventory');
    } catch (err) {
      console.error('Error recording purchase:', err);
      setError(err.response?.data?.error || 'Failed to record purchase.');
      setLoading(false);
    }
  };

  return (
    <Layout title="Add Stock Purchase">
      <div className="bg-white rounded-lg shadow p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU</label>
              <select
                id="sku"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
              >
                <option value="">None (no stock update)</option>
                {products.map(p => (
                  <option key={p.id} value={p.sku || ''}>{p.sku || '(No SKU)'} — {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="product_id" className="block text-sm font-medium text-gray-700">Product</label>
              <select
                id="product_id"
                name="product_id"
                value={formData.product_id}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
              >
                <option value="">None (no stock update)</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Quantity</label>
              <input
                type="number"
                id="quantity"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                min="1"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
              />
            </div>
            <div>
              <label htmlFor="cost_per_item_kes" className="block text-sm font-medium text-gray-700">Cost per Item (KES)</label>
              <input
                type="number"
                id="cost_per_item_kes"
                name="cost_per_item_kes"
                value={formData.cost_per_item_kes}
                onChange={handleChange}
                step="0.01"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="supplier_name" className="block text-sm font-medium text-gray-700">Supplier</label>
              <input
                type="text"
                id="supplier_name"
                name="supplier_name"
                value={formData.supplier_name}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
              />
            </div>
            <div>
              <label htmlFor="purchase_date" className="block text-sm font-medium text-gray-700">Purchase Date</label>
              <input
                type="date"
                id="purchase_date"
                name="purchase_date"
                value={formData.purchase_date}
                onChange={handleChange}
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
              />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows="3"
              value={formData.notes}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
            ></textarea>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-end gap-4">
            <button type="button" onClick={() => router.back()} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-md">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded-md disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Purchase'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
