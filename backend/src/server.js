import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import { Queue } from 'bullmq';
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

// Redis connection for queue - UPDATED TO USE REDIS_URL
const redis = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    {
        maxRetriesPerRequest: null,
    }
);

// WhatsApp Queue
const whatsappQueue = new Queue('whatsapp-notifications', { connection: redis });

app.use(cors());
app.use(express.json());

// Helper: resolve product_id using provided identifiers
async function resolveProductId({ product_id, sku, product_name }) {
    if (product_id) return product_id;

    if (sku) {
        const skuResult = await pool.query(
            'SELECT id, name FROM products WHERE LOWER(sku) = LOWER($1)',
            [sku]
        );
        if (skuResult.rows.length > 0) {
            return skuResult.rows[0].id;
        }
    }

    if (product_name) {
        const nameResult = await pool.query(
            'SELECT id FROM products WHERE LOWER(name) = LOWER($1)',
            [product_name]
        );
        if (nameResult.rows.length > 0) {
            return nameResult.rows[0].id;
        }
    }

    return null;
}

// Helper: get product name from id
async function getProductName(productId) {
    if (!productId) return null;
    const result = await pool.query('SELECT name FROM products WHERE id = $1', [productId]);
    return result.rows[0]?.name || null;
}

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

        const resolvedProductId = await resolveProductId({
            sku: orderData.sku,
            product_name: orderData.product
        });
        const resolvedProductName = resolvedProductId ? await getProductName(resolvedProductId) : orderData.product;

        // Insert order
        const result = await pool.query(
            `INSERT INTO orders (
                website_id, form_id, product_name, entry_id, 
                customer_name, phone, alt_phone, email, 
                county, location, pieces, courier, product_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
            RETURNING *`,
            [
                website.id,
                orderData.form_id,
                resolvedProductName || orderData.product,
                orderData.entry_id,
                orderData.name,
                orderData.phone,
                orderData.alt_phone,
                orderData.email,
                orderData.county,
                orderData.location,
                orderData.pieces || 1,
                orderData.courier || 'Rowney',
                resolvedProductId
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
        const { status, date_from, date_to, website_id, search, page, limit, paginated } = req.query;
        const isPaginated = paginated === 'true' || paginated === true;
        const maxRows = 500;
        const pageSize = Math.min(parseInt(limit, 10) || (isPaginated ? 20 : maxRows), maxRows);
        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const offset = (pageNumber - 1) * pageSize;
        
        let baseQuery = `
            FROM orders o 
            LEFT JOIN websites w ON o.website_id = w.id 
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (status) {
            baseQuery += ` AND o.status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        if (date_from) {
            baseQuery += ` AND o.created_at >= $${paramCount}`;
            params.push(date_from);
            paramCount++;
        }

        if (date_to) {
            baseQuery += ` AND o.created_at <= $${paramCount}`;
            params.push(date_to);
            paramCount++;
        }

        if (website_id) {
            baseQuery += ` AND o.website_id = $${paramCount}`;
            params.push(website_id);
            paramCount++;
        }

        if (search) {
            baseQuery += ` AND (
                o.customer_name ILIKE $${paramCount} OR 
                o.phone ILIKE $${paramCount} OR 
                o.product_name ILIKE $${paramCount} OR
                o.county ILIKE $${paramCount}
            )`;
            params.push(`%${search}%`);
            paramCount++;
        }

        let safePage = pageNumber;
        let totalPages = 1;
        let cappedTotal = 0;

        if (isPaginated) {
            const countQuery = `SELECT COUNT(*) ${baseQuery}`;
            const countResult = await pool.query(countQuery, params);
            const total = parseInt(countResult.rows[0].count, 10);
            cappedTotal = Math.min(total, maxRows);
            totalPages = Math.max(1, Math.ceil(cappedTotal / pageSize));
            safePage = Math.min(pageNumber, totalPages);
        }

        const cappedOffset = Math.min((safePage - 1) * pageSize, Math.max(0, maxRows - pageSize));

        const dataQuery = `
            SELECT o.*, w.name as website_name 
            ${baseQuery}
            ORDER BY o.created_at DESC 
            LIMIT ${pageSize}
            ${isPaginated ? `OFFSET ${cappedOffset}` : ''}
        `;

        const result = await pool.query(dataQuery, params);

        if (isPaginated) {
            return res.json({
                orders: result.rows,
                total: cappedTotal,
                page: safePage,
                pageSize,
                totalPages
            });
        }

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

        if (!orderData.website_id || !orderData.customer_name || !orderData.phone) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const resolvedProductId = await resolveProductId({
            product_id: orderData.product_id,
            sku: orderData.sku,
            product_name: orderData.product_name
        });
        const resolvedProductName = resolvedProductId
            ? await getProductName(resolvedProductId)
            : orderData.product_name;

        const result = await pool.query(
            `INSERT INTO orders (
                website_id, form_id, product_name, entry_id, 
                customer_name, phone, alt_phone, email, 
                county, location, pieces, status, notes, courier, product_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
            RETURNING *`,
            [
                orderData.website_id,
                orderData.form_id || 'manual',
                resolvedProductName || orderData.product_name,
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
                orderData.courier,
                resolvedProductId
            ]
        );

        const order = result.rows[0];

        const websiteResult = await pool.query('SELECT name FROM websites WHERE id = $1', [order.website_id]);
        const websiteName = websiteResult.rows.length > 0 ? websiteResult.rows[0].name : 'N/A';

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
                COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as current_month_orders,
                COUNT(*) FILTER (WHERE status = 'pending' AND created_at >= date_trunc('month', CURRENT_DATE)) as current_month_pending_orders,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
                COUNT(*) FILTER (WHERE status = 'rescheduled') as rescheduled_count,
                COUNT(*) as total_count,
                COALESCE(SUM(amount_kes) FILTER (WHERE status = 'completed'), 0) as total_revenue,
                COALESCE(SUM(amount_kes) FILTER (WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_DATE)), 0) as current_month_revenue
            FROM orders
        `);

        const expense_stats = await pool.query(`
            SELECT 
                COALESCE(SUM(amount_kes), 0) as total_expenses,
                COALESCE(SUM(amount_kes) FILTER (WHERE expense_date >= date_trunc('month', CURRENT_DATE)), 0) as current_month_expenses
            FROM expenses
        `);

        const combined = { ...stats.rows[0], ...expense_stats.rows[0] };

        const total_profit = parseFloat(combined.total_revenue || 0) - parseFloat(combined.total_expenses || 0);
        const current_month_profit = parseFloat(combined.current_month_revenue || 0) - parseFloat(combined.current_month_expenses || 0);

        res.json({ 
            ...combined,
            total_profit,
            current_month_profit,
            all_time: {
                revenue: combined.total_revenue,
                expenses: combined.total_expenses,
                profit: total_profit,
                orders: combined.total_count,
                pending_orders: combined.pending_count
            },
            current_month: {
                revenue: combined.current_month_revenue,
                expenses: combined.current_month_expenses,
                profit: current_month_profit,
                orders: combined.current_month_orders,
                pending_orders: combined.current_month_pending_orders
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Monthly performance grouped by calendar month
app.get('/api/performance/monthly', async (req, res) => {
    try {
        const result = await pool.query(`
            WITH date_bounds AS (
                SELECT 
                    LEAST(
                        COALESCE((SELECT MIN(created_at) FROM orders), CURRENT_DATE),
                        COALESCE((SELECT MIN(expense_date) FROM expenses), CURRENT_DATE)
                    ) AS start_date
            ),
            months AS (
                SELECT generate_series(
                    date_trunc('month', (SELECT start_date FROM date_bounds)),
                    date_trunc('month', CURRENT_DATE),
                    interval '1 month'
                ) AS month_start
            ),
            order_totals AS (
                SELECT 
                    date_trunc('month', created_at) AS month_start,
                    COALESCE(SUM(amount_kes) FILTER (WHERE status = 'completed'), 0) AS revenue,
                    COUNT(*) AS total_orders
                FROM orders
                GROUP BY 1
            ),
            expense_totals AS (
                SELECT 
                    date_trunc('month', expense_date) AS month_start,
                    COALESCE(SUM(amount_kes), 0) AS expenses
                FROM expenses
                GROUP BY 1
            )
            SELECT 
                to_char(m.month_start, 'YYYY-MM') AS month,
                COALESCE(o.revenue, 0) AS revenue,
                COALESCE(e.expenses, 0) AS expenses,
                COALESCE(o.revenue, 0) - COALESCE(e.expenses, 0) AS profit,
                COALESCE(o.total_orders, 0) AS total_orders
            FROM months m
            LEFT JOIN order_totals o ON m.month_start = o.month_start
            LEFT JOIN expense_totals e ON m.month_start = e.month_start
            ORDER BY m.month_start DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Monthly performance error:', error);
        res.status(500).json({ error: 'Failed to fetch performance data' });
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
        const { status, rescheduled_date, notes, amount_kes, product_id, courier, sku, product_name } = req.body;

        const existing = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const currentOrder = existing.rows[0];

        const resolvedProductId = await resolveProductId({
            product_id: product_id || currentOrder.product_id,
            sku,
            product_name: product_name || currentOrder.product_name
        });
        const resolvedProductName = resolvedProductId
            ? await getProductName(resolvedProductId)
            : (product_name || currentOrder.product_name);

        if ((status === 'completed' || status === 'returned') && !resolvedProductId) {
            return res.status(400).json({ error: 'Cannot complete or return order without SKU/product link' });
        }

        let query = 'UPDATE orders SET updated_at = NOW()';
        const params = [];
        let paramCount = 1;

        if (status) {
            query += `, status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        if (rescheduled_date) {
            query += `, rescheduled_date = $${paramCount}`;
            params.push(rescheduled_date);
            paramCount++;
        }

        if (notes !== undefined) {
            query += `, notes = $${paramCount}`;
            params.push(notes);
            paramCount++;
        }

        if (amount_kes !== undefined) {
            query += `, amount_kes = $${paramCount}`;
            params.push(amount_kes);
            paramCount++;
        }

        query += `, product_id = $${paramCount}`;
        params.push(resolvedProductId);
        paramCount++;

        if (resolvedProductName) {
            query += `, product_name = $${paramCount}`;
            params.push(resolvedProductName);
            paramCount++;
        }

        if (courier !== undefined) {
            query += `, courier = $${paramCount}`;
            params.push(courier);
            paramCount++;
        }

        query += ` WHERE id = $${paramCount} RETURNING *`;
        params.push(id);

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Failed to update order', details: error.message });
    }
});

// Update a full order
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            website_id, product_id, form_id, product_name, entry_id, sku,
            customer_name, phone, alt_phone, email, county, location,
            pieces, amount_kes, status, rescheduled_date, notes, courier
        } = req.body;

        const resolvedProductId = await resolveProductId({
            product_id,
            sku,
            product_name
        });
        const resolvedProductName = resolvedProductId ? await getProductName(resolvedProductId) : product_name;

        if ((status === 'completed' || status === 'returned') && !resolvedProductId) {
            return res.status(400).json({ error: 'Cannot complete or return order without SKU/product link' });
        }

        const result = await pool.query(
            `UPDATE orders SET
                website_id = $1, product_id = $2, form_id = $3, product_name = $4, entry_id = $5,
                customer_name = $6, phone = $7, alt_phone = $8, email = $9, county = $10, location = $11,
                pieces = $12, amount_kes = $13, status = $14, rescheduled_date = $15, notes = $16,
                courier = $17, updated_at = NOW()
            WHERE id = $18 RETURNING *`,
            [
                website_id, resolvedProductId, form_id, resolvedProductName, entry_id,
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

app.post('/api/websites', async (req, res) => {
    try {
        const { name, contact_email, contact_phone, website_url } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Website name is required' });
        }

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
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT p.*, COALESCE(i.quantity, 0) as quantity FROM products p LEFT JOIN inventory i ON p.id = i.product_id ORDER BY p.created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

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
        if (error.code === '23505') {
            return res.status(409).json({ error: 'A product with this name or SKU already exists.' });
        }
        res.status(500).json({ error: 'Failed to add product' });
    }
});

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

app.post('/api/stock-purchases', async (req, res) => {
    try {
        const { product_id, sku, product_name, quantity, cost_per_item_kes, supplier_name, purchase_date, notes } = req.body;

        const resolvedProductId = await resolveProductId({ product_id, sku, product_name });

        if (!resolvedProductId) {
            return res.status(400).json({ error: 'SKU/product link is required to record a purchase' });
        }

        if (!quantity || !cost_per_item_kes || !purchase_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const total_cost_kes = parseFloat(cost_per_item_kes) * parseInt(quantity, 10);

        const result = await pool.query(
            `INSERT INTO stock_purchases (product_id, quantity, cost_per_item_kes, total_cost_kes, supplier_name, purchase_date, notes) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [resolvedProductId, quantity, cost_per_item_kes, total_cost_kes, supplier_name, purchase_date, notes]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add stock purchase error:', error);
        res.status(500).json({ error: 'Failed to add stock purchase' });
    }
});

// ==================== EXPENSES API ====================
app.get('/api/expense-categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM expense_categories ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Get expense categories error:', error);
        res.status(500).json({ error: 'Failed to fetch expense categories' });
    }
});

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
