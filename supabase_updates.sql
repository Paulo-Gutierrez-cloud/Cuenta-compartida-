-- =====================================================
-- REST BILL SPLITTER - Database Updates
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add payment_method and tip_amount to order_items
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0;

-- 2. Create table_users for virtual users (manual additions)
CREATE TABLE IF NOT EXISTS table_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_virtual BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active'
);

-- 3. Create cash_closings for register history
CREATE TABLE IF NOT EXISTS cash_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    closing_type TEXT NOT NULL CHECK (closing_type IN ('turno', 'dia')),
    total_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
    cash_amount DECIMAL(10,2) DEFAULT 0,
    card_amount DECIMAL(10,2) DEFAULT 0,
    mercadopago_amount DECIMAL(10,2) DEFAULT 0,
    tips_total DECIMAL(10,2) DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    items_count INTEGER DEFAULT 0,
    notes TEXT,
    closed_by TEXT
);

-- 4. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE table_users;

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_table_users_session ON table_users(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_closings_date ON cash_closings(closed_at);
CREATE INDEX IF NOT EXISTS idx_order_items_payment ON order_items(payment_method);

-- 6. RLS Policies (adjust according to your needs)
ALTER TABLE table_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (you may want to restrict later)
CREATE POLICY "Allow all for table_users" ON table_users FOR ALL USING (true);
CREATE POLICY "Allow all for cash_closings" ON cash_closings FOR ALL USING (true);

-- Verify changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND column_name IN ('payment_method', 'tip_amount');
