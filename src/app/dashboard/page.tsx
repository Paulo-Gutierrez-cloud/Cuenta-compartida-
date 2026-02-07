"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, cn } from "@/lib/utils";
import { LayoutDashboard, QrCode, RefreshCw, Plus, X, ChefHat, Bell, Flame, Check, UserPlus, Receipt } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { UserAvatars, User } from "@/components/ui/user-avatars";

type Session = {
    id: string;
    table_number: string;
    status: 'active' | 'payment_processing' | 'closed';
    total_amount: number;
    remaining_amount: number;
    // Computed fields
    preparing_count?: number;
    ready_count?: number;
    active_users?: User[];
};

export default function DashboardPage() {
    const [tables, setTables] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Add Item Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeTable, setActiveTable] = useState<Session | null>(null);
    const [itemName, setItemName] = useState("");
    const [itemPrice, setItemPrice] = useState("");
    const [splitParts, setSplitParts] = useState("1");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Add User Modal State
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [newUserName, setNewUserName] = useState("");

    const fetchTables = async () => {
        // 1. Get Sessions
        const { data: sessionData } = await supabase
            .from('sessions')
            .select('*')
            .neq('status', 'closed')
            .order('table_number');

        if (!sessionData) return;

        // 2. Get Kitchen Statuses and paid_by info for these sessions
        // 2. Get active items and virtual users
        const sessionIds = sessionData.map(s => s.id);
        
        const [itemsResult, virtualUsersResult] = await Promise.all([
            supabase
                .from('order_items')
                .select('session_id, kitchen_status, status, paid_by')
                .in('session_id', sessionIds),
            supabase
                .from('table_users')
                .select('*')
                .in('session_id', sessionIds)
        ]);

        const itemData = itemsResult.data;
        const virtualUsersData = virtualUsersResult.data;

        // 3. Map counts and active users to sessions
        const tablesWithCounts = sessionData.map(s => {
            const sessionsItems = itemData?.filter(i => i.session_id === s.id) || [];
            const sessionVirtualUsers = virtualUsersData?.filter(v => v.session_id === s.id) || [];
            
            // Extract unique users who paid or are selecting items
            const usersMap = new Map<string, User>();
            
            // Add virtual users first
            sessionVirtualUsers.forEach(v => {
                usersMap.set(v.id, { 
                    id: v.id, 
                    name: v.name, 
                    status: v.status as "active" | "selecting" | "paid",
                    is_virtual: true 
                });
            });

            // Add real users from items
            sessionsItems.filter(i => i.paid_by && i.status === 'paid').forEach(item => {
                if (item.paid_by && !usersMap.has(item.paid_by)) {
                    usersMap.set(item.paid_by, { id: item.paid_by, name: item.paid_by, status: 'paid' });
                }
            });
            sessionsItems.filter(i => i.paid_by && i.status === 'locked').forEach(item => {
                if (item.paid_by && !usersMap.has(item.paid_by)) {
                    usersMap.set(item.paid_by, { id: item.paid_by, name: item.paid_by, status: 'selecting' });
                }
            });
            
            return {
                ...s,
                preparing_count: sessionsItems.filter(i => i.kitchen_status === 'preparing').length,
                ready_count: sessionsItems.filter(i => i.kitchen_status === 'ready').length,
                active_users: Array.from(usersMap.values())
            };
        });

        setTables(tablesWithCounts as Session[]);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchTables();

        // Subscribe to sessions AND order_items for realtime dashboard
        const sessionChannel = supabase
            .channel('dashboard_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => fetchTables())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchTables())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_users' }, () => fetchTables())
            .subscribe();

        return () => {
            supabase.removeChannel(sessionChannel);
        };
    }, []);

    const handleReleaseTable = async (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm("¿Cerrar esta sesión y preparar la mesa para nuevos clientes?")) return;

        try {
            const { error } = await supabase.rpc('release_table', { p_session_id: sessionId });
            if (error) alert("Error: " + error.message);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTable || !itemName || itemPrice === "") return;

        setIsSubmitting(true);
        const partsCount = parseInt(splitParts) || 1;
        const basePrice = parseFloat(itemPrice) || 0;
        const pricePerPart = basePrice / partsCount;

        try {
            const inserts = [];
            for (let i = 0; i < partsCount; i++) {
                inserts.push({
                    session_id: activeTable.id,
                    name: partsCount > 1 ? `${itemName} (${i + 1}/${partsCount})` : itemName,
                    price: pricePerPart,
                    status: 'available',
                    kitchen_status: 'pending',
                    split_type: partsCount > 1 ? 'shared' : 'full'
                });
            }

            const { error } = await supabase
                .from('order_items')
                .insert(inserts);

            if (error) throw error;
            setItemName(""); setItemPrice(""); setSplitParts("1"); setIsAddModalOpen(false);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            alert("Error: " + errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTable || !newUserName.trim()) return;

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('table_users')
                .insert({
                    session_id: activeTable.id,
                    name: newUserName.trim(),
                    status: 'active',
                    is_virtual: true
                });

            if (error) throw error;
            
            setNewUserName("");
            setIsUserModalOpen(false);
            fetchTables();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
            alert("Error al agregar cliente: " + errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusColor = (status: string, remaining: number) => {
        if (remaining === 0 && status !== 'active') return 'bg-emerald-500 text-white';
        switch (status) {
            case 'active': return 'bg-blue-500 text-white';
            case 'payment_processing': return 'bg-amber-500 text-white animate-pulse';
            case 'closed': return 'bg-gray-100/50 text-gray-500 border-gray-200';
            default: return 'bg-gray-200';
        }
    };

    return (
        <div className="min-h-screen bg-[#f8f9fa] p-6 font-sans text-[#1a1a1a]">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-4xl font-black flex items-center gap-3 tracking-tighter">
                        <LayoutDashboard className="text-primary w-10 h-10" /> PC CENTRAL
                    </h1>
                    <p className="text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em] ml-1">Monitoreo de Operaciones</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <Link href="/kitchen" className="flex-1 md:flex-none bg-orange-500 text-white px-6 py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20">
                        <ChefHat size={18} /> VISTA COCINA
                    </Link>
                    <Link href="/cashier" className="flex-1 md:flex-none bg-emerald-500 text-white px-6 py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                        <Receipt size={18} /> CAJA
                    </Link>
                    <Link href="/qr" className="flex-1 md:flex-none bg-black text-white px-6 py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:bg-black/80 transition-all shadow-lg shadow-black/10">
                        <QrCode size={18} /> MESA QRS
                    </Link>
                </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {isLoading ? (
                    [1, 2, 3, 4, 5].map(i => <div key={i} className="h-64 bg-white rounded-[2.5rem] animate-pulse shadow-sm" />)
                ) : (
                    tables.map((table) => (
                        <div key={table.id} className="relative group flex flex-col h-full">
                            <motion.div
                                layout
                                className={cn(
                                    "bg-white rounded-[2.5rem] p-8 shadow-xl border-2 transition-all h-full flex flex-col relative overflow-hidden",
                                    table.ready_count && table.ready_count > 0 ? "border-emerald-500 ring-4 ring-emerald-500/5" : "border-transparent"
                                )}
                            >
                                {/* Header: Mesa + Status */}
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Identificador</p>
                                        <h2 className="text-4xl font-black tracking-tighter italic">Mesa {table.table_number}</h2>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={cn("px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm inline-block", getStatusColor(table.status, table.remaining_amount))}>
                                            {table.remaining_amount === 0 && table.status !== 'active' ? 'PAGO COMPLETO' : table.status.replace('_', ' ')}
                                        </span>
                                        {/* Notifications Inline */}
                                        <AnimatePresence>
                                            {table.ready_count && table.ready_count > 0 && (
                                                <motion.div
                                                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                                                    className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                                                >
                                                    <Bell size={12} fill="currentColor" className="animate-bounce" />
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Listo</span>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Content: Kitchen Status + Accounting */}
                                <div className="space-y-6 flex-1">
                                    <div className="flex flex-wrap gap-2">
                                        {table.preparing_count ? (
                                            <div className="flex items-center gap-1.5 text-orange-500 font-bold text-[10px] bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
                                                <Flame size={10} /> {table.preparing_count} Cocina
                                            </div>
                                        ) : null}
                                        {table.ready_count ? (
                                            <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                                                <Check size={10} /> {table.ready_count} Listos
                                            </div>
                                        ) : null}
                                    </div>

                                    {/* Active Users in this table */}
                                    {table.active_users && table.active_users.length > 0 && (
                                        <div className="mt-2">
                                            <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-2">Clientes</p>
                                            <UserAvatars users={table.active_users} maxVisible={4} />
                                        </div>
                                    )}

                                    <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100/50">
                                        <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-1">Cuenta Total</p>
                                        <p className="text-3xl font-black tracking-tighter">{formatCurrency(table.total_amount)}</p>

                                        <div className="mt-4 space-y-2">
                                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: table.total_amount > 0 ? `${((table.total_amount - table.remaining_amount) / table.total_amount) * 100}%` : "0%" }}
                                                    className="h-full bg-primary"
                                                />
                                            </div>
                                            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                                <span>Progreso</span>
                                                <span>{table.total_amount > 0 ? Math.round(((table.total_amount - table.remaining_amount) / table.total_amount) * 100) : 0}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Footer */}
                                <div className="mt-6 pt-6 border-t border-gray-100 flex gap-2">
                                    <button
                                        onClick={() => { setActiveTable(table); setIsAddModalOpen(true); }}
                                        className="flex-1 bg-black text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary transition-all shadow-lg shadow-black/10"
                                    >
                                        <Plus size={14} strokeWidth={3} /> Nueva Orden
                                    </button>
                                    <button
                                        onClick={() => { setActiveTable(table); setIsUserModalOpen(true); }}
                                        className="aspect-square font-black p-4 rounded-2xl flex items-center justify-center transition-all shadow-inner border bg-blue-50 text-blue-500 border-blue-100 hover:bg-blue-500 hover:text-white"
                                        title="Agregar Cliente Manual"
                                    >
                                        <UserPlus size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => handleReleaseTable(e, table.id)}
                                        className={cn(
                                            "aspect-square font-black p-4 rounded-2xl flex items-center justify-center transition-all shadow-inner border",
                                            table.remaining_amount === 0 && table.status !== 'active'
                                                ? "bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 scale-105"
                                                : "bg-gray-50 text-gray-400 border-gray-100 hover:bg-emerald-500 hover:text-white"
                                        )}
                                        title="Rotar Mesa"
                                    >
                                        <RefreshCw size={14} className={cn(table.remaining_amount === 0 && "animate-spin-slow")} />
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal remains largely same but updated with kitchen status init */}
            <AnimatePresence>
                {isAddModalOpen && activeTable && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl p-10 relative overflow-hidden text-black font-sans">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h2 className="text-3xl font-black tracking-tighter italic">NUEVA ORDEN</h2>
                                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">Mesa {activeTable.table_number}</p>
                                </div>
                                <button onClick={() => setIsAddModalOpen(false)} className="bg-gray-100 p-2 rounded-xl text-gray-400 hover:text-black transition-colors"><X size={24} /></button>
                            </div>

                            <form onSubmit={handleAddItem} className="space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">PLATILLO / BEBIDA</label>
                                        <input autoFocus required type="text" placeholder="Ej. Lomo Salteado" value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full bg-gray-50 border-2 border-transparent focus:border-primary/20 focus:bg-white px-5 py-4 rounded-2xl font-black transition-all outline-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">VALOR TOTAL</label>
                                            <input type="number" placeholder="0 (Cortesía)" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className="w-full bg-gray-50 border-2 border-transparent focus:border-primary/20 focus:bg-white px-5 py-4 rounded-2xl font-black transition-all outline-none" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">DIVIDIR EN</label>
                                            <select value={splitParts} onChange={(e) => setSplitParts(e.target.value)} className="w-full bg-gray-50 border-2 border-transparent focus:border-primary/20 focus:bg-white px-5 py-4 rounded-2xl font-black transition-all outline-none appearance-none">
                                                <option value="1">1 Parte (Solo)</option>
                                                <option value="2">2 Partes</option>
                                                <option value="3">3 Partes</option>
                                                <option value="4">4 Partes</option>
                                                <option value="6">6 Partes</option>
                                                <option value="8">8 Partes</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <button disabled={isSubmitting} className="w-full bg-black text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 shadow-2xl shadow-black/20 hover:scale-[0.98] transition-all disabled:opacity-50 text-lg uppercase tracking-widest italic overflow-hidden group relative">
                                    <div className="absolute inset-0 bg-primary/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                                    <span className="relative z-10">{isSubmitting ? "ENVIANDO..." : "ENVIAR A COCINA"}</span>
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add User Modal */}
            <AnimatePresence>
                {isUserModalOpen && activeTable && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsUserModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl p-10 relative overflow-hidden text-black font-sans">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h2 className="text-3xl font-black tracking-tighter italic">AGREGAR CLIENTE</h2>
                                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">Mesa {activeTable.table_number}</p>
                                </div>
                                <button onClick={() => setIsUserModalOpen(false)} className="bg-gray-100 p-2 rounded-xl text-gray-400 hover:text-black transition-colors"><X size={24} /></button>
                            </div>

                            <div className="bg-blue-50 rounded-2xl p-4 mb-6 border border-blue-100">
                                <p className="text-blue-700 text-xs font-medium">
                                    <strong>Para clientes sin celular:</strong> Ingrese el nombre del cliente para que el personal pueda registrar sus consumos manualmente.
                                </p>
                            </div>

                            <form onSubmit={handleAddUser} className="space-y-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">NOMBRE DEL CLIENTE</label>
                                    <input 
                                        autoFocus 
                                        required 
                                        type="text" 
                                        placeholder="Ej. Juan Pérez" 
                                        value={newUserName} 
                                        onChange={(e) => setNewUserName(e.target.value)} 
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500/20 focus:bg-white px-5 py-4 rounded-2xl font-black transition-all outline-none" 
                                    />
                                </div>
                                <button disabled={isSubmitting || !newUserName.trim()} className="w-full bg-blue-500 text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/20 hover:scale-[0.98] transition-all disabled:opacity-50 text-lg uppercase tracking-widest italic overflow-hidden group relative">
                                    <div className="absolute inset-0 bg-blue-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                                    <UserPlus size={20} className="relative z-10" />
                                    <span className="relative z-10">{isSubmitting ? "AGREGANDO..." : "AGREGAR"}</span>
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
