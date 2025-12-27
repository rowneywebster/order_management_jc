'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Layout({ title, children }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logoUrl =
    'https://joyfulcargo.co.ke/wp-content/uploads/2025/10/cropped-cropped-Gemini_Generated_Image_op6zqnop6zqnop6z-removebg-preview.png';
  const toggleIconUrl = 'https://joyfulcargo.co.ke/wp-content/uploads/2025/12/sidebar.png';

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/orders', label: 'Orders' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/expenses', label: 'Expenses' },
    { href: '/performance', label: 'Performance' },
    { href: '/websites', label: 'Websites' },
  ];

  const isActive = (href) => {
    if (href === '/') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 shadow-sm transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <Link href="/" className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Order Manager logo"
              className="h-10 w-10 rounded-lg object-contain bg-gray-50"
            />
            <div>
              <p className="text-sm font-semibold text-gray-900">Order Manager</p>
              <p className="text-xs text-gray-500">Control Center</p>
            </div>
          </Link>
        </div>
        <nav className="p-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-[0_1px_2px_rgba(59,130,246,0.15)]'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{link.label}</span>
              {isActive(link.href) && <span className="h-2 w-2 rounded-full bg-blue-600" />}
            </Link>
          ))}
        </nav>
        <div className="px-4 pb-6">
          <Link
            href="/orders/new"
            onClick={() => setSidebarOpen(false)}
            className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-blue-700 transition-colors"
          >
            + Add Order
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100 lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Toggle navigation"
              >
                <span className="sr-only">Toggle navigation</span>
                <img
                  src={toggleIconUrl}
                  alt="Toggle sidebar"
                  className="h-8 w-8 object-contain"
                />
              </button>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Order Manager</p>
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              </div>
            </div>
            <Link
              href="/orders/new"
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg shadow bg-blue-600 text-white hover:bg-blue-700"
            >
              + Add Order
            </Link>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
