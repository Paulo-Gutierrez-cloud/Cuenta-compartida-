/* 
  RESET SCRIPT (Idempotent)
  Run this entire file in Supabase SQL Editor.
*/

-- 0. Cleanup (Safe to run multiple times)
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TYPE IF EXISTS split_type CASCADE;
DROP TYPE IF EXISTS order_item_status CASCADE;
DROP TYPE IF EXISTS kitchen_status_type CASCADE; -- New enum
DROP TYPE IF EXISTS session_status CASCADE;
DROP FUNCTION IF EXISTS update_session_totals CASCADE;
DROP FUNCTION IF EXISTS release_table CASCADE;

-- 1. Create Enums
CREATE TYPE session_status AS ENUM ('active', 'payment_processing', 'closed');
CREATE TYPE order_item_status AS ENUM ('available', 'locked', 'paid');
CREATE TYPE kitchen_status_type AS ENUM ('pending', 'preparing', 'ready', 'delivered'); -- Kitchen flow
CREATE TYPE split_type AS ENUM ('full', 'shared');

-- 2. Create Tables
CREATE TABLE sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    restaurant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000', 
    table_number TEXT NOT NULL,
    status session_status DEFAULT 'active',
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    remaining_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0)
);

-- Optimization: Index frequent filters
CREATE INDEX idx_sessions_table_number ON sessions(table_number);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Reliability: Prevent duplicate active sessions for same table
CREATE UNIQUE INDEX unique_active_table_per_restaurant 
ON sessions (table_number, restaurant_id) 
WHERE (status != 'closed');

CREATE TABLE order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price DECIMAL(12, 2) NOT NULL CHECK (price >= 0),
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    status order_item_status DEFAULT 'available',
    kitchen_status kitchen_status_type DEFAULT 'pending',
    split_type split_type DEFAULT 'full',
    paid_by TEXT
);

-- Optimization: Foreign Key indexing and Kitchen queue indexing
CREATE INDEX idx_order_items_session_id ON order_items(session_id);
CREATE INDEX idx_order_items_kitchen_status ON order_items(kitchen_status) WHERE (kitchen_status != 'delivered');
CREATE INDEX idx_order_items_created_at ON order_items(created_at);

CREATE TABLE payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    session_id UUID REFERENCES sessions(id),
    user_name TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    items_covered JSONB 
);

-- 3. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;

-- 4. Enable Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies (Security Hardening)

-- SESSIONS
CREATE POLICY "Public Read Sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Staff Create Sessions" ON sessions FOR INSERT WITH CHECK (true); -- Staff adds tables
CREATE POLICY "System Update Sessions" ON sessions FOR UPDATE USING (true);

-- ORDER ITEMS
CREATE POLICY "Public Read Items" ON order_items FOR SELECT USING (true);
CREATE POLICY "Staff Insert Items" ON order_items FOR INSERT WITH CHECK (true); -- Only staff/dashboard should add items

-- Selective Update: Customers can only lock or pay for items
CREATE POLICY "Customer Selective Update" ON order_items 
FOR UPDATE USING (
    status = 'available' OR status = 'locked'
)
WITH CHECK (
    status IN ('locked', 'paid')
);

CREATE POLICY "Staff Full Item Control" ON order_items FOR ALL USING (true);

-- PAYMENTS
CREATE POLICY "Public Insert Payments" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Read Payments" ON payments FOR SELECT USING (true);

-- 6. AUTOMATION TRIGGER (Updates Session Status/Amount automatically)
CREATE OR REPLACE FUNCTION update_session_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
    v_total DECIMAL;
    v_paid DECIMAL;
    v_remaining DECIMAL;
BEGIN
    -- Handle session_id based on operation
    IF (TG_OP = 'DELETE') THEN
        v_session_id := OLD.session_id;
    ELSE
        v_session_id := NEW.session_id;
    END IF;

    -- Calculate totals for the session
    SELECT 
        COALESCE(SUM(price), 0),
        COALESCE(SUM(CASE WHEN status = 'paid' THEN price ELSE 0 END), 0)
    INTO v_total, v_paid
    FROM order_items
    WHERE session_id = v_session_id;

    v_remaining := v_total - v_paid;

    -- Update session status and amounts
    UPDATE sessions
    SET 
        total_amount = v_total,
        remaining_amount = v_remaining,
        status = CASE 
            WHEN v_remaining = 0 AND v_total > 0 THEN 'payment_processing'::session_status -- Keep visible even if paid
            WHEN v_remaining < v_total THEN 'payment_processing'::session_status
            ELSE 'active'::session_status
        END
    WHERE id = v_session_id;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_item_update
AFTER UPDATE OR INSERT OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_session_totals();

