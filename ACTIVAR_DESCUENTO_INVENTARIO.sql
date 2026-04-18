-- COPIA Y PEGA ESTO EN EL SQL EDITOR DE SUPABASE (https://supabase.com/dashboard/project/seffpluriimpsrswowcm/sql/new)

-- 1. Funcin para descontar inventario segn la receta
CREATE OR REPLACE FUNCTION deduct_inventory_on_ready()
RETURNS TRIGGER AS $$
DECLARE
    recipe_row RECORD;
BEGIN
    -- Solo descontamos si el estado pasa a 'ready' (Listo)
    IF (OLD.kitchen_status != 'ready' AND NEW.kitchen_status = 'ready') THEN
        -- Buscamos la receta para este platillo (buscando por nombre de menu_items)
        -- Nota: Esto asume que el nombre en order_items coincide con el de menu_items
        FOR recipe_row IN 
            SELECT r.inventory_item_id, r.quantity_required 
            FROM recipes r
            JOIN menu_items m ON r.menu_item_id = m.id
            WHERE m.name = NEW.name
        LOOP
            -- Actualizamos el stock
            UPDATE inventory_items 
            SET stock_quantity = stock_quantity - recipe_row.quantity_required
            WHERE id = recipe_row.inventory_item_id;
            
            -- Opcional: Loggear el descuento
            INSERT INTO audit_logs (action, table_name, record_id, new_data)
            VALUES (
                'INVENTORY_DEDUCTION',
                'inventory_items',
                recipe_row.inventory_item_id,
                jsonb_build_object('item', NEW.name, 'quantity_deducted', recipe_row.quantity_required)
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger para la tabla order_items cuando cambia el estado de cocina
DROP TRIGGER IF EXISTS tr_deduct_inventory ON order_items;
CREATE TRIGGER tr_deduct_inventory
AFTER UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION deduct_inventory_on_ready();
