'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../providers/AuthProvider';

const fallbackByRole = {
  admin: '/',
  user: '/orders',
  rider: '/nairobi',
};

export default function ProtectedRoute({ allowedRoles = [], children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      const fallback = fallbackByRole[user.role] || '/login';
      router.replace(fallback);
    }
  }, [allowedRoles, loading, pathname, router, user]);

  if (loading) return null;
  if (!user) return null;
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return null;

  return children;
}
