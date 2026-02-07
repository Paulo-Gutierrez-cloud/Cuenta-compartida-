"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, cn } from "@/lib/utils";
import { Check, CreditCard, UtensilsCrossed, Flame, Bell, LogOut, Banknote, Smartphone, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRealtimeBill, Item } from "@/hooks/useRealtimeBill";
import { UserAvatars, User } from "@/components/ui/user-avatars";

type OrderClientProps = {
    tableId: string;
    initialItems: Item[];
};

export default function OrderClient({ tableId, initialItems }: OrderClientProps) {
    const router = useRouter();

    useEffect(() => {
        const savedSession = localStorage.getItem("current_session_id");
        if (!tableId || tableId !== savedSession) {
            router.push("/");
        }
    }, [tableId, router]);

    const { items, tableUsers, isConnected, isLoading, payItems } = useRealtimeBill(tableId, initialItems);

    const [mySelection, setMySelection] = useState<string[]>([]);
    const [showPayModal, setShowPayModal] = useState(false);
    const [userName] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem("user_name") || "Tú";
        }
        return "Tú";
    });
    
    // Payment method and tip states (moved down)
    const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'mercadopago'>('efectivo');
    const [tipPercentage, setTipPercentage] = useState<number>(0);
    const [customTip, setCustomTip] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Removed useEffect for userName initialization to avoid cascading render

    const toggleSelection = (id: string, status: string) => {
        if (status !== "available") return;
        setMySelection((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const myTotal = items.filter((i) => mySelection.includes(i.id)).reduce((sum, item) => sum + item.price, 0);
    const billTotal = items.reduce((sum, i) => sum + i.price, 0);
    const paidTotal = items.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.price, 0);
    const progress = billTotal > 0 ? (paidTotal / billTotal) * 100 : 0;

    const isBillFullyPaid = items.length > 0 && items.every(i => i.status === 'paid' || i.price === 0);

    // Extract active users from items (those who have paid or are selecting)
    const activeUsers: User[] = useMemo(() => {
        const usersMap = new Map<string, User>();
        
        // 1. Add virtual users from table_users (Supabase)
        tableUsers.forEach(user => {
            usersMap.set(user.name, user);
        });

        // 2. Add the current user (the one viewing this page)
        if (userName && !usersMap.has(userName)) {
            const isSelecting = mySelection.length > 0;
            const hasPaidItems = items.some(i => i.paid_by === userName && i.status === 'paid');
            usersMap.set(userName, {
                id: `current_${userName}`,
                name: userName,
                status: hasPaidItems ? 'paid' : isSelecting ? 'selecting' : 'active'
            });
        }
        
        // 3. Add users who have paid items but are not in table_users
        items.filter(i => i.paid_by && i.status === 'paid').forEach(item => {
            if (item.paid_by && !usersMap.has(item.paid_by)) {
                usersMap.set(item.paid_by, {
                    id: item.paid_by,
                    name: item.paid_by,
                    status: 'paid'
                });
            }
        });

        // 4. Add users who are currently selecting (locked items) but are not in table_users
        items.filter(i => i.paid_by && i.status === 'locked').forEach(item => {
            if (item.paid_by && !usersMap.has(item.paid_by)) {
                usersMap.set(item.paid_by, {
                    id: item.paid_by,
                    name: item.paid_by,
                    status: 'selecting'
                });
            }
        });

        return Array.from(usersMap.values());
    }, [items, tableUsers, userName, mySelection.length]);

    const handlePay = () => {
        setShowPayModal(true);
    };

    const confirmPayment = async () => {
        setIsProcessing(true);
        const tipAmount = customTip ? parseFloat(customTip) : (myTotal * tipPercentage / 100);
        await payItems(mySelection, userName, paymentMethod, tipAmount);
        setMySelection([]);
        setShowPayModal(false);
        setIsProcessing(false);
        setTipPercentage(0);
        setCustomTip('');
    };

    const getKitchenStatusLink = (status: string) => {
        switch (status) {
            case 'preparing': return { label: 'En Cocina', icon: <Flame size={10} className="animate-pulse" />, color: 'text-orange-500 bg-orange-50' };
            case 'ready': return { label: '¡Listo!', icon: <Bell size={10} />, color: 'text-emerald-500 bg-emerald-50' };
            default: return null;
        }
    }

    // Block navigation while bill has pending items (prevent users from leaving without paying)
    const hasPendingItems = items.length > 0 && items.some(i => i.status === 'available' && i.price > 0);
    
    useEffect(() => {
        // Block back button navigation
        window.history.pushState(null, '', window.location.href);
        
        const handlePopState = () => {
            window.history.pushState(null, '', window.location.href);
        };
        
        window.addEventListener('popstate', handlePopState);
        
        // Block browser close/refresh with warning while bill is pending
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasPendingItems) {
                e.preventDefault();
                e.returnValue = 'Tienes items pendientes de pagar. ¿Estás seguro de que quieres salir?';
                return e.returnValue;
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        return () => {
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasPendingItems]);

    // Clean up session data when bill is fully paid
    useEffect(() => {
        if (isBillFullyPaid) {
            localStorage.removeItem("current_session_id");
            localStorage.removeItem("user_name");
        }
    }, [isBillFullyPaid]);

    if (isBillFullyPaid) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center font-sans">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl mb-8">
                    <Check size={48} className="text-white" strokeWidth={4} />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <h1 className="text-4xl font-black tracking-tighter mb-4">¡Todo Pagado!</h1>
                    <p className="text-muted-foreground font-medium text-lg max-w-[280px] mx-auto mb-8">Gracias por visitarnos. Tu mesa ha sido liberada.</p>
                    
                    {/* Show all users who participated */}
                    {activeUsers.length > 0 && (
                        <div className="mb-8">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Participantes</p>
                            <div className="flex justify-center">
                                <UserAvatars users={activeUsers} maxVisible={8} />
                            </div>
                        </div>
                    )}
                    
                    <button onClick={() => window.location.href = "/"} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-bold transition-colors mx-auto">
                        <LogOut size={18} /> Salir
                    </button>
                </motion.div>
            </div>
        );
    }

    const isOrderReady = items.length > 0 && items.every(i => i.kitchen_status === 'ready' || i.status === 'paid');

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary pb-32">
            <header className="fixed top-0 w-full z-20 bg-background/80 backdrop-blur-xl border-b border-border/50">
                <div className="max-w-md mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-lg"><UtensilsCrossed size={18} /></div>
                        <div>
                            <h1 className="text-sm font-bold tracking-tight">Tu Cuenta</h1>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Jazz Club</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-destructive")} />
                        <div className="w-8 h-8 rounded-full bg-secondary border border-background flex items-center justify-center text-xs font-bold">{userName.charAt(0)}</div>
                    </div>
                </div>
            </header>

            <main className="max-w-md mx-auto px-6 pt-24">
                <AnimatePresence>
                    {isOrderReady && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="bg-emerald-500 text-white rounded-3xl p-5 mb-6 shadow-xl shadow-emerald-500/20 flex items-center gap-4 border-2 border-emerald-400"
                        >
                            <div className="bg-white/20 p-3 rounded-2xl">
                                <Bell className="animate-bounce" size={24} fill="currentColor" />
                            </div>
                            <div>
                                <p className="font-black text-sm uppercase tracking-widest italic">¡TODO LISTO!</p>
                                <p className="text-[10px] font-bold opacity-80 uppercase tracking-tight">Tu pedido ya salió de cocina.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-[2rem] p-6 shadow-xl border border-border mb-8 relative overflow-hidden">
                    <p className="text-muted-foreground text-sm font-medium mb-1">Total de la Mesa</p>
                    <h2 className="text-4xl font-black tracking-tighter mb-6">{formatCurrency(billTotal)}</h2>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <span>Pagado</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-4 bg-muted rounded-full overflow-hidden p-1">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-primary rounded-full" />
                        </div>
                    </div>
                </motion.div>

                {/* Active users section */}
                {activeUsers.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mb-6"
                    >
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            En esta mesa
                        </p>
                        <UserAvatars users={activeUsers} maxVisible={6} />
                    </motion.div>
                )}

                <div className="space-y-3">
                    <AnimatePresence>
                        {isLoading && items.length === 0 ? (
                            [1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-2xl animate-pulse" />)
                        ) : (
                            items.map((item) => {
                                const kStatus = getKitchenStatusLink(item.kitchen_status);
                                const isSelected = mySelection.includes(item.id);
                                const isPaid = item.status === "paid";
                                const isLocked = item.status === "locked";

                                return (
                                    <motion.button
                                        key={item.id}
                                        onClick={() => toggleSelection(item.id, item.status)}
                                        disabled={isLocked || isPaid || item.price === 0}
                                        className={cn(
                                            "w-full p-5 rounded-2xl border text-left flex justify-between items-center transition-all duration-300",
                                            isPaid || item.price === 0 ? "bg-muted/30 opacity-60" : "bg-card shadow-sm hover:shadow-md",
                                            isSelected && "bg-primary border-primary text-primary-foreground shadow-xl shadow-primary/20"
                                        )}
                                    >
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all", isSelected ? "bg-white border-white text-primary" : "border-muted/30 text-transparent", isPaid && "bg-emerald-500 border-emerald-500 text-white")}>
                                                <Check size={12} strokeWidth={4} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-[15px]">{item.name}</p>
                                                    {kStatus && !isPaid && (
                                                        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase flex items-center gap-1", kStatus.color)}>
                                                            {kStatus.icon} {kStatus.label}
                                                        </span>
                                                    )}
                                                    {item.split_type === 'shared' && !isPaid && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                                                            Shared
                                                        </span>
                                                    )}
                                                    {item.price === 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-secondary text-secondary-foreground border border-border">
                                                            Cortesía
                                                        </span>
                                                    )}
                                                </div>
                                                {(isPaid || isLocked) && (
                                                    <p className={cn("text-[10px] font-bold mt-0.5", isPaid ? "text-emerald-600" : "text-amber-600 uppercase tracking-widest")}>
                                                        {isPaid ? `Pagado por ${item.paid_by}` : `${item.paid_by} seleccionando...`}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="font-black text-[15px] tracking-tight">{formatCurrency(item.price)}</div>
                                        </div>
                                    </motion.button>
                                );
                            })
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <div className="fixed bottom-6 left-6 right-6 z-30 max-w-md mx-auto">
                <AnimatePresence>
                    {myTotal > 0 && (
                        <motion.button initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} onClick={handlePay} className="w-full bg-primary text-primary-foreground p-1 rounded-[1.5rem] shadow-2xl flex items-center justify-between group">
                            <div className="bg-white/10 rounded-[1.2rem] px-6 py-4 flex-1 text-left">
                                <span className="text-[10px] uppercase font-black tracking-widest opacity-60 block">Tu Parte</span>
                                <span className="font-black text-xl tracking-tight">{formatCurrency(myTotal)}</span>
                            </div>
                            <div className="px-8 font-black uppercase italic tracking-widest text-sm flex items-center gap-2">
                                Pagar Parte <CreditCard size={18} />
                            </div>
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {showPayModal && (
                    <div className="fixed inset-0 bg-background/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }} 
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card w-full max-w-md rounded-3xl shadow-2xl p-6 border border-border"
                        >
                            {isProcessing ? (
                                <div className="flex flex-col items-center py-12">
                                    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                                    <p className="font-black uppercase tracking-[0.2em] text-xs">Procesando...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="text-center mb-6">
                                        <h3 className="text-xl font-black tracking-tight">Confirmar Pago</h3>
                                        <p className="text-3xl font-black text-primary mt-2">{formatCurrency(myTotal)}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{mySelection.length} item(s) seleccionado(s)</p>
                                    </div>

                                    {/* Payment Methods */}
                                    <div className="mb-6">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Método de Pago</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => setPaymentMethod('efectivo')}
                                                className={cn(
                                                    "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                                                    paymentMethod === 'efectivo' 
                                                        ? "border-emerald-500 bg-emerald-50 text-emerald-700" 
                                                        : "border-border hover:border-muted-foreground"
                                                )}
                                            >
                                                <Banknote size={24} />
                                                <span className="text-[10px] font-bold uppercase">Efectivo</span>
                                            </button>
                                            <button
                                                onClick={() => setPaymentMethod('tarjeta')}
                                                className={cn(
                                                    "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                                                    paymentMethod === 'tarjeta' 
                                                        ? "border-blue-500 bg-blue-50 text-blue-700" 
                                                        : "border-border hover:border-muted-foreground"
                                                )}
                                            >
                                                <CreditCard size={24} />
                                                <span className="text-[10px] font-bold uppercase">Tarjeta</span>
                                            </button>
                                            <button
                                                onClick={() => setPaymentMethod('mercadopago')}
                                                className={cn(
                                                    "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                                                    paymentMethod === 'mercadopago' 
                                                        ? "border-cyan-500 bg-cyan-50 text-cyan-700" 
                                                        : "border-border hover:border-muted-foreground"
                                                )}
                                            >
                                                <Smartphone size={24} />
                                                <span className="text-[10px] font-bold uppercase">MercadoPago</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tips */}
                                    <div className="mb-6">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                            <Heart size={12} /> Propina (opcional)
                                        </p>
                                        <div className="grid grid-cols-4 gap-2 mb-3">
                                            {[0, 10, 15, 20].map((pct) => (
                                                <button
                                                    key={pct}
                                                    onClick={() => { setTipPercentage(pct); setCustomTip(''); }}
                                                    className={cn(
                                                        "py-3 rounded-xl border-2 font-bold text-sm transition-all",
                                                        tipPercentage === pct && !customTip
                                                            ? "border-primary bg-primary/10 text-primary" 
                                                            : "border-border hover:border-muted-foreground"
                                                    )}
                                                >
                                                    {pct === 0 ? 'Sin' : `${pct}%`}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-muted-foreground">Otro:</span>
                                            <input
                                                type="number"
                                                placeholder="$0"
                                                value={customTip}
                                                onChange={(e) => { setCustomTip(e.target.value); setTipPercentage(0); }}
                                                className="flex-1 px-4 py-2 rounded-xl border-2 border-border focus:border-primary outline-none text-sm font-bold"
                                            />
                                        </div>
                                        {(tipPercentage > 0 || customTip) && (
                                            <p className="text-center text-sm font-bold text-primary mt-2">
                                                Propina: {formatCurrency(customTip ? parseFloat(customTip) || 0 : myTotal * tipPercentage / 100)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Total */}
                                    <div className="bg-muted rounded-2xl p-4 mb-6">
                                        <div className="flex justify-between text-sm font-medium text-muted-foreground mb-1">
                                            <span>Subtotal</span>
                                            <span>{formatCurrency(myTotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm font-medium text-muted-foreground mb-2">
                                            <span>Propina</span>
                                            <span>{formatCurrency(customTip ? parseFloat(customTip) || 0 : myTotal * tipPercentage / 100)}</span>
                                        </div>
                                        <div className="flex justify-between text-lg font-black border-t border-border pt-2">
                                            <span>Total</span>
                                            <span>{formatCurrency(myTotal + (customTip ? parseFloat(customTip) || 0 : myTotal * tipPercentage / 100))}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowPayModal(false)}
                                            className="flex-1 py-4 rounded-2xl border-2 border-border font-bold text-sm hover:bg-muted transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={confirmPayment}
                                            className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-black text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Check size={18} />
                                            Pagar
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
