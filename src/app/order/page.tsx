import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import OrderClient from "./OrderClient";

/**
 * OPTIMIZATION: Next.js 16 Cache Component
 * We use 'use cache' to fetch initial bill items on the server.
 * This makes the first paint feel instant.
 */
async function getInitialItems(tableId: string) {
    "use cache";
    const { data } = await supabase
        .from('order_items')
        .select('*')
        .eq('session_id', tableId)
        .order('name');
    return data || [];
}

export const unstable_prefetch = {
    mode: 'runtime',
    samples: [
        { searchParams: { table_id: '00000000-0000-0000-0000-000000000000' } }
    ]
};

type Params = Promise<{ [key: string]: string | string[] | undefined }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function OrderPage(props: {
    params: Params;
    searchParams: SearchParams;
}) {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background text-foreground font-black uppercase tracking-widest">Sincronizando...</div>}>
            <OrderPageContent searchParams={props.searchParams} />
        </Suspense>
    );
}

async function OrderPageContent({ searchParams }: { searchParams: SearchParams }) {
    const sp = await searchParams;
    const tableId = (sp.table_id as string) || "";

    // Fetch initial data on the server with 'use cache'
    const initialItems = tableId ? await getInitialItems(tableId) : [];

    return <OrderClient tableId={tableId} initialItems={initialItems} />;
}
