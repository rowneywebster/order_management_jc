'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Layout({ title, children }) {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/expenses', label: 'Expenses' },
    { href: '/rescheduled', label: 'Rescheduled' },
    { href: '/websites', label: 'Websites' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/">
                <img src="https://joyfulcargo.co.ke/wp-content/uploads/2025/10/cropped-cropped-Gemini_Generated_Image_op6zqnop6zqnop6z-removebg-preview.png" alt="Logo" className="h-10 w-auto" />
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            </div>
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex gap-4">
                {navLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      pathname === link.href 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <Link href="/orders/new" className="ml-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                + Add Order
              </Link>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
