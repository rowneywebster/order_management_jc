'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../providers/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const next = searchParams.get('next');
      router.replace(next || '/');
    }
  }, [router, searchParams, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      const next = searchParams.get('next');
      router.replace(next || '/');
    } catch (err) {
      console.error('Login failed', err);
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 overflow-hidden">
      <div className="floating-dots pointer-events-none" aria-hidden="true" />
      <div className="w-full max-w-md bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-indigo-50 p-8 space-y-6 animate-fade-in">
        <div className="space-y-3 text-center">
          <div className="flex justify-center">
            <img
              src="https://joyfulcargo.co.ke/wp-content/uploads/2025/10/cropped-cropped-Gemini_Generated_Image_op6zqnop6zqnop6z-removebg-preview.png"
              alt="Joyful Cargo logo"
              className="h-20 w-20 object-contain drop-shadow-sm animate-pop"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
          <p className="text-sm text-gray-500">Access is role-based for admin, user, or rider.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pop {
          0% {
            transform: scale(0.95);
            opacity: 0;
          }
          60% {
            transform: scale(1.03);
            opacity: 1;
          }
          100% {
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        .animate-pop {
          animation: pop 0.5s ease-out forwards;
        }
        .floating-dots {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle at 20% 20%, rgba(79, 70, 229, 0.08), transparent 25%),
            radial-gradient(circle at 80% 10%, rgba(56, 189, 248, 0.08), transparent 22%),
            radial-gradient(circle at 50% 80%, rgba(14, 165, 233, 0.08), transparent 20%);
          z-index: 0;
        }
      `}</style>
    </div>
  );
}
