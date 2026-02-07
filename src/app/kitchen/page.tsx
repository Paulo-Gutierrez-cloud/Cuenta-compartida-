"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, cn } from "@/lib/utils";
import { ChefHat, Clock, CheckCircle2, Flame, Play, Check, Truck, Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type KitchenItem = {
    id: string;
    created_at: string;
    name: string;
    quantity: number;
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'delivered';
    session_id: string;
    split_type: 'full' | 'shared';
    ids?: string[]; // To handle aggregated shared items
};

type TableCommand = {
    session_id: string;
    table_number: string;
    items: KitchenItem[];
    oldest_item: string;
};

export default function KitchenPage() {
    const [commands, setCommands] = useState<TableCommand[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchKitchenOrders = async () => {
        const { data, error } = await supabase
            .from('order_items')
            .select(`
                *,
                sessions!inner (
                    table_number,
                    status
                )
            `)
            .neq('kitchen_status', 'delivered')
            .neq('sessions.status', 'closed')
            .order('created_at', { ascending: true });

        if (error) {
            console.error(error);
            return;
        }

        if (data) {
            // Group items by session_id
            const grouped = (data as any[]).reduce((acc: { [key: string]: TableCommand }, item) => {
                const sid = item.session_id;
                if (!acc[sid]) {
                    acc[sid] = {
                        session_id: sid,
                        table_number: item.sessions.table_number,
                        items: [],
                        oldest_item: item.created_at
                    };
                }

                const baseName = item.split_type === 'shared'
                    ? item.name.replace(/\s\(\d+\/\d+\)$/, '')
                    : item.name;

                // Check if we already have an entry for this item in this command
                const existingItem = acc[sid].items.find(i =>
                    (i.split_type === 'shared' && i.name === baseName) ||
                    (i.split_type === 'full' && i.id === item.id)
                );

                if (existingItem && item.split_type === 'shared') {
                    if (!existingItem.ids) existingItem.ids = [existingItem.id];
                    existingItem.ids.push(item.id);
                } else {
                    acc[sid].items.push({
                        ...item,
                        name: baseName,
                        ids: item.split_type === 'shared' ? [item.id] : [item.id]
                    });
                }

                return acc;
            }, {});

            setCommands(Object.values(grouped).sort((a, b) =>
                new Date(a.oldest_item).getTime() - new Date(b.oldest_item).getTime()
            ));
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchKitchenOrders();

        const channel = supabase
            .channel('kitchen_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchKitchenOrders())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, () => fetchKitchenOrders())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const updateItemStatus = async (itemIds: string | string[], status: string) => {
        const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
        await supabase
            .from('order_items')
            .update({ kitchen_status: status })
            .in('id', ids);
    };

    const markTableReady = async (command: TableCommand) => {
        const pendingIds: string[] = [];
        command.items.forEach(i => {
            if (i.kitchen_status !== 'ready') {
                pendingIds.push(...(i.ids || [i.id]));
            }
        });

        if (pendingIds.length === 0) return;

        await supabase
            .from('order_items')
            .update({ kitchen_status: 'ready' })
            .in('id', pendingIds);
    };

    const getTimeElapsed = (createdAt: string) => {
        const diff = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / 60000);
        return `${diff}m`;
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white p-8 font-sans selection:bg-primary">
            <header className="flex justify-between items-center mb-12">
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 bg-primary rounded-[2rem] flex items-center justify-center shadow-[0_20px_50px_rgba(255,255,255,0.05)] rotate-3">
                        <ChefHat size={40} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-5xl font-black tracking-tighter uppercase italic leading-none">KITCHEN DISPLAY</h1>
                        <p className="text-primary font-black text-xs uppercase tracking-[0.4em] mt-2">Comandas por Mesa</p>
                    </div>
                </div>

                <div className="flex gap-4">
                    <div className="bg-white/5 border border-white/10 px-8 py-5 rounded-[2rem] flex items-center gap-8 shadow-2xl">
                        <div className="text-center">
                            <p className="text-[10px] text-white/30 font-black uppercase mb-1 tracking-widest">Tickets Activos</p>
                            <p className="text-3xl font-black">{commands.length}</p>
                        </div>
                        <div className="w-px h-10 bg-white/10" />
                        <div className="text-center group">
                            <p className="text-[10px] text-white/30 font-black uppercase mb-1 tracking-widest">Pendientes</p>
                            <p className="text-3xl font-black text-orange-500 group-hover:scale-110 transition-transform">
                                {commands.reduce((sum, c) => sum + c.items.filter(i => i.kitchen_status === 'pending').length, 0)}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => window.location.href = "/dashboard"} className="bg-white/5 hover:bg-white/10 p-5 rounded-[2rem] border border-white/10 transition-colors">
                        <Play size={24} className="rotate-180" />
                    </button>
                </div>
            </header>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3].map(i => <div key={i} className="h-80 bg-white/5 rounded-[3rem] animate-pulse shadow-inner" />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    <AnimatePresence mode="popLayout">
                        {commands.map((command) => (
                            <motion.div
                                key={command.session_id}
                                layout
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className={cn(
                                    "bg-white/5 border-2 rounded-[3.5rem] p-10 flex flex-col justify-between min-h-[400px] transition-all duration-700 shadow-2xl relative overflow-hidden",
                                    command.items.every(i => i.kitchen_status === 'ready')
                                        ? "border-emerald-500/50 bg-emerald-500/5"
                                        : "border-white/5 hover:border-white/20"
                                )}
                            >
                                {/* Table Header */}
                                <div className="z-10">
                                    <div className="flex justify-between items-start mb-8">
                                        <div className="bg-white text-black w-20 h-20 rounded-[2rem] flex items-center justify-center font-black text-4xl shadow-xl shadow-white/10 rotate-[-2deg]">
                                            {command.table_number}
                                        </div>
                                        <div className="text-right">
                                            <div className="flex items-center gap-2 text-white/40 text-[11px] font-black uppercase tracking-widest">
                                                <Clock size={14} className="text-primary" /> {getTimeElapsed(command.oldest_item)}
                                            </div>
                                            <p className="text-[10px] text-white/20 font-bold uppercase mt-1">Ticket #{command.session_id.slice(0, 4)}</p>
                                        </div>
                                    </div>

                                    {/* Item List */}
                                    <div className="space-y-4 mb-8">
                                        {command.items.map((item) => (
                                            <div
                                                key={item.id}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-2xl transition-all",
                                                    item.kitchen_status === 'ready' ? "bg-emerald-500/20 text-emerald-100 opacity-60" : "bg-white/5"
                                                )}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "w-2 h-2 rounded-full",
                                                        item.kitchen_status === 'pending' && "bg-orange-500 animate-pulse",
                                                        item.kitchen_status === 'preparing' && "bg-blue-500 animate-pulse",
                                                        item.kitchen_status === 'ready' && "bg-emerald-500"
                                                    )} />
                                                    <span className="font-black text-lg tracking-tight uppercase italic">{item.name}</span>
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                    {item.kitchen_status === 'pending' && (
                                                        <button
                                                            onClick={() => updateItemStatus(item.ids!, 'preparing')}
                                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                                                        >
                                                            <Play size={12} fill="currentColor" /> Cocinar
                                                        </button>
                                                    )}
                                                    {item.kitchen_status === 'preparing' && (
                                                        <button
                                                            onClick={() => updateItemStatus(item.ids!, 'ready')}
                                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-[0_4px_12px_rgba(16,185,129,0.3)]"
                                                        >
                                                            <Check size={12} strokeWidth={4} /> Listo
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Footer Action */}
                                <div className="z-10">
                                    {command.items.some(i => i.kitchen_status !== 'ready') ? (
                                        <button
                                            onClick={() => markTableReady(command)}
                                            className="w-full bg-primary text-primary-foreground font-black py-6 rounded-[2rem] flex items-center justify-center gap-3 hover:scale-[0.98] transition-all shadow-xl shadow-primary/20 uppercase tracking-widest text-sm italic"
                                        >
                                            <CheckCircle2 size={24} strokeWidth={3} /> MARCAR TICKET LISTO
                                        </button>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="p-4 bg-emerald-500/20 rounded-2xl text-emerald-500 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                                                <Bell size={18} fill="currentColor" className="animate-bounce" /> Todo Preparado
                                            </div>
                                            <p className="text-white/20 font-bold text-[10px] uppercase tracking-widest">Esperando retiro por camarero</p>
                                        </div>
                                    )}
                                </div>

                                {/* Background Ambient */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[80px] -z-0" />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {commands.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-[60vh] text-white/10">
                    <div className="w-40 h-40 bg-white/5 rounded-full flex items-center justify-center mb-10 shadow-inner">
                        <Flame size={60} />
                    </div>
                    <h2 className="text-4xl font-black uppercase tracking-[0.3em] italic">COCINA VACÍA</h2>
                    <p className="font-bold text-xs uppercase mt-4 tracking-[0.5em] opacity-40">The service is running smooth</p>
                </div>
            )}
        </div>
    );
}
