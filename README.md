# 📦 Order Manager System

A simple, self-hosted order management system with WhatsApp notifications for managing orders from multiple websites.

## ✨ Features

- ✅ **Multi-website support** - Easy onboarding for new websites
- 📱 **WhatsApp notifications** - Instant alerts to 2 admin numbers
- 📊 **Dashboard with stats** - Daily, weekly, monthly order summaries
- ⚡ **Order management** - Approve, cancel, or reschedule orders
- 📅 **Reschedule calendar** - Track and manage rescheduled orders
- 🔄 **Real-time updates** - Orders sync instantly across dashboard

## 🛠️ Tech Stack

- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: Next.js 14 + Tailwind CSS
- **Queue**: BullMQ + Redis
- **WhatsApp**: whatsapp-web.js
- **Deployment**: Docker + Coolify

## 📋 Prerequisites

- Coolify hosting plan (or Docker + Docker Compose)
- WhatsApp account for notifications
- Domain name (optional, for production)

## 🚀 Quick Start

### 1. Clone & Setup

```bash
# Copy environment variables
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 2. Configure Environment

Edit `.env` file:

```env
DB_PASSWORD=your_secure_password_123
DASHBOARD_URL=https://orders.yourdomain.com
API_URL=https://api.yourdomain.com
```

### 3. Deploy on Coolify

#### Option A: Using Coolify UI

1. Create new project in Coolify
2. Add PostgreSQL database
3. Add Redis
4. Deploy using docker-compose.yml
5. Set environment variables

#### Option B: Manual Docker Compose

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 4. Initialize Database

Database will auto-initialize from `database/schema.sql` on first run.

### 5. Connect WhatsApp

```bash
# View WhatsApp worker logs to get QR code
docker-compose logs -f whatsapp-worker

# Scan QR code with your WhatsApp account
# Notifications will be sent to:
# - +254720809823
# - +254726884643
### 6. Add Website
```

## 📱 WhatsApp Setup

1. WhatsApp worker will display a QR code on first run
2. Scan with your WhatsApp account (will be used to send messages)
3. Once authenticated, session is saved
4. Orders will automatically send notifications to both admin numbers

## 🌐 Onboarding New Websites

### Step 1: Add Website in Dashboard

1. Go to `/websites` page
2. Click "Add New Website"
3. Fill in details:
   - Website name
   - Contact email
   - Contact phone
   - Website URL
4. Click "Save Website"
5. You'll get a unique webhook URL

### Step 2: Update WordPress Code

Replace the Google Script URL in your WordPress code:

**Before:**
```php
wp_remote_post('https://script.google.com/macros/s/...', [
    'body' => json_encode($data),
]);
```

**After:**
```php
wp_remote_post('https://api.yourdomain.com/api/webhook/YOUR_WEBHOOK_KEY', [
    'headers' => ['Content-Type' => 'application/json'],
    'body' => json_encode($data),
    'timeout' => 15
]);
```

That's it! Orders will now flow through your system.

## 📊 Using the Dashboard

### Home Dashboard (`/`)
- View daily, weekly, monthly order stats
- See all recent orders
- Approve, cancel, or reschedule orders
- Pending orders highlighted

### Rescheduled Orders (`/rescheduled`)
- View all orders scheduled for delivery
- Today's deliveries highlighted
- Complete or cancel from this view

### Websites Management (`/websites`)
- Add new websites
- View webhook URLs
- Toggle websites active/inactive
- See integration instructions

## 🔧 Updating Your Current Setup

### Update your WordPress function:

```php
function bestcart_process_order($fields, $entry, $form_data, $entry_id) {
    $active_forms = [6405, 6299, 5920, ...]; // Your existing forms
    
    if (!in_array($form_data['id'], $active_forms)) return;
    
    // ... your existing data collection code ...
    
    // NEW: Use your webhook instead of Google Script
    $response = wp_remote_post('https://api.yourdomain.com/api/webhook/bestcart_secure_key_2024', [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode($data),
        'blocking' => false,
        'timeout' => 15
    ]);
    
    if (is_wp_error($response)) {
        error_log('Order Manager Error: ' . $response->get_error_message());
    }
}
```

## 📦 API Endpoints

### Webhook (Public)
- `POST /api/webhook/:webhook_key` - Receive orders

### Orders
- `GET /api/orders` - List orders (with filters)
- `GET /api/orders/stats` - Get order statistics
- `GET /api/orders/rescheduled` - Get rescheduled orders
- `PATCH /api/orders/:id` - Update order status

### Websites
- `GET /api/websites` - List websites
- `POST /api/websites` - Add new website
- `PATCH /api/websites/:id/toggle` - Toggle active status

## 🔒 Security

- Unique webhook keys for each website
- PostgreSQL for data persistence
- Environment variables for sensitive data
- HTTPS recommended for production

## 🐛 Troubleshooting

### WhatsApp not connecting?
```bash
# Restart WhatsApp worker
docker-compose restart whatsapp-worker

# Check logs
docker-compose logs whatsapp-worker
```

### Orders not appearing?
```bash
# Check backend logs
docker-compose logs backend

# Verify webhook key is correct
# Check database connection
```

### Database issues?
```bash
# Access PostgreSQL
docker-compose exec postgres psql -U postgres -d order_manager

# Check tables
\dt

# View orders
SELECT * FROM orders LIMIT 10;
```

## 📁 Project Structure

```
order-manager/
├── backend/
│   ├── src/
│   │   ├── server.js          # Main API server
│   │   └── whatsapp-worker.js # WhatsApp notifications
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── page.js            # Dashboard
│   │   ├── rescheduled/       # Rescheduled orders
│   │   └── websites/          # Website management
│   ├── Dockerfile
│   └── package.json
├── database/
│   └── schema.sql             # Database schema
├── docker-compose.yml
└── README.md
```

## 🎯 Next Steps

1. ✅ Deploy on Coolify
2. ✅ Connect WhatsApp
3. ✅ Add your first website
4. ✅ Update WordPress webhook URL
5. ✅ Test with a form submission
6. 🎉 Start managing orders!

## 💡 Tips

- Keep WhatsApp session backed up (whatsapp-session folder)
- Monitor Redis queue for failed jobs
- Set up regular database backups
- Use HTTPS in production
- Add more admin numbers by editing `whatsapp-worker.js`

## 📞 Support

Check logs for debugging:
```bash
docker-compose logs -f
```

---

**Built with ❤️ for simple order management**
