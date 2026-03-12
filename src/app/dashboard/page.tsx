"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, cn } from "@/lib/utils";
import { LayoutDashboard, QrCode, RefreshCw, Plus, X, ChefHat, Bell, Flame, Check, UserPlus, Receipt, Eye, CreditCard, Banknote, Smartphone, ShoppingBag, Minimize2, Maximize2, Package, Sun, Wine, Home, Crown, MapPin } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { UserAvatars, User } from "@/components/ui/user-avatars";

type OrderItem = {
    id: string;
    session_id: string;
    name: string;
    price: number;
    status: 'available' | 'locked' | 'paid';
    kitchen_status: string;
    paid_by: string | null;
    payment_method: string | null;
    tip_amount: number;
    split_type: string;
};

type Session = {
    id: string;
    table_number: string;
    status: 'active' | 'payment_processing' | 'closed';
    total_amount: number;
    remaining_amount: number;
    sector: string;
    // Computed fields
    preparing_count?: number;
    ready_count?: number;
    active_users?: User[];
    items?: OrderItem[];
};

const SECTORS = [
    { name: 'Todos', icon: MapPin, color: 'bg-gray-900 text-white' },
    { name: 'Interior', icon: Home, color: 'bg-blue-500 text-white' },
    { name: 'Terraza', icon: Sun, color: 'bg-amber-500 text-white' },
    { name: 'Bar', icon: Wine, color: 'bg-purple-500 text-white' },
    { name: 'VIP', icon: Crown, color: 'bg-yellow-500 text-black' },
];

