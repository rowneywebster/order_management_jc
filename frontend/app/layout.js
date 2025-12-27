import './globals.css'
import { AuthProvider } from './providers/AuthProvider'

export const metadata = {
  title: 'Order Manager',
  description: 'Simple order management system',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
