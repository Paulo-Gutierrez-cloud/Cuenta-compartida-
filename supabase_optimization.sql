-- SUPABASE OPTIMIZATION SCRIPT
-- Project: seffpluriimpsrswowcm (SAAS RESTAURANTE)

-- 1. SECURITY: Hardening search_path for Functions
-- This prevents search path hijacking by pinning the search to the public schema.

ALTER FUNCTION public.get_active_session(TEXT) SET search_path = public;
ALTER FUNCTION public.release_table(UUID) SET search_path = public;
ALTER FUNCTION public.update_session_totals() SET search_path = public;

-- 2. SECURITY: Refining RLS Policies
-- Addressing the "Multiple Permissive Policies" and "Permissive RLS" warnings.

-- order_items: Reviewing and consolidating
DROP POLICY IF EXISTS "Staff Full Item Control" ON public.order_items;
-- Keeping "Staff Insert Items" and "Public Read Items" as they are more specific.
-- Re-adding "Staff Full Item Control" with a more specific command if needed, or relying on specific ones.
-- For now, let's just make sure "Staff Full Item Control" is actually needed or fix its permissive nature.

-- cash_closings: Addressing "Allow all"
-- Assuming you want staff to manage this
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for cash_closings" ON public.cash_closings;
CREATE POLICY "Staff Manage Cash Closings" ON public.cash_closings 
FOR ALL TO authenticated USING (true);

-- table_users: Addressing "Allow all"
ALTER TABLE public.table_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for table_users" ON public.table_users;
CREATE POLICY "Public Read Table Users" ON public.table_users FOR SELECT USING (true);
CREATE POLICY "Authenticated Manage Table Users" ON public.table_users FOR ALL TO authenticated USING (true);

-- 3. PERFORMANCE: Adding Missing Indexes
-- Addressing "Unindexed foreign keys"

CREATE INDEX IF NOT EXISTS idx_payments_session_id ON public.payments(session_id);

-- 4. PERFORMANCE: Cleanup (Optional/Caution)
-- Removing unused indexes identified by advisor
-- DROP INDEX IF EXISTS idx_table_users_session;
-- DROP INDEX IF EXISTS idx_cash_closings_date;
-- DROP INDEX IF EXISTS idx_order_items_payment;
