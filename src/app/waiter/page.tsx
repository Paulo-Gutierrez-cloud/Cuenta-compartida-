"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, cn } from "@/lib/utils";
import { Plus, X, List, UtensilsCrossed, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function WaiterPage() {
    const [tables, setTables] = useState<any[]>([]);
    const [activeTable, setActiveTable] = useState<any>(null);
    const [itemName, setItemName] = useState("");
    const [itemPrice, setItemPrice] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchTables = async () => {
        const { data } = await supabase
            .from('sessions')
            .select('*')
            .neq('status', 'closed')
            .order('table_number');
        if (data) setTables(data);
    };

    useEffect(() => {
        fetchTables();
        const sub = supabase.channel('waiter_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, fetchTables).subscribe();
        return () => { supabase.removeChannel(sub); };
    }, []);

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTable || !itemName || !itemPrice) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('order_items').insert({
                session_id: activeTable.id,
                name: itemName,
                price: parseFloat(itemPrice),
                status: 'available',
                kitchen_status: 'pending'
            });
            if (error) throw error;
            setItemName(""); setItemPrice(""); setActiveTable(null);
        } catch (err) { alert("Error al agregar pedido"); }
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20">
            {/* Header Rápido */}
            <header className="bg-white p-4 shadow-sm flex justify-between items-center sticky top-0 z-10 border-b border-slate-100">
                <h1 className="text-xl font-black italic tracking-tighter text-slate-900 flex items-center gap-2">
                    <UtensilsCrossed size={20} className="text-primary" /> CAMAREX
                </h1>
                <Link href="/" className="text-slate-400 p-2"><LogOut size={20} /></Link>
            </header>

            <main className="p-4 grid grid-cols-2 gap-4">
                {tables.map(table => (
                    <button 
                        key={table.id}
                        onClick={() => setActiveTable(table)}
                        className={cn(
                            "aspect-square rounded-[2rem] flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-lg",
                            table.total_amount > 0 ? "bg-white text-slate-900 border-2 border-primary/20" : "bg-slate-200 text-slate-400"
                        )}
                    >
                        <span className="text-[10px] font-bold uppercase opacity-50">Mesa</span>
                        <span className="text-4xl font-black italic">{table.table_number}</span>
                        <span className="text-[10px] font-black">{formatCurrency(table.total_amount || 0)}</span>
                    </button>
                ))}
            </main>

            {/* Modal de Pedido Rápido */}
            <AnimatePresence>
                {activeTable && (
                    <div className="fixed inset-0 z-50 flex items-end">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActiveTable(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="bg-white w-full rounded-t-[3rem] p-8 relative z-10 shadow-2xl border-t border-slate-100">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-black italic tracking-tighter">NUEVO PEDIDO: MESA {activeTable.table_number}</h2>
                                <button onClick={() => setActiveTable(null)} className="p-2 bg-slate-100 rounded-full text-slate-400"><X size={24} /></button>
                            </div>

                            <form onSubmit={handleAddItem} className="space-y-4">
                                <input autoFocus required type="text" placeholder="¿Qué pidió?" value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full bg-slate-50 p-6 rounded-2xl font-bold text-lg outline-none focus:ring-4 ring-primary/10 transition-all border border-transparent focus:border-primary/20" />
                                <div className="flex gap-4">
                                    <input required type="number" placeholder="Precio" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className="flex-1 bg-slate-50 p-6 rounded-2xl font-bold text-lg outline-none" />
                                    <button disabled={isSubmitting} className="flex-[2] bg-primary text-secondary font-black rounded-2xl text-lg uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all">
                                        {isSubmitting ? "GUARDANDO..." : "AGREGAR"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Simple Link shim for code convenience
function Link({ href, children, className }: any) {
    return <a href={href} className={className}>{children}</a>;
}
