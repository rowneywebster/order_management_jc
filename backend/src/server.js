import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

dotenv.config();
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'order_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

// Redis connection for queue
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
});

// WhatsApp Queue
const whatsappQueue = new Queue('whatsapp-notifications', { connection: redis });

app.use(cors());
app.use(express.json());

// ==================== WEBHOOK ENDPOINT ====================
app.post('/api/webhook/:webhook_key', async (req, res) => {
    try {
        const { webhook_key } = req.params;
        const orderData = req.body;

        // Verify webhook key
        const websiteResult = await pool.query(
            'SELECT id, name FROM websites WHERE webhook_key = $1 AND is_active = true',
            [webhook_key]
        );

        if (websiteResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid webhook key' });
        }

        const website = websiteResult.rows[0];

        // Insert order
        const result = await pool.query(
            `INSERT INTO orders (
                website_id, form_id, product_name, entry_id, 
                customer_name, phone, alt_phone, email, 
                county, location, pieces, courier
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
            RETURNING *`,
            [
                website.id,
                orderData.form_id,
                orderData.product,
                orderData.entry_id,
                orderData.name,
                orderData.phone,
                orderData.alt_phone,
                orderData.email,
                orderData.county,
                orderData.location,
                orderData.pieces || 1,
                orderData.courier || 'Rowney' // Default to 'Rowney' if not provided
            ]
        );

        const order = result.rows[0];

        // Queue WhatsApp notification
        await whatsappQueue.add('send-order-notification', {
            order,
            website: website.name
        });

        res.json({ 
            success: true, 
            order_id: order.id,
            message: 'Order received successfully' 
        });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Failed to process order' });
    }
});

// ==================== ORDERS API ====================
// Get all orders with filters
app.get('/api/orders', async (req, res) => {
    try {
        const { status, date_from, date_to, website_id } = req.query;
        
        let query = `
            SELECT o.*, w.name as website_name 
            FROM orders o 
            LEFT JOIN websites w ON o.website_id = w.id 
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (status) {
            query += ` AND o.status = ${paramCount}`;
            params.push(status);
            paramCount++;
        }

        if (date_from) {
            query += ` AND o.created_at >= ${paramCount}`;
            params.push(date_from);
            paramCount++;
        }

        if (date_to) {
            query += ` AND o.created_at <= ${paramCount}`;
            params.push(date_to);
            paramCount++;
        }

        if (website_id) {
            query += ` AND o.website_id = ${paramCount}`;
            params.push(website_id);
            paramCount++;
        }

        query += ' ORDER BY o.created_at DESC LIMIT 500';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Add new order manually
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;

        // Basic validation
        if (!orderData.website_id || !orderData.customer_name || !orderData.phone || !orderData.product_name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await pool.query(
            `INSERT INTO orders (
                website_id, form_id, product_name, entry_id, 
                customer_name, phone, alt_phone, email, 
                county, location, pieces, status, notes, courier
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
            RETURNING *`,
            [
                orderData.website_id,
                orderData.form_id || 'manual',
                orderData.product_name,
                orderData.entry_id,
                orderData.customer_name,
                orderData.phone,
                orderData.alt_phone,
                orderData.email,
                orderData.county,
                orderData.location,
                orderData.pieces || 1,
                orderData.status || 'pending',
                orderData.notes,
                orderData.courier // Add courier field
            ]
        );

        const order = result.rows[0];

        // Fetch website name for notification
        const websiteResult = await pool.query('SELECT name FROM websites WHERE id = $1', [order.website_id]);
        const websiteName = websiteResult.rows.length > 0 ? websiteResult.rows[0].name : 'N/A';

        // Queue WhatsApp notification
        await whatsappQueue.add('send-order-notification', {
            order,
            website: websiteName
        });

        res.status(201).json({ 
            success: true, 
            order_id: order.id,
            message: 'Order created successfully' 
        });

    } catch (error) {
        console.error('Manual order error:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});


// Get order statistics
app.get('/api/orders/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_count,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_count,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as month_count,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
                COUNT(*) FILTER (WHERE status = 'rescheduled') as rescheduled_count,
                COUNT(*) as total_count,
                COALESCE(SUM(amount_kes) FILTER (WHERE status = 'completed'), 0) as total_revenue
            FROM orders
        `);

        const expense_stats = await pool.query(`
            SELECT COALESCE(SUM(amount_kes), 0) as total_expenses FROM expenses
        `);

        res.json({ ...stats.rows[0], ...expense_stats.rows[0] });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get rescheduled orders
app.get('/api/orders/rescheduled', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, w.name as website_name 
            FROM orders o 
            LEFT JOIN websites w ON o.website_id = w.id 
            WHERE o.status = 'rescheduled' 
            AND o.rescheduled_date IS NOT NULL
            ORDER BY o.rescheduled_date ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Rescheduled orders error:', error);
        res.status(500).json({ error: 'Failed to fetch rescheduled orders' });
    }
});

// Get a single order by ID
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get order by ID error:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// Update order status
app.patch('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rescheduled_date, notes, amount_kes, product_id, courier } = req.body;

        let query = 'UPDATE orders SET updated_at = NOW()';
        const params = [];
        let paramCount = 1;

        if (status) {
            query += `, status = ${paramCount}`;
            params.push(status);
            paramCount++;
        }

        if (rescheduled_date) {
            query += `, rescheduled_date = ${paramCount}`;
            params.push(rescheduled_date);
            paramCount++;
        }

        if (notes !== undefined) {
            query += `, notes = ${paramCount}`;
            params.push(notes);
            paramCount++;
        }

        if (amount_kes !== undefined) {
            query += `, amount_kes = ${paramCount}`;
            params.push(amount_kes);
            paramCount++;
        }

        if (product_id !== undefined) {
            query += `, product_id = ${paramCount}`;
            params.push(product_id);
            paramCount++;
        }

        if (courier !== undefined) {
            query += `, courier = ${paramCount}`;
            params.push(courier);
            paramCount++;
        }

        query += ` WHERE id = ${paramCount} RETURNING *`;
        params.push(id);

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update order error:', error);
        console.error('Error details:', error.message, error.stack); // Added detailed error logging
        res.status(500).json({ error: 'Failed to update order', details: error.message });
    }
});

