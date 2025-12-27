import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const NAIROBI_ORDER_STATUSES = new Set(['unassigned', 'assigned', 'delivered']);
const DEFAULT_RIDERS = (process.env.RIDER_WHATSAPP_NUMBERS || process.env.RIDER_NUMBERS || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

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

const toMinimalNairobiPayload = (row) => ({
    id: row.id,
    customer_first_name: row.customer_first_name,
    address: row.address,
    product: row.product,
    amount_payable: row.amount_payable,
    status: row.status,
    assigned_to: row.assigned_to,
    assigned_at: row.assigned_at,
});

const cleanPhone = (value) => (value || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');

async function getActiveRiderPhones() {
    try {
        const result = await pool.query('SELECT phone FROM riders WHERE is_active = true');
        const phones = result.rows.map((r) => r.phone).filter(Boolean);
        if (phones.length > 0) return phones;
    } catch (error) {
        console.error('Failed to fetch riders:', error.message);
    }
    return DEFAULT_RIDERS;
}

const seedUsers = [
    { email: 'cargojoyful@gmail.com', password: 'T7@wLz#3Qk9', role: 'admin' },
    { email: 'truphenamukiri@gmail.com', password: 'Laare2030', role: 'user' },
];

// Hash once at startup so only bcrypt hashes are stored in memory
const users = seedUsers.map((u) => ({
    ...u,
    password: bcrypt.hashSync(u.password, 10),
}));

const generateToken = (user) =>
    jwt.sign({ email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Authentication required' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || (roles.length > 0 && !roles.includes(req.user.role))) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}

function optionalAuthenticate(req, _res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return next();
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
    } catch (error) {
        // ignore invalid token for optional paths
    }
    next();
}

function authorizeRolesOrPublic(roles = [], allowPublic = false) {
    return (req, res, next) => {
        if (req.user && roles.length > 0 && roles.includes(req.user.role)) {
            return next();
        }
        if (!req.user && allowPublic) {
            return next();
        }
        return res.status(403).json({ error: 'Forbidden' });
    };
}

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

// Ensure Nairobi-specific orders table exists (does not affect core inventory)
async function ensureNairobiOrdersTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS nairobi_orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_first_name VARCHAR(255) NOT NULL,
            customer_full_name VARCHAR(255),
            phone VARCHAR(20),
            alt_phone VARCHAR(20),
            address TEXT NOT NULL,
            product VARCHAR(255) NOT NULL,
            amount_payable NUMERIC(10, 2) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'unassigned',
            assigned_to VARCHAR(255),
            assigned_phone VARCHAR(20),
            assigned_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_nairobi_orders_status ON nairobi_orders(status);
        CREATE INDEX IF NOT EXISTS idx_nairobi_orders_created_at ON nairobi_orders(created_at DESC);
    `);
}

ensureNairobiOrdersTable().catch((err) => {
    console.error('Failed to ensure nairobi_orders table exists:', err);
});

// Ensure riders table exists (drives WhatsApp notifications list)
async function ensureRidersTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS riders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(20) UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_riders_active ON riders(is_active);
    `);
}

ensureRidersTable().catch((err) => {
    console.error('Failed to ensure riders table exists:', err);
});

// ==================== AUTH ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user);
        res.json({ token, email: user.email, role: user.role, expiresIn: JWT_EXPIRES_IN });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
});

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
app.get('/api/orders', authenticateToken, authorizeRoles('admin', 'user'), async (req, res) => {
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
            const statusList = Array.isArray(status)
                ? status
                : String(status)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);

            if (statusList.length > 0) {
                baseQuery += ` AND o.status = ANY($${paramCount})`;
                params.push(statusList);
                paramCount++;
            }
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
            const normalized = `%${search}%`;
            baseQuery += ` AND (
                o.customer_name ILIKE $${paramCount} OR 
                o.phone ILIKE $${paramCount} OR 
                o.product_name ILIKE $${paramCount} OR
                o.county ILIKE $${paramCount} OR
                o.status::text ILIKE $${paramCount}
            )`;
            params.push(normalized);
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
app.post('/api/orders', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
app.get('/api/orders/stats', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
app.get('/api/performance/monthly', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
                    COUNT(*) AS total_orders,
                    COUNT(*) FILTER (WHERE status = 'returned') AS returns
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
                COALESCE(o.total_orders, 0) AS total_orders,
                COALESCE(o.returns, 0) AS returns
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
app.get('/api/orders/rescheduled', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
app.get('/api/orders/:id', authenticateToken, authorizeRoles('admin', 'user'), async (req, res) => {
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
app.patch('/api/orders/:id', authenticateToken, authorizeRoles('admin', 'user'), async (req, res) => {
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
app.put('/api/orders/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

// ==================== NAIROBI SAME-DAY ORDERS ====================
// Minimal list for riders - avoids exposing full customer details
app.get('/api/nairobi-orders', optionalAuthenticate, authorizeRolesOrPublic(['admin', 'rider'], true), async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT id, customer_first_name, address, product, amount_payable, status, assigned_to, assigned_at
            FROM nairobi_orders
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND status = ANY($${paramIndex})`;
            params.push(
                (Array.isArray(status) ? status : String(status).split(','))
                    .map((s) => s.trim())
                    .filter(Boolean)
            );
            paramIndex++;
        }

        query += ' ORDER BY created_at DESC LIMIT 500';
        const result = await pool.query(query, params);
        res.json(result.rows.map(toMinimalNairobiPayload));
    } catch (error) {
        console.error('Get nairobi orders error:', error);
        res.status(500).json({ error: 'Failed to fetch Nairobi orders' });
    }
});

// Create a Nairobi same-day order (does not touch inventory)
app.post('/api/nairobi-orders', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const {
            customer_first_name,
            customer_full_name,
            phone,
            alt_phone,
            address,
            product,
            amount_payable,
        } = req.body;

        if (!customer_first_name || !address || !product || amount_payable === undefined) {
            return res.status(400).json({ error: 'Missing required fields for Nairobi order' });
        }

        const numericAmount = Number(amount_payable);
        if (Number.isNaN(numericAmount) || numericAmount < 0) {
            return res.status(400).json({ error: 'Amount payable must be a positive number' });
        }

        const insert = await pool.query(
            `
            INSERT INTO nairobi_orders (
                customer_first_name, customer_full_name, phone, alt_phone,
                address, product, amount_payable, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'unassigned')
            RETURNING *
        `,
            [
                customer_first_name,
                customer_full_name || customer_first_name,
                phone ? cleanPhone(phone) : null,
                alt_phone ? cleanPhone(alt_phone) : null,
                address,
                product,
                numericAmount,
            ]
        );

        const order = insert.rows[0];

        // Notify riders (minimal info)
        const recipients = await getActiveRiderPhones();
        if (recipients.length > 0) {
            await whatsappQueue.add('broadcast-nairobi-order', {
                order: toMinimalNairobiPayload(order),
                recipients,
                dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000',
            });
        }

        res.status(201).json(toMinimalNairobiPayload(order));
    } catch (error) {
        console.error('Create Nairobi order error:', error);
        res.status(500).json({ error: 'Failed to create Nairobi order' });
    }
});

// Rider acceptance and verification
app.post('/api/nairobi-orders/:id/assign', optionalAuthenticate, authorizeRolesOrPublic(['admin', 'rider'], true), async (req, res) => {
    try {
        const { id } = req.params;
        const { rider_phone, rider_name } = req.body;

        if (!rider_phone) {
            return res.status(400).json({ error: 'Rider phone is required for verification' });
        }

        const sanitizedPhone = cleanPhone(rider_phone);

        const existing = await pool.query('SELECT * FROM nairobi_orders WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Nairobi order not found' });
        }
        const current = existing.rows[0];

        if (current.status !== 'unassigned') {
            return res.status(409).json({ error: 'Order is already assigned or delivered' });
        }

        const updated = await pool.query(
            `UPDATE nairobi_orders
             SET status = 'assigned',
                 assigned_to = COALESCE($1, $2),
                 assigned_phone = $2,
                 assigned_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [rider_name, sanitizedPhone, id]
        );

        const order = updated.rows[0];

        await whatsappQueue.add('send-nairobi-assignment', {
            order,
            recipient: sanitizedPhone,
            rider_name: rider_name || sanitizedPhone,
            dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000',
        });

        res.json(toMinimalNairobiPayload(order));
    } catch (error) {
        console.error('Assign Nairobi order error:', error);
        res.status(500).json({ error: 'Failed to assign Nairobi order' });
    }
});

// Update status (e.g., delivered) without touching inventory
app.patch('/api/nairobi-orders/:id/status', optionalAuthenticate, authorizeRolesOrPublic(['admin', 'rider'], true), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !NAIROBI_ORDER_STATUSES.has(status)) {
            return res.status(400).json({ error: 'Invalid Nairobi status' });
        }

        const existing = await pool.query('SELECT * FROM nairobi_orders WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Nairobi order not found' });
        }

        const updated = await pool.query(
            `UPDATE nairobi_orders
             SET status = $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [status, id]
        );

        res.json(toMinimalNairobiPayload(updated.rows[0]));
    } catch (error) {
        console.error('Update Nairobi order status error:', error);
        res.status(500).json({ error: 'Failed to update Nairobi order status' });
    }
});

// ==================== RIDERS (manage WhatsApp recipients) ====================
app.get('/api/riders', authenticateToken, authorizeRoles('admin'), async (_req, res) => {
    try {
        const result = await pool.query('SELECT * FROM riders ORDER BY created_at DESC LIMIT 500');
        res.json(result.rows);
    } catch (error) {
        console.error('Get riders error:', error);
        res.status(500).json({ error: 'Failed to fetch riders' });
    }
});

app.post('/api/riders', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { name, phone } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ error: 'Name and phone are required' });
        }
        const cleaned = cleanPhone(phone);
        const result = await pool.query(
            'INSERT INTO riders (name, phone, is_active) VALUES ($1, $2, true) RETURNING *',
            [name, cleaned]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add rider error:', error);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'A rider with this phone already exists.' });
        }
        res.status(500).json({ error: 'Failed to add rider' });
    }
});

app.patch('/api/riders/:id/toggle', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE riders SET is_active = NOT is_active WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Rider not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Toggle rider error:', error);
        res.status(500).json({ error: 'Failed to toggle rider' });
    }
});

app.delete('/api/riders/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM riders WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Rider not found' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Delete rider error:', error);
        res.status(500).json({ error: 'Failed to delete rider' });
    }
});

// ==================== WEBSITES API ====================
app.get('/api/websites', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

app.post('/api/websites', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

app.patch('/api/websites/:id/toggle', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
app.get('/api/products', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const result = await pool.query('SELECT p.*, COALESCE(i.quantity, 0) as quantity FROM products p LEFT JOIN inventory i ON p.id = i.product_id ORDER BY p.created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

app.post('/api/products', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

app.put('/api/products/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

app.delete('/api/products/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
app.get('/api/stock-purchases', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

app.post('/api/stock-purchases', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
app.get('/api/expense-categories', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM expense_categories ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Get expense categories error:', error);
        res.status(500).json({ error: 'Failed to fetch expense categories' });
    }
});

app.get('/api/expenses', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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

app.post('/api/expenses', authenticateToken, authorizeRoles('admin'), async (req, res) => {
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