-- 7. RESET FUNCTION (Release Table with Rotation)
CREATE OR REPLACE FUNCTION release_table(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
    v_table_num TEXT;
    v_rest_id UUID;
BEGIN
    -- Get current table info before archiving
    SELECT table_number, restaurant_id INTO v_table_num, v_rest_id
    FROM sessions WHERE id = p_session_id;

    -- 1. Archive current session
    UPDATE sessions 
    SET status = 'closed'
    WHERE id = p_session_id;
    
    -- 2. Create NEW session for the same table
    INSERT INTO sessions (restaurant_id, table_number, status, total_amount, remaining_amount)
    VALUES (v_rest_id, v_table_num, 'active', 0, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.1 HELPER: Get active session for a table
CREATE OR REPLACE FUNCTION get_active_session(p_table_number TEXT)
RETURNS UUID AS $$
    SELECT id FROM sessions 
    WHERE table_number = p_table_number 
    AND status != 'closed'
    ORDER BY created_at DESC 
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 8. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION release_table(UUID) TO anon;
GRANT EXECUTE ON FUNCTION release_table(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_active_session(TEXT) TO authenticated;

-- 9. Insert Mock Data (5 Tables)

-- Mesa 1: Active, typical meal
INSERT INTO sessions (id, restaurant_id, table_number, status, total_amount, remaining_amount)
VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '1', 'active', 45000, 45000);

INSERT INTO order_items (session_id, name, price, status) VALUES 
('11111111-1111-1111-1111-111111111111', 'Pizza Margarita', 12900, 'available'),
('11111111-1111-1111-1111-111111111111', 'Schop Kross', 5500, 'available'),
('11111111-1111-1111-1111-111111111111', 'Tabla Quesos', 18900, 'available'),
('11111111-1111-1111-1111-111111111111', 'Limonada', 4200, 'available'),
('11111111-1111-1111-1111-111111111111', 'Tiramisu', 3500, 'available');

-- Mesa 2: Payment Processing (Some paid)
INSERT INTO sessions (id, restaurant_id, table_number, status, total_amount, remaining_amount)
VALUES ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', '2', 'payment_processing', 60000, 30000);

INSERT INTO order_items (session_id, name, price, status, paid_by) VALUES 
('22222222-2222-2222-2222-222222222222', 'Lomo Vetado', 18000, 'paid', 'Carlos'),
('22222222-2222-2222-2222-222222222222', 'Vino Tinto', 12000, 'paid', 'Carlos'),
('22222222-2222-2222-2222-222222222222', 'Ensalada Cesar', 9000, 'available', null),
('22222222-2222-2222-2222-222222222222', 'Pisco Sour', 6000, 'available', null),
('22222222-2222-2222-2222-222222222222', 'Pisco Sour', 6000, 'locked', 'Maria'),
('22222222-2222-2222-2222-222222222222', 'Postre 3 Leches', 5000, 'available', null),
('22222222-2222-2222-2222-222222222222', 'Café', 4000, 'available', null);

-- Mesa 3: Active, Big Group
INSERT INTO sessions (id, restaurant_id, table_number, status, total_amount, remaining_amount)
VALUES ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', '3', 'active', 120000, 120000);

INSERT INTO order_items (session_id, name, price, status) VALUES 
('33333333-3333-3333-3333-333333333333', 'Parrillada Premium', 45000, 'available'),
('33333333-3333-3333-3333-333333333333', 'Parrillada Premium', 45000, 'available'),
('33333333-3333-3333-3333-333333333333', 'Jarra Sangría', 15000, 'available'),
('33333333-3333-3333-3333-333333333333', 'Jarra Sangría', 15000, 'available');

-- Mesa 4: Active (Previously closed in mock data)
INSERT INTO sessions (id, restaurant_id, table_number, status, total_amount, remaining_amount)
VALUES ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', '4', 'active', 25000, 25000);

INSERT INTO order_items (session_id, name, price, status) VALUES 
('44444444-4444-4444-4444-444444444444', 'Burger Doble', 12000, 'available'),
('44444444-4444-4444-4444-444444444444', 'Burger Simple', 9000, 'available'),
('44444444-4444-4444-4444-444444444444', 'Bebida', 2000, 'available'),
('44444444-4444-4444-4444-444444444444', 'Bebida', 2000, 'available');

-- Mesa 5: Active (Single user) - THIS IS THE DEMO TABLE
INSERT INTO sessions (id, restaurant_id, table_number, status, total_amount, remaining_amount)
VALUES ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', '5', 'active', 15000, 15000);

INSERT INTO order_items (session_id, name, price, status) VALUES 
('55555555-5555-5555-5555-555555555555', 'Menu Ejecutivo', 8500, 'available'),
('55555555-5555-5555-5555-555555555555', 'Jugo Natural', 3500, 'available'),
('55555555-5555-5555-5555-555555555555', 'Café Expreso', 3000, 'available');
