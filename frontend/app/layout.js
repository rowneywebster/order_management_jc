import './globals.css'

export const metadata = {
  title: 'Order Manager',
  description: 'Simple order management system',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
