-- COPIA Y PEGA ESTO EN EL SQL EDITOR DE SUPABASE (https://supabase.com/dashboard/project/seffpluriimpsrswowcm/sql/new)

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    stock_quantity DECIMAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL,
    min_stock_alert DECIMAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL NOT NULL,
    category TEXT,
    imagen_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required DECIMAL NOT NULL,
    UNIQUE(menu_item_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    old_data JSONB,
    new_data JSONB,
    performed_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Políticas de Seguridad (RLS)
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Access" ON inventory_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON menu_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