const getSectorStyle = (sector: string) => {
    switch (sector) {
        case 'Terraza': return 'border-l-amber-500 bg-amber-50/30';
        case 'Bar': return 'border-l-purple-500 bg-purple-50/30';
        case 'VIP': return 'border-l-yellow-500 bg-yellow-50/30';
        case 'Interior': return 'border-l-blue-500 bg-blue-50/30';
        default: return 'border-l-gray-300';
    }
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

    // Detail Modal State
    const [detailTable, setDetailTable] = useState<Session | null>(null);

    // Card Size State
    const [cardSize, setCardSize] = useState<'compact' | 'normal' | 'expanded'>('normal');

    // Sector Filter
    const [activeSector, setActiveSector] = useState('Todos');

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
                .select('id, session_id, name, price, kitchen_status, status, paid_by, payment_method, tip_amount, split_type')
                .in('session_id', sessionIds),
            supabase
                .from('table_users')
                .select('id, session_id, name, status, is_virtual')
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
                sector: s.sector || 'Interior',
                preparing_count: sessionsItems.filter(i => i.kitchen_status === 'preparing').length,
                ready_count: sessionsItems.filter(i => i.kitchen_status === 'ready').length,
                active_users: Array.from(usersMap.values()),
                items: sessionsItems as OrderItem[]
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

    const handleReleaseTable = async (sessionId: string) => {
        if (!confirm("¿Cerrar esta sesión y preparar la mesa para nuevos clientes?")) return;

        try {
            // Get the table info before closing
            const { data: sessionData } = await supabase
                .from('sessions')
                .select('table_number, restaurant_id, sector')
                .eq('id', sessionId)
                .single();

            if (!sessionData) {
                alert("No se encontró la sesión");
                return;
            }

            // 1. Close the current session
            const { error: closeError } = await supabase
                .from('sessions')
                .update({ status: 'closed' })
                .eq('id', sessionId);

            if (closeError) {
                console.error('Error closing session:', closeError);
                alert("Error cerrando sesión: " + closeError.message);
                return;
            }

            // 2. Remove table users from old session
            await supabase
                .from('table_users')
                .delete()
                .eq('session_id', sessionId);

            const { error: createError } = await supabase
                .from('sessions')
                .insert({
                    restaurant_id: sessionData.restaurant_id,
                    table_number: sessionData.table_number,
                    status: 'active',
                    total_amount: 0,
                    remaining_amount: 0,
                    sector: sessionData.sector || 'Interior'
                });

            if (createError) {
                console.error('Error creating new session:', createError);
                alert("Error creando nueva sesión: " + createError.message);
                return;
            }

            fetchTables();
        } catch (err) {
            console.error('Release table error:', err);
            alert('Error al reiniciar mesa');
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
        <div className="min-h-screen bg-background p-6 font-sans text-foreground">
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
                    <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
                        <button onClick={() => setCardSize('compact')} className={cn("p-3 rounded-xl transition-all", cardSize === 'compact' ? "bg-white shadow-sm text-black" : "text-gray-400 hover:text-gray-600")} title="Compacto"><Minimize2 size={16} /></button>
                        <button onClick={() => setCardSize('normal')} className={cn("p-3 rounded-xl transition-all", cardSize === 'normal' ? "bg-white shadow-sm text-black" : "text-gray-400 hover:text-gray-600")} title="Normal"><Package size={16} /></button>
                        <button onClick={() => setCardSize('expanded')} className={cn("p-3 rounded-xl transition-all", cardSize === 'expanded' ? "bg-white shadow-sm text-black" : "text-gray-400 hover:text-gray-600")} title="Expandido"><Maximize2 size={16} /></button>
                    </div>
                </div>
            </header>

            {/* Sector Filter Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {SECTORS.map(sector => {
                    const SectorIcon = sector.icon;
                    const count = sector.name === 'Todos' ? tables.length : tables.filter(t => t.sector === sector.name).length;
                    const activeCount = sector.name === 'Todos'
                        ? tables.filter(t => t.total_amount > 0).length
                        : tables.filter(t => t.sector === sector.name && t.total_amount > 0).length;
                    return (
                        <button
                            key={sector.name}
                            onClick={() => setActiveSector(sector.name)}
                            className={cn(
                                "flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                                activeSector === sector.name
                                    ? cn(sector.color, "shadow-lg scale-105")
                                    : "bg-white text-gray-400 border border-gray-100 hover:border-gray-300"
                            )}
                        >
                            <SectorIcon size={16} />
                            {sector.name}
                            <span className={cn(
                                "px-2 py-0.5 rounded-lg text-[10px]",
                                activeSector === sector.name ? "bg-white/20" : "bg-gray-100"
                            )}>
                                {activeCount > 0 ? `${activeCount}/${count}` : count}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className={cn(
                "grid gap-6",
                cardSize === 'compact' ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" :
                cardSize === 'expanded' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" :
                "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            )}>
                {isLoading ? (
                    [1, 2, 3, 4, 5].map(i => <div key={i} className="h-64 bg-white rounded-[2.5rem] animate-pulse shadow-sm" />)
                ) : (
                    tables
                        .filter(t => activeSector === 'Todos' || t.sector === activeSector)
                        .sort((a, b) => parseInt(a.table_number) - parseInt(b.table_number))
                        .map((table) => (
                        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
                        <div key={table.id} className="relative group flex flex-col h-full cursor-pointer" onClick={() => setDetailTable(table)}>
                            <motion.div
                                layout
                                className={cn(
                                    "bg-white rounded-[2.5rem] shadow-xl border-2 transition-all h-full flex flex-col relative overflow-hidden border-l-4",
                                    cardSize === 'compact' ? "p-5" : "p-8",
                                    getSectorStyle(table.sector),
                                    table.ready_count && table.ready_count > 0 ? "border-emerald-500 ring-4 ring-emerald-500/5" : ""
                                )}
                            >
                                {/* Header: Mesa + Status */}
                                <div className={cn("flex justify-between items-start", cardSize === 'compact' ? "mb-3" : "mb-6")}>
                                    <div>
                                        {cardSize !== 'compact' && <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Identificador</p>}
                                        <h2 className={cn("font-black tracking-tighter italic", cardSize === 'compact' ? "text-2xl" : "text-4xl")}>Mesa {table.table_number}</h2>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={cn("px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm inline-block", getStatusColor(table.status, table.remaining_amount))}>
                                            {table.remaining_amount === 0 && table.status !== 'active' ? 'PAGO COMPLETO' : table.status.replace('_', ' ')}
                                        </span>
                                        {cardSize !== 'compact' && (
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
                                        )}
                                    </div>
                                </div>

                                {/* Content: Kitchen Status + Accounting */}
                                <div className={cn("flex-1", cardSize === 'compact' ? "space-y-3" : "space-y-6")}>
                                    {cardSize !== 'compact' && (
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
                                    )}

                                    {/* Active Users in this table */}
                                    {table.active_users && table.active_users.length > 0 && (
                                        <div className="mt-2">
                                            <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-2">Clientes</p>
                                            <UserAvatars users={table.active_users} maxVisible={cardSize === 'compact' ? 3 : cardSize === 'expanded' ? 10 : 4} />
                                        </div>
                                    )}

                                    <div className={cn("bg-gray-50 rounded-2xl border border-gray-100/50", cardSize === 'compact' ? "p-3" : "p-5")}>
                                        <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-1">Cuenta Total</p>
                                        <p className={cn("font-black tracking-tighter", cardSize === 'compact' ? "text-xl" : "text-3xl")}>{formatCurrency(table.total_amount)}</p>

                                        {cardSize !== 'compact' && (
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
                                        )}
                                    </div>

                                    {/* Expanded: show items list */}
                                    {cardSize === 'expanded' && table.items && table.items.length > 0 && (
                                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100/50">
                                            <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-3">Pedidos ({table.items.length})</p>
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {table.items.map(item => (
                                                    <div key={item.id} className="flex justify-between items-center text-xs py-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("w-1.5 h-1.5 rounded-full",
                                                                item.status === 'paid' ? "bg-emerald-500" :
                                                                item.status === 'locked' ? "bg-amber-500" : "bg-gray-300"
                                                            )} />
                                                            <span className="text-gray-600">{item.name}</span>
                                                        </div>
                                                        <span className="font-bold text-gray-400">{formatCurrency(item.price)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* View Details Hint */}
                                {cardSize !== 'compact' && (
                                    <div className="flex items-center justify-center gap-2 text-[9px] text-muted-foreground/50 font-black uppercase tracking-widest mt-3">
                                        <Eye size={10} /> Click para ver desglose
                                    </div>
                                )}

                                {/* Actions Footer */}
                                <div className={cn("border-t border-gray-100 flex gap-2", cardSize === 'compact' ? "mt-3 pt-3" : "mt-6 pt-6")}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setActiveTable(table); setIsAddModalOpen(true); }}
                                        className={cn("flex-1 bg-black text-white font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary transition-all shadow-lg shadow-black/10", cardSize === 'compact' ? "py-3" : "py-4")}
                                    >
                                        <Plus size={14} strokeWidth={3} /> {cardSize === 'compact' ? 'Producto' : 'Ingreso Producto'}
                                    </button>
                                    {cardSize !== 'compact' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setActiveTable(table); setIsUserModalOpen(true); }}
                                            className="aspect-square font-black p-4 rounded-2xl flex items-center justify-center transition-all shadow-inner border bg-blue-50 text-blue-500 border-blue-100 hover:bg-blue-500 hover:text-white"
                                            title="Agregar Cliente Manual"
                                        >
                                            <UserPlus size={14} />
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleReleaseTable(table.id); }}
                                        disabled={!(table.remaining_amount === 0 && table.status !== 'active' && table.total_amount > 0)}
                                        className={cn(
                                            "aspect-square font-black rounded-2xl flex items-center justify-center transition-all shadow-inner border",
                                            cardSize === 'compact' ? "p-3" : "p-4",
                                            table.remaining_amount === 0 && table.status !== 'active' && table.total_amount > 0
                                                ? "bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 scale-105 cursor-pointer"
                                                : "bg-gray-50 text-gray-200 border-gray-100 cursor-not-allowed opacity-40"
                                        )}
                                        title={table.remaining_amount === 0 && table.status !== 'active' && table.total_amount > 0 ? "Cerrar Mesa" : "Solo disponible con pago completo"}
                                    >
                                        <RefreshCw size={14} className={cn(table.remaining_amount === 0 && table.total_amount > 0 && "animate-spin-slow")} />
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

            {/* Detail Breakdown Modal */}
            <AnimatePresence>
                {detailTable && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetailTable(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] shadow-2xl relative overflow-hidden text-black font-sans flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className="p-8 pb-0">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-3xl font-black tracking-tighter italic">MESA {detailTable.table_number}</h2>
                                        <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">Desglose por Cliente</p>
                                    </div>
                                    <button onClick={() => setDetailTable(null)} className="bg-gray-100 p-2 rounded-xl text-gray-400 hover:text-black transition-colors">
                                        <X size={24} />
                                    </button>
                                </div>

                                {/* Summary Bar */}
                                <div className="grid grid-cols-3 gap-3 mb-6">
                                    <div className="bg-gray-50 rounded-2xl p-4 text-center">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Mesa</p>
                                        <p className="text-xl font-black">{formatCurrency(detailTable.total_amount)}</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1">Pagado</p>
                                        <p className="text-xl font-black text-emerald-600">{formatCurrency(detailTable.total_amount - detailTable.remaining_amount)}</p>
                                    </div>
                                    <div className="bg-amber-50 rounded-2xl p-4 text-center border border-amber-100">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">Pendiente</p>
                                        <p className="text-xl font-black text-amber-600">{formatCurrency(detailTable.remaining_amount)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="overflow-y-auto px-8 pb-8 flex-1">
                                {(() => {
                                    const items = detailTable.items || [];
                                    const users = detailTable.active_users || [];

                                    // Group items by paid_by
                                    const paidByUser = new Map<string, OrderItem[]>();
                                    const unpaidItems: OrderItem[] = [];

                                    items.forEach(item => {
                                        if (item.status === 'paid' && item.paid_by) {
                                            const existing = paidByUser.get(item.paid_by) || [];
                                            existing.push(item);
                                            paidByUser.set(item.paid_by, existing);
                                        } else {
                                            unpaidItems.push(item);
                                        }
                                    });

                                    const getMethodIcon = (method: string | null) => {
                                        switch (method) {
                                            case 'efectivo': return <Banknote size={12} className="text-emerald-500" />;
                                            case 'tarjeta': return <CreditCard size={12} className="text-blue-500" />;
                                            case 'mercadopago': return <Smartphone size={12} className="text-cyan-500" />;
                                            default: return null;
                                        }
                                    };

                                    return (
                                        <div className="space-y-6">
                                            {/* Users who paid */}
                                            {Array.from(paidByUser.entries()).map(([userName, userItems]) => {
                                                const subtotal = userItems.reduce((sum, i) => sum + i.price, 0);
                                                const tips = userItems.reduce((sum, i) => sum + (i.tip_amount || 0), 0);
                                                const method = userItems[0]?.payment_method;
                                                const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

                                                return (
                                                    <div key={userName} className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-100">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center text-xs font-black">
                                                                    {initials}
                                                                </div>
                                                                <div>
                                                                    <p className="font-black text-sm">{userName}</p>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-[9px] font-bold uppercase text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Pagado</span>
                                                                        {getMethodIcon(method)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="font-black text-lg">{formatCurrency(subtotal)}</p>
                                                                {tips > 0 && <p className="text-[10px] text-pink-500 font-bold">+ {formatCurrency(tips)} propina</p>}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {userItems.map(item => (
                                                                <div key={item.id} className="flex justify-between items-center text-sm py-1 px-3 rounded-lg bg-white/60">
                                                                    <span className="text-gray-700">{item.name}</span>
                                                                    <span className="font-bold text-gray-500">{formatCurrency(item.price)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Active/Virtual users without payments yet */}
                                            {users.filter(u => u.status !== 'paid' && !paidByUser.has(u.name)).map(user => {
                                                const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                                                return (
                                                    <div key={user.id} className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center text-xs font-black">
                                                                {initials}
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-sm">{user.name}</p>
                                                                <span className="text-[9px] font-bold uppercase text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                                                                    {user.status === 'selecting' ? 'Seleccionando' : 'En mesa'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Unpaid items */}
                                            {unpaidItems.length > 0 && (
                                                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <ShoppingBag size={16} className="text-gray-400" />
                                                        <p className="font-black text-sm text-gray-500">Items sin asignar ({unpaidItems.length})</p>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        {unpaidItems.map(item => (
                                                            <div key={item.id} className="flex justify-between items-center text-sm py-1.5 px-3 rounded-lg bg-white">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={cn(
                                                                        "w-1.5 h-1.5 rounded-full",
                                                                        item.status === 'locked' ? "bg-amber-500 animate-pulse" : "bg-gray-300"
                                                                    )} />
                                                                    <span className="text-gray-700">{item.name}</span>
                                                                </div>
                                                                <span className="font-bold text-gray-500">{formatCurrency(item.price)}</span>
                                                            </div>
                                                        ))}
                                                        <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-200">
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Subtotal pendiente</span>
                                                            <span className="font-black">{formatCurrency(unpaidItems.reduce((s, i) => s + i.price, 0))}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {items.length === 0 && (
                                                <div className="text-center py-12 text-gray-300">
                                                    <ShoppingBag size={40} className="mx-auto mb-3" />
                                                    <p className="font-black text-sm uppercase tracking-widest">Sin pedidos aún</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
