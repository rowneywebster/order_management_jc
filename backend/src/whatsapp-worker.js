import { Worker } from 'bullmq';
import Redis from 'ioredis';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

// Admin WhatsApp numbers
const ADMIN_NUMBERS = ['+254720809823', '+254726884643'];

// Redis connection
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
});

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

// Send order notification to admins
async function sendOrderNotification(order, websiteName) {
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

🔗 View order: ${process.env.DASHBOARD_URL || 'http://localhost:3000'}/orders/${order.id}
    `.trim();

    // Send to all admin numbers
    for (const adminNumber of ADMIN_NUMBERS) {
        try {
            const formattedNumber = formatWhatsAppNumber(adminNumber);
            await client.sendMessage(formattedNumber, message);
            console.log(`✅ Notification sent to ${adminNumber}`);
        } catch (error) {
            console.error(`❌ Failed to send to ${adminNumber}:`, error.message);
        }
    }
}

// Create worker to process WhatsApp notifications
const worker = new Worker(
    'whatsapp-notifications',
    async (job) => {
        const { order, website } = job.data;
        
        console.log(`📤 Processing notification for order ${order.id}`);
        
        await sendOrderNotification(order, website);
        
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