// Update a full order
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            website_id, product_id, form_id, product_name, entry_id,
            customer_name, phone, alt_phone, email, county, location,
            pieces, amount_kes, status, rescheduled_date, notes, courier
        } = req.body;

        const result = await pool.query(
            `UPDATE orders SET
                website_id = $1, product_id = $2, form_id = $3, product_name = $4, entry_id = $5,
                customer_name = $6, phone = $7, alt_phone = $8, email = $9, county = $10, location = $11,
                pieces = $12, amount_kes = $13, status = $14, rescheduled_date = $15, notes = $16,
                courier = $17, updated_at = NOW()
            WHERE id = $18 RETURNING *`,
            [
                website_id, product_id, form_id, product_name, entry_id,
                customer_name, phone, alt_phone, email, county, location,
                pieces, amount_kes, status, rescheduled_date, notes, courier, id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update full order error:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// ==================== WEBSITES API ====================
// Get all websites
app.get('/api/websites', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT w.*, 
                COUNT(o.id) as total_orders 
            FROM websites w 
            LEFT JOIN orders o ON w.id = o.website_id 
            GROUP BY w.id 
            ORDER BY w.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Get websites error:', error);
        res.status(500).json({ error: 'Failed to fetch websites' });
    }
});

// Add new website
app.post('/api/websites', async (req, res) => {
    try {
        const { name, contact_email, contact_phone, website_url } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Website name is required' });
        }

        // Generate unique webhook key
        const webhook_key = `wh_${Math.random().toString(36).substring(2, 15)}${Date.now().toString(36)}`;

        const result = await pool.query(
            `INSERT INTO websites (name, webhook_key, contact_email, contact_phone, website_url) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, webhook_key, contact_email, contact_phone, website_url]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Add website error:', error);
        res.status(500).json({ error: 'Failed to add website' });
    }
});

// Toggle website active status
app.patch('/api/websites/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE websites SET is_active = NOT is_active WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Website not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Toggle website error:', error);
        res.status(500).json({ error: 'Failed to toggle website' });
    }
});

// ==================== PRODUCTS API ====================
// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT p.*, COALESCE(i.quantity, 0) as quantity FROM products p LEFT JOIN inventory i ON p.id = i.product_id ORDER BY p.created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Add new product
app.post('/api/products', async (req, res) => {
    try {
        const { name, sku, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Product name is required' });
        }
        const result = await pool.query(
            'INSERT INTO products (name, sku, description) VALUES ($1, $2, $3) RETURNING *',
            [name, sku, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add product error:', error);
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'A product with this name or SKU already exists.' });
        }
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, sku, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Product name is required' });
        }
        const result = await pool.query(
            'UPDATE products SET name = $1, sku = $2, description = $3 WHERE id = $4 RETURNING *',
            [name, sku, description, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ==================== STOCK PURCHASES API ====================
// Get all stock purchases
app.get('/api/stock-purchases', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT sp.*, p.name as product_name 
            FROM stock_purchases sp 
            JOIN products p ON sp.product_id = p.id 
            ORDER BY sp.purchase_date DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Get stock purchases error:', error);
        res.status(500).json({ error: 'Failed to fetch stock purchases' });
    }
});

// Add new stock purchase
app.post('/api/stock-purchases', async (req, res) => {
    try {
        const { product_id, quantity, cost_per_item_kes, supplier_name, purchase_date, notes } = req.body;

        if (!product_id || !quantity || !cost_per_item_kes || !purchase_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const total_cost_kes = parseFloat(cost_per_item_kes) * parseInt(quantity, 10);

        const result = await pool.query(
            `INSERT INTO stock_purchases (product_id, quantity, cost_per_item_kes, total_cost_kes, supplier_name, purchase_date, notes) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [product_id, quantity, cost_per_item_kes, total_cost_kes, supplier_name, purchase_date, notes]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add stock purchase error:', error);
        res.status(500).json({ error: 'Failed to add stock purchase' });
    }
});

// ==================== EXPENSES API ====================
// Get all expense categories
app.get('/api/expense-categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM expense_categories ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Get expense categories error:', error);
        res.status(500).json({ error: 'Failed to fetch expense categories' });
    }
});

// Get all expenses
app.get('/api/expenses', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, ec.name as category_name 
            FROM expenses e 
            LEFT JOIN expense_categories ec ON e.category_id = ec.id 
            ORDER BY e.expense_date DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Get expenses error:', error);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

// Add new expense
app.post('/api/expenses', async (req, res) => {
    try {
        const { category_id, description, amount_kes, expense_date } = req.body;
        if (!description || !amount_kes || !expense_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const result = await pool.query(
            'INSERT INTO expenses (category_id, description, amount_kes, expense_date) VALUES ($1, $2, $3, $4) RETURNING *',
            [category_id, description, amount_kes, expense_date]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add expense error:', error);
        res.status(500).json({ error: 'Failed to add expense' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Order Manager API running on port ${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/api/webhook/{webhook_key}`);
});
