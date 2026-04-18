-- COPIA Y PEGA ESTO EN EL SQL EDITOR DE SUPABASE (https://supabase.com/dashboard/project/seffpluriimpsrswowcm/sql/new)

-- 1. Funcin para loggear eliminaciones
CREATE OR REPLACE FUNCTION log_item_deletion()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (action, table_name, record_id, old_data, performed_by)
    VALUES (
        'DELETE_ORDER_ITEM',
        'order_items',
        OLD.id,
        row_to_json(OLD)::jsonb,
        auth.uid()
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger para la tabla order_items
DROP TRIGGER IF EXISTS tr_log_item_deletion ON order_items;
CREATE TRIGGER tr_log_item_deletion
BEFORE DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION log_item_deletion();

-- 3. Funcin para loggear liberacin de mesa (update de session a closed)
CREATE OR REPLACE FUNCTION log_session_closure()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status != 'closed' AND NEW.status = 'closed') THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data, performed_by)
        VALUES (
            'CLOSE_SESSION',
            'sessions',
            OLD.id,
            jsonb_build_object('table_number', OLD.table_number, 'total_amount', OLD.total_amount),
            jsonb_build_object('status', 'closed'),
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger para la tabla sessions
DROP TRIGGER IF EXISTS tr_log_session_closure ON sessions;
CREATE TRIGGER tr_log_session_closure
AFTER UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION log_session_closure();
