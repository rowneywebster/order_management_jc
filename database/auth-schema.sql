-- ==================== USER AUTHENTICATION ====================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Insert default users
-- Passwords are bcrypt hashed:
-- Admin password: T7@wLz#3Qk9
-- User password: Laare2030

INSERT INTO users (email, password, role) VALUES
('cargojoyful@gmail.com', '$2b$10$YourHashedPassword1Here', 'admin'),
('truphenamukiri@gmail.com', '$2b$10$YourHashedPassword2Here', 'user')
ON CONFLICT (email) DO NOTHING;
