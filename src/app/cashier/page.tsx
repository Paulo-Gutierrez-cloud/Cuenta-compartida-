"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency, cn } from "@/lib/utils";
import { 
    LayoutDashboard, 
    Banknote, 
    CreditCard, 
    Smartphone, 
    Heart, 
    Calendar, 
    Clock, 
    TrendingUp,
    Receipt,
    Users,
    ArrowLeft,
    RefreshCw
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

type SalesData = {
    total_sales: number;
    total_tips: number;
    orders_count: number;
    items_count: number;
    by_payment_method: {
        efectivo: number;
        tarjeta: number;
        mercadopago: number;
    };
    tips_by_method: {
        efectivo: number;
        tarjeta: number;
        mercadopago: number;
    };
};

type CashClosing = {
    id: string;
    closed_at: string;
    opened_at: string;
    closing_type: 'turno' | 'dia';
    total_sales: number;
    cash_amount: number;
    card_amount: number;
    mercadopago_amount: number;
    tips_total: number;
    orders_count: number;
    items_count: number;
    notes: string;
    closed_by: string;
};

export default function CashierPage() {
    const [salesData, setSalesData] = useState<SalesData>({
        total_sales: 0,
        total_tips: 0,
        orders_count: 0,
        items_count: 0,
        by_payment_method: { efectivo: 0, tarjeta: 0, mercadopago: 0 },
        tips_by_method: { efectivo: 0, tarjeta: 0, mercadopago: 0 }
    });
    const [closingHistory, setClosingHistory] = useState<CashClosing[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showClosingModal, setShowClosingModal] = useState(false);
    const [closingType, setClosingType] = useState<'turno' | 'dia'>('turno');
    const [closingNotes, setClosingNotes] = useState('');
    const [closerName, setCloserName] = useState('');
    const [lastClosingTime, setLastClosingTime] = useState<Date | null>(null);

    useEffect(() => {
        // Load last closing time from DB, fallback to start of today
        const loadLastClosing = async () => {
            const { data } = await supabase
                .from('cash_closings')
                .select('closed_at')
                .order('closed_at', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                setLastClosingTime(new Date(data[0].closed_at));
            } else {
                setLastClosingTime(new Date(new Date().setHours(0, 0, 0, 0)));
            }
        };
        loadLastClosing();
    }, []);

    const fetchSalesData = useCallback(async () => {

        if (!lastClosingTime) return;
        setIsLoading(true);
        try {
            // Get paid items (removed date filter for debugging)
            const { data: items, error } = await supabase
                .from('order_items')
                .select('price, payment_method, tip_amount, session_id')
                .eq('status', 'paid');


            if (error) throw error;

            // Calculate totals
            const sales: SalesData = {
                total_sales: 0,
                total_tips: 0,
                orders_count: new Set(items?.map(i => i.session_id) || []).size,
                items_count: items?.length || 0,
                by_payment_method: { efectivo: 0, tarjeta: 0, mercadopago: 0 },
                tips_by_method: { efectivo: 0, tarjeta: 0, mercadopago: 0 }
            };

            items?.forEach(item => {
                sales.total_sales += item.price || 0;
                sales.total_tips += item.tip_amount || 0;
                
                const method = item.payment_method as keyof typeof sales.by_payment_method;
                if (method && sales.by_payment_method[method] !== undefined) {
                    sales.by_payment_method[method] += item.price || 0;
                    sales.tips_by_method[method] += item.tip_amount || 0;
                }
            });

            setSalesData(sales);


            // Fetch closing history
            const { data: closings, error: closingsError } = await supabase
                .from('cash_closings')
                .select('id, closed_at, opened_at, closing_type, total_sales, cash_amount, card_amount, mercadopago_amount, tips_total, orders_count, items_count, notes, closed_by')
                .order('closed_at', { ascending: false })
                .limit(10);

            if (closingsError) console.warn("Could not fetch closings:", closingsError);
            setClosingHistory(closings || []);

        } catch (err) {
            console.error('Error fetching sales data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [lastClosingTime]);

    useEffect(() => {
        fetchSalesData();
    }, [lastClosingTime, fetchSalesData]);

    // Realtime subscription for live updates
    useEffect(() => {
        const channel = supabase
            .channel('cashier_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchSalesData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_closings' }, () => fetchSalesData())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchSalesData]);

    const handleCloseCash = async () => {
        if (!lastClosingTime) return;
        try {
            const { error } = await supabase
                .from('cash_closings')
                .insert({
                    opened_at: lastClosingTime.toISOString(),
                    closing_type: closingType,
                    total_sales: salesData.total_sales,
                    cash_amount: salesData.by_payment_method.efectivo,
                    card_amount: salesData.by_payment_method.tarjeta,
                    mercadopago_amount: salesData.by_payment_method.mercadopago,
                    tips_total: salesData.total_tips,
                    orders_count: salesData.orders_count,
                    items_count: salesData.items_count,
                    notes: closingNotes,
                    closed_by: closerName
                });

            if (error) throw error;

            // Reset for new period
            setLastClosingTime(new Date());
            setShowClosingModal(false);
            setClosingNotes('');
            setCloserName('');
            fetchSalesData();
        } catch (err) {
            console.error('Error closing cash:', err);
            alert('Error al cerrar caja');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('es-CL', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors">
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                                <Receipt size={24} /> CIERRE DE CAJA
                            </h1>
                            <p className="text-xs text-muted-foreground">Control de ventas y pagos</p>
                        </div>
                    </div>
                    <button
                        onClick={() => fetchSalesData()}
                        className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
                                <TrendingUp size={20} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Ventas</span>
                        </div>
                        <p className="text-3xl font-black">{formatCurrency(salesData.total_sales)}</p>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-xl bg-pink-100 text-pink-600">
                                <Heart size={20} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Propinas</span>
                        </div>
                        <p className="text-3xl font-black">{formatCurrency(salesData.total_tips)}</p>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                                <Receipt size={20} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Órdenes</span>
                        </div>
                        <p className="text-3xl font-black">{salesData.orders_count}</p>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
                                <Users size={20} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Items</span>
                        </div>
                        <p className="text-3xl font-black">{salesData.items_count}</p>
                    </motion.div>
                </div>

                {/* Payment Methods Breakdown */}
                <div className="grid lg:grid-cols-2 gap-6 mb-8">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                    >
                        <h2 className="font-black text-lg mb-6 flex items-center gap-2">
                            <LayoutDashboard size={20} /> Desglose por Método de Pago
                        </h2>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                <div className="flex items-center gap-3">
                                    <Banknote size={24} className="text-emerald-600" />
                                    <span className="font-bold">Efectivo</span>
                                </div>
                                <div className="text-right">
                                    <p className="font-black text-lg">{formatCurrency(salesData.by_payment_method.efectivo)}</p>
                                    <p className="text-xs text-emerald-600">+ {formatCurrency(salesData.tips_by_method.efectivo)} propina</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-blue-50 border border-blue-100">
                                <div className="flex items-center gap-3">
                                    <CreditCard size={24} className="text-blue-600" />
                                    <span className="font-bold">Tarjeta</span>
                                </div>
                                <div className="text-right">
                                    <p className="font-black text-lg">{formatCurrency(salesData.by_payment_method.tarjeta)}</p>
                                    <p className="text-xs text-blue-600">+ {formatCurrency(salesData.tips_by_method.tarjeta)} propina</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-cyan-50 border border-cyan-100">
                                <div className="flex items-center gap-3">
                                    <Smartphone size={24} className="text-cyan-600" />
                                    <span className="font-bold">MercadoPago</span>
                                </div>
                                <div className="text-right">
                                    <p className="font-black text-lg">{formatCurrency(salesData.by_payment_method.mercadopago)}</p>
                                    <p className="text-xs text-cyan-600">+ {formatCurrency(salesData.tips_by_method.mercadopago)} propina</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Close Cash Button */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-gradient-to-br from-primary to-primary/80 p-6 rounded-3xl shadow-lg text-white"
                    >
                        <h2 className="font-black text-lg mb-4 flex items-center gap-2">
                            <Clock size={20} /> Cerrar Caja
                        </h2>
                        <p className="text-sm opacity-80 mb-6">
                            Registra el cierre actual para iniciar un nuevo período de ventas.
                        </p>
                        <div className="bg-white/10 rounded-2xl p-4 mb-6">
                            <p className="text-xs opacity-70 mb-1">Período actual desde:</p>
                            <p className="font-bold">{lastClosingTime ? lastClosingTime.toLocaleString('es-CL') : 'Cargando...'}</p>
                        </div>
                        <button
                            onClick={() => setShowClosingModal(true)}
                            className="w-full bg-white text-primary font-black py-4 rounded-2xl hover:bg-white/90 transition-all"
                        >
                            REALIZAR CIERRE
                        </button>
                    </motion.div>
                </div>

                {/* Closing History */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                >
                    <h2 className="font-black text-lg mb-6 flex items-center gap-2">
                        <Calendar size={20} /> Historial de Cierres
                    </h2>
                    {closingHistory.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No hay cierres registrados</p>
                    ) : (
                        <div className="space-y-3">
                            {closingHistory.map((closing) => (
                                <div key={closing.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                                closing.closing_type === 'dia' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                            )}>
                                                {closing.closing_type}
                                            </span>
                                            <span className="text-xs text-muted-foreground">{formatDate(closing.closed_at)}</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">Por: {closing.closed_by || 'Sin nombre'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-lg">{formatCurrency(closing.total_sales)}</p>
                                        <p className="text-xs text-pink-500">+ {formatCurrency(closing.tips_total)} propinas</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </main>

            {/* Closing Modal */}
            <AnimatePresence>
                {showClosingModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white w-full max-w-md rounded-3xl p-6"
                        >
                            <h3 className="text-xl font-black mb-6">Confirmar Cierre de Caja</h3>
                            
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Tipo de Cierre</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setClosingType('turno')}
                                            className={cn(
                                                "py-3 rounded-xl border-2 font-bold transition-all",
                                                closingType === 'turno' ? "border-primary bg-primary/10" : "border-gray-200"
                                            )}
                                        >
                                            Turno
                                        </button>
                                        <button
                                            onClick={() => setClosingType('dia')}
                                            className={cn(
                                                "py-3 rounded-xl border-2 font-bold transition-all",
                                                closingType === 'dia' ? "border-primary bg-primary/10" : "border-gray-200"
                                            )}
                                        >
                                            Día Completo
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Tu Nombre</label>
                                    <input
                                        type="text"
                                        value={closerName}
                                        onChange={(e) => setCloserName(e.target.value)}
                                        placeholder="Ej. Juan Pérez"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Notas (opcional)</label>
                                    <textarea
                                        value={closingNotes}
                                        onChange={(e) => setClosingNotes(e.target.value)}
                                        placeholder="Observaciones del turno..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary outline-none resize-none"
                                    />
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-muted-foreground">Total Ventas</span>
                                    <span className="font-bold">{formatCurrency(salesData.total_sales)}</span>
                                </div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-muted-foreground">Propinas</span>
                                    <span className="font-bold">{formatCurrency(salesData.total_tips)}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-gray-200">
                                    <span className="font-bold">Total</span>
                                    <span className="font-black text-lg">{formatCurrency(salesData.total_sales + salesData.total_tips)}</span>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowClosingModal(false)}
                                    className="flex-1 py-4 rounded-2xl border-2 border-gray-200 font-bold hover:bg-gray-50 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCloseCash}
                                    disabled={!closerName.trim()}
                                    className="flex-1 py-4 rounded-2xl bg-primary text-white font-black hover:opacity-90 transition-all disabled:opacity-50"
                                >
                                    Confirmar Cierre
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
