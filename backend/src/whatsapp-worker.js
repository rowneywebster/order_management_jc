import { Worker } from 'bullmq';
import Redis from 'ioredis';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import express from 'express';

const { Client, LocalAuth } = pkg;

// Admin WhatsApp numbers
const ADMIN_NUMBERS = ['+254791365400', '+254726884643'];
const RIDER_NUMBERS = (process.env.RIDER_WHATSAPP_NUMBERS || process.env.RIDER_NUMBERS || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
const cleanUrl = (url) => (url || 'http://localhost:3000').replace(/\/+$/, '');

// Redis connection - UPDATED TO USE REDIS_URL
const redis = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    {
        maxRetriesPerRequest: null,
    }
);

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './whatsapp-session'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// QR code for authentication
client.on('qr', (qr) => {
    console.log('📱 Scan this QR code with WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated successfully');
});

client.on('auth_failure', () => {
    console.error('❌ WhatsApp authentication failed');
});

// Initialize client
client.initialize();

// Format phone number for WhatsApp
function formatWhatsAppNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If starts with 0, replace with 254
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    }
    
    // If doesn't start with country code, add 254
    if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    
    return cleaned + '@c.us';
}

async function sendMessageToRecipients(message, recipients) {
    for (const rawNumber of recipients) {
        try {
            const formattedNumber = formatWhatsAppNumber(rawNumber);
            await client.sendMessage(formattedNumber, message);
            console.log(`✅ Notification sent to ${rawNumber}`);
        } catch (error) {
            console.error(`❌ Failed to send to ${rawNumber}:`, error.message);
        }
    }
}

// Send order notification to admins
async function sendOrderNotification(order, websiteName) {
    const dashboardBase = cleanUrl(process.env.DASHBOARD_URL);
    const message = `
🛍️ *NEW ORDER RECEIVED*

📦 *Product:* ${order.product_name || 'N/A'}
🏢 *Website:* ${websiteName}

👤 *Customer Details:*
Name: ${order.customer_name || 'N/A'}
📞 Phone: ${order.phone || 'N/A'}
${order.alt_phone ? `📱 Alt Phone: ${order.alt_phone}` : ''}
${order.email ? `📧 Email: ${order.email}` : ''}

📍 *Location:*
County: ${order.county || 'N/A'}
Address: ${order.location || 'N/A'}

🔢 *Quantity:* ${order.pieces} piece(s)
🆔 *Order ID:* ${order.id}
📅 *Time:* ${new Date(order.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}

🔗 View order: ${dashboardBase}/orders/${order.id}
    `.trim();

    const recipients = ADMIN_NUMBERS.length > 0 ? ADMIN_NUMBERS : RIDER_NUMBERS;
    await sendMessageToRecipients(message, recipients);
}

async function sendNairobiBroadcast(order, dashboardUrl) {
    const baseUrl = cleanUrl(dashboardUrl);
    // Rider broadcast only includes minimal customer info
    const message = `
🛵 *Nairobi Same-Day Order*

👤 Customer: ${order.customer_first_name}
📍 Address: ${order.address}
📦 Product: ${order.product}
💰 Payable to rider: ${order.amount_payable}
Status: ${order.status}

Claim here: ${baseUrl}/nairobi
    `.trim();

    const recipients = RIDER_NUMBERS.length > 0 ? RIDER_NUMBERS : ADMIN_NUMBERS;
    const targetList = Array.isArray(order.recipients) && order.recipients.length > 0 ? order.recipients : recipients;
    if (targetList.length === 0) return;
    await sendMessageToRecipients(message, targetList);
}

async function sendNairobiAssignment(order, recipient, dashboardUrl, riderName) {
    if (!recipient) return;
    const baseUrl = cleanUrl(dashboardUrl);
    // Assignment includes full customer details, sent only to the verified rider
    const message = `
📦 Order Assigned: ${order.product}

👤 Customer: ${order.customer_full_name || order.customer_first_name}
📞 Phone: ${order.phone || 'N/A'}
${order.alt_phone ? `📱 Alt: ${order.alt_phone}` : ''}
📍 Address: ${order.address}
💰 Payable: ${order.amount_payable}
Assigned to: ${riderName || 'Rider'}

Dashboard: ${baseUrl}/nairobi
    `.trim();

    await sendMessageToRecipients(message, [recipient]);
}

async function sendAdminNotification(message, recipients) {
    if (!message) return;
    const targets = Array.isArray(recipients) && recipients.length > 0 ? recipients : ADMIN_NUMBERS;
    if (targets.length === 0) return;
    await sendMessageToRecipients(message, targets);
}

// Create worker to process WhatsApp notifications
const worker = new Worker(
    'whatsapp-notifications',
    async (job) => {
        const { order, website, recipients, dashboardUrl, recipient, rider_name, message } = job.data;

        if (job.name === 'broadcast-nairobi-order') {
            console.log(`📤 Broadcasting Nairobi order ${order.id}`);
            await sendNairobiBroadcast({ ...order, recipients: recipients || [] }, dashboardUrl);
            return { success: true, order_id: order.id };
        }

        if (job.name === 'send-nairobi-assignment') {
            console.log(`📤 Sending Nairobi assignment for order ${order.id}`);
            await sendNairobiAssignment(order, recipient, dashboardUrl, rider_name);
            return { success: true, order_id: order.id };
        }

        if (job.name === 'send-admin-notification') {
            console.log('📤 Sending admin/rider notification');
            await sendAdminNotification(message, recipients);
            return { success: true };
        }

        console.log(`📤 Processing admin notification for order ${order.id}`);
        await sendOrderNotification(order, website, recipients);

        return { success: true, order_id: order.id };
    },
    { connection: redis }
);

worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err.message);
});

console.log('🔄 WhatsApp notification worker started');

// Health check server
const app = express();
const HEALTH_CHECK_PORT = process.env.HEALTH_CHECK_PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', worker: 'whatsapp' });
});

app.listen(HEALTH_CHECK_PORT, () => {
    console.log(`✅ WhatsApp Worker Health Check server listening on port ${HEALTH_CHECK_PORT}`);
});
