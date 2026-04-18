-- =====================================================
-- REST BILL SPLITTER - NEW FEATURES v2
-- 1. Profiles & RBAC
-- 2. Menu Items & Inventory
-- 3. Recipes
-- 4. Audit Logs & Triggers
-- =====================================================

-- 1. PROFILES & RBAC
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'camarero');

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'camarero',
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Realtime for profiles
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Admin Update Profiles" ON profiles FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- 2. MENU ITEMS & INVENTORY
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    stock_quantity DECIMAL(12, 3) NOT NULL DEFAULT 0,
    unit TEXT NOT NULL, -- 'kg', 'gr', 'units', 'ml'
    min_stock_alert DECIMAL(12, 3) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    price DECIMAL(12, 2) NOT NULL,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. RECIPES
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required DECIMAL(12, 3) NOT NULL, -- e.g. 0.200 for 200gr
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(menu_item_id, inventory_item_id)
);

-- 4. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL, -- 'DELETE_ITEM', 'APPLY_DISCOUNT', 'LIBERAR_MESA'
    table_number TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. STOCK DEDUCTION TRIGGER
CREATE OR REPLACE FUNCTION deduct_inventory_on_ready()
RETURNS TRIGGER AS $$
DECLARE
    rec_item RECORD;
BEGIN
    -- Only trigger if status changes to 'ready'
    IF (NEW.kitchen_status = 'ready' AND (OLD.kitchen_status IS NULL OR OLD.kitchen_status != 'ready')) THEN
        -- Find the menu item (by name for now, or ID if we refactor later)
        -- Optimization: We search by name in menu_items to get the recipe
        FOR rec_item IN 
            SELECT r.inventory_item_id, r.quantity_required 
            FROM recipes r
            JOIN menu_items mi ON mi.id = r.menu_item_id
            WHERE mi.name = NEW.name
        LOOP
            UPDATE inventory_items
            SET stock_quantity = stock_quantity - (rec_item.quantity_required * NEW.quantity)
            WHERE id = rec_item.inventory_item_id;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_deduct_stock_on_ready
AFTER UPDATE ON order_items
FOR EACH ROW
EXECUTE FUNCTION deduct_inventory_on_ready();

-- 6. AUDIT LOG TRIGGER (Manual Deletes)
CREATE OR REPLACE FUNCTION log_item_deletion()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, table_number, details)
    VALUES (
        auth.uid(),
        'DELETE_ITEM',
        (SELECT table_number FROM sessions WHERE id = OLD.session_id),
        jsonb_build_object('item_name', OLD.name, 'price', OLD.price)
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_log_item_deletion
BEFORE DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION log_item_deletion();

-- 7. REFINED RLS POLICIES FOR STAFF
-- Drop existing wide-open policies if they exist (based on previous schema)
DROP POLICY IF EXISTS "Staff Full Item Control" ON order_items;

CREATE POLICY "Staff Full Item Control" ON order_items 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
);

CREATE POLICY "Waiter Insert Items" ON order_items 
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'camarero'
    )
);

CREATE POLICY "Waiter Select Items" ON order_items 
FOR SELECT USING (true); -- Everyone can see items in their session
