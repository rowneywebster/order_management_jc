-- Order Manager Database Schema

-- Websites/Clients Table
CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    webhook_key VARCHAR(64) UNIQUE NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    website_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    sku VARCHAR(100) UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Orders Table
CREATE TYPE order_status AS ENUM ('pending', 'approved', 'cancelled', 'rescheduled', 'completed', 'returned');

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID REFERENCES websites(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    form_id VARCHAR(50),
    product_name VARCHAR(255),
    entry_id VARCHAR(50),
    customer_name VARCHAR(255),
    phone VARCHAR(20),
    alt_phone VARCHAR(20),
    email VARCHAR(255),
    county VARCHAR(100),
    location TEXT,
    pieces INTEGER DEFAULT 1,
    amount_kes NUMERIC(10, 2) DEFAULT 0,
    status order_status DEFAULT 'pending',
    rescheduled_date DATE,
    notes TEXT,
    courier VARCHAR(100), -- New courier field
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_website_id ON orders(website_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rescheduled_date ON orders(rescheduled_date) WHERE rescheduled_date IS NOT NULL;

-- Nairobi same-day delivery orders (kept separate to avoid touching inventory)
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

-- Riders (manage who receives Nairobi notifications)
CREATE TABLE IF NOT EXISTS riders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_riders_active ON riders(is_active);

-- Insert your first website
INSERT INTO websites (name, webhook_key, contact_email, website_url) 
VALUES (
    'BestCart Kenya',
    'bestcart_secure_key_2024',
    'admin@bestcart.co.ke',
    'https://bestcart.co.ke'
) ON CONFLICT DO NOTHING;

-- ==================== STOCK MANAGEMENT ====================

-- Inventory Table (to track stock levels)
CREATE TABLE IF NOT EXISTS inventory (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Stock Purchases Table
CREATE TABLE IF NOT EXISTS stock_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    cost_per_item_kes NUMERIC(10, 2) NOT NULL,
    total_cost_kes NUMERIC(10, 2) NOT NULL,
    supplier_name VARCHAR(255),
    purchase_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ==================== EXPENSE MANAGEMENT ====================

-- Expense Categories Table
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount_kes NUMERIC(10, 2) NOT NULL,
    expense_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ==================== MODIFICATIONS & TRIGGERS ====================

CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);

-- Trigger to update inventory quantity on new purchase
CREATE OR REPLACE FUNCTION update_inventory_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO inventory (product_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.quantity, NOW())
    ON CONFLICT (product_id) DO UPDATE
    SET quantity = inventory.quantity + NEW.quantity,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_stock_purchase ON stock_purchases;
CREATE TRIGGER after_stock_purchase
AFTER INSERT ON stock_purchases
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_purchase();

-- Trigger to update inventory on order completion/cancellation
CREATE OR REPLACE FUNCTION update_inventory_on_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    old_effect INTEGER := 0;
    new_effect INTEGER := 0;
BEGIN
    IF NEW.product_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- completed => subtract pieces, returned => add pieces, others => no change.
    IF TG_OP = 'UPDATE' THEN
        old_effect := CASE OLD.status
            WHEN 'completed' THEN -COALESCE(OLD.pieces, 1)
            WHEN 'returned' THEN COALESCE(OLD.pieces, 1)
            ELSE 0
        END;

        -- If product link changed, reverse the old effect on the previous product before proceeding.
        IF NEW.product_id <> OLD.product_id AND old_effect <> 0 THEN
            INSERT INTO inventory (product_id, quantity, updated_at)
            VALUES (OLD.product_id, -old_effect, NOW())
            ON CONFLICT (product_id) DO UPDATE
            SET quantity = inventory.quantity - old_effect,
                updated_at = NOW();
            old_effect := 0; -- reset so the new product only sees the new_effect delta
        END IF;
    END IF;

    new_effect := CASE NEW.status
        WHEN 'completed' THEN -COALESCE(NEW.pieces, 1)
        WHEN 'returned' THEN COALESCE(NEW.pieces, 1)
        ELSE 0
    END;

    IF new_effect = old_effect THEN
        RETURN NEW;
    END IF;

    INSERT INTO inventory (product_id, quantity, updated_at)
    VALUES (NEW.product_id, new_effect, NOW())
    ON CONFLICT (product_id) DO UPDATE
    SET quantity = inventory.quantity + (new_effect - old_effect),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_order_update ON orders;
CREATE TRIGGER after_order_update
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_order_status_change();
DROP TRIGGER IF EXISTS after_order_insert ON orders;
CREATE TRIGGER after_order_insert
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_order_status_change();


-- ==================== SEED DATA ====================

-- Pre-populate some expense categories
INSERT INTO expense_categories (name, description) VALUES
('Advertising', 'Marketing and promotion costs'),
('Stock Purchase', 'Cost of goods acquired for sale'),
('Shipping', 'Costs related to shipping orders to customers'),
('Rent', 'Office or warehouse rent'),
('Packaging', 'Costs for boxes, labels, tape, etc.'),
('Utilities', 'Electricity, water, internet, etc.'),
('Salaries', 'Employee salaries and wages'),
('Other', 'Miscellaneous expenses')
ON CONFLICT (name) DO NOTHING;
