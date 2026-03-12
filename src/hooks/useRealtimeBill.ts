import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@/components/ui/user-avatars";

export type Item = {
    id: string;
    name: string;
    price: number;
    status: "available" | "locked" | "paid";
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'delivered';
    paid_by?: string;
    split_type?: 'full' | 'shared';
    payment_method?: 'efectivo' | 'tarjeta' | 'mercadopago';
    tip_amount?: number;
};

const DEMO_TABLE_ID = '55555555-5555-5555-5555-555555555555';

export function useRealtimeBill(tableId: string = DEMO_TABLE_ID, initialItems?: Item[]) {
    const [items, setItems] = useState<Item[]>(initialItems || []);
    const [tableUsers, setTableUsers] = useState<User[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchItems = async () => {
            try {
                const [itemsResult, usersResult] = await Promise.all([
                    supabase
                        .from('order_items')
                        .select('id, name, price, status, kitchen_status, paid_by, split_type, payment_method, tip_amount')
                        .eq('session_id', tableId)
                        .order('name'),
                    supabase
                        .from('table_users')
                        .select('id, name, status, is_virtual')
                        .eq('session_id', tableId)
                ]);

                if (itemsResult.error) throw itemsResult.error;
                if (usersResult.error) throw usersResult.error;

                if (itemsResult.data) {
                    setItems(itemsResult.data as Item[]);
                }
                if (usersResult.data) {
                    setTableUsers(usersResult.data.map(u => ({
                        id: u.id,
                        name: u.name,
                        status: u.status as User['status'],
                        is_virtual: u.is_virtual
                    })));
                }
                setIsConnected(true);
                setError(null);
            } catch (err) {
                console.error("Error fetching bill data:", err);
                setError("Error al cargar la cuenta. Verifica tu conexión.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();

        const channel = supabase
            .channel(`public:bill:${tableId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'order_items', filter: `session_id=eq.${tableId}` },
                () => fetchItems() // Reload all on changes for simplicity and consistency with virtual users
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'table_users', filter: `session_id=eq.${tableId}` },
                () => fetchItems()
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setIsConnected(true);
                if (status === 'CHANNEL_ERROR') {
                    setIsConnected(false);
                    setError("Desconectado del servidor.");
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tableId]);

    const payItems = async (itemIds: string[], userName: string, paymentMethod: string = 'efectivo', tipAmount: number = 0) => {
        const previousItems = [...items];
        setItems(prev => prev.map(i => itemIds.includes(i.id) ? { ...i, status: 'paid', paid_by: userName, payment_method: paymentMethod as Item['payment_method'], tip_amount: tipAmount / itemIds.length } : i));

        try {
            const { error } = await supabase
                .from('order_items')
                .update({ 
                    status: 'paid', 
                    paid_by: userName,
                    payment_method: paymentMethod,
                    tip_amount: tipAmount / itemIds.length // Divide tip evenly among items
                })
                .in('id', itemIds);

            if (error) throw error;
        } catch (error) {
            console.error("Pago fallido:", error);
            setError("Pago fallido. Revirtiendo selección.");
            setItems(previousItems);
        }
    };

    return { items, tableUsers, isConnected, isLoading, error, payItems };
}
