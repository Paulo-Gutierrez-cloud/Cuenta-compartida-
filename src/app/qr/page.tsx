"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { motion } from "framer-motion";

type Session = {
    id: string;
    table_number: string;
    total_amount: number;
    status: string;
};

function QRContent() {
    const searchParams = useSearchParams();
    const selectedMesa = searchParams.get("mesa");

    const [tables, setTables] = useState<Session[]>([]);
    const [selectedTable, setSelectedTable] = useState<Session | null>(null);

    // Fetch ONLY Active Tables for QR visibility, 
    // but ensure we get one record per table number
    useEffect(() => {
        const fetchTables = async () => {
            const { data } = await supabase
                .from('sessions')
                .select('*')
                .neq('status', 'closed')
                .order('table_number');

            if (data) {
                setTables(data as Session[]);
                // Auto-select if mesa is in URL
                if (selectedMesa) {
                    const found = data.find(t => t.table_number === selectedMesa);
                    if (found) setSelectedTable(found);
                } else if (data.length > 0) {
                    setSelectedTable(data[0]);
                }
            }
        };
        fetchTables();
    }, [selectedMesa]);

    // UPDATE with your local IP
    const BASE_URL = "http://192.168.1.16:3000";

    if (!selectedTable) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-white/50 animate-pulse font-bold tracking-widest uppercase text-xs">Sincronizando Mesas...</p>
        </div>
    );

    // KEY CHANGE: QR points to the Root (Join screen)
    const joinUrl = `${BASE_URL}/?mesa=${selectedTable.table_number}`;

    return (
        <div className="flex flex-col lg:flex-row h-full max-w-6xl mx-auto w-full gap-10 p-4 font-sans">

            {/* Sidebar List */}
            <div className="lg:w-80 bg-white/5 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 overflow-y-auto max-h-[70vh] shadow-2xl">
                <div className="flex items-center gap-2 mb-6 px-2">
                    <LayoutGrid size={16} className="text-primary" />
                    <h2 className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Seleccionar Mesa</h2>
                </div>
                <div className="space-y-3">
                    {tables.map(table => (
                        <button
                            key={table.id}
                            onClick={() => setSelectedTable(table)}
                            className={`w-full text-left p-5 rounded-[1.5rem] flex justify-between items-center transition-all duration-500 border-2 ${selectedTable.table_number === table.table_number
                                ? 'bg-white border-white text-black font-black shadow-[0_20px_40px_rgba(255,255,255,0.15)] scale-105 z-10'
                                : 'bg-black/20 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
                                }`}
                        >
                            <span className="text-lg">Mesa {table.table_number}</span>
                            <div className={`w-2 h-2 rounded-full ${table.status === 'active' ? 'bg-blue-500' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Preview */}
            <div className="flex-1 flex flex-col items-center justify-center relative py-10 lg:py-0">
                <div className="z-10 text-center space-y-10 max-w-sm w-full">
                    <div className="space-y-2">
                        <motion.h1
                            key={selectedTable.table_number}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-6xl font-black tracking-tighter"
                        >
                            Mesa {selectedTable.table_number}
                        </motion.h1>
                        <p className="text-white/40 font-bold uppercase tracking-[0.3em] text-[10px]">The Jazz Club Experience</p>
                    </div>

                    <motion.div
                        key={joinUrl}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white p-10 rounded-[3rem] shadow-[0_40px_80px_rgba(0,0,0,0.5)] mx-auto w-80 h-80 flex items-center justify-center relative group"
                    >
                        <div className="absolute inset-0 bg-primary/20 rounded-[3rem] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                        <QRCodeSVG
                            value={joinUrl}
                            size={240}
                            level={"H"}
                            fgColor="#000000"
                            className="z-10"
                        />
                    </motion.div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <p className="text-lg font-bold text-white/60">Escanea para pagar tu parte</p>
                            <div className="h-0.5 w-12 bg-primary mx-auto rounded-full" />
                        </div>

                        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-5 border border-white/10 flex justify-between items-center shadow-inner">
                            <span className="text-white/40 font-black text-[10px] uppercase tracking-widest">Total Mesa</span>
                            <span className="text-3xl font-black tracking-tighter text-emerald-400">{formatCurrency(selectedTable.total_amount)}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-3 mx-auto px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                    >
                        <Printer size={18} className="text-primary" /> Imprimir QR Permanente
                    </button>
                </div>

                {/* Visual Accent */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full -z-10 animate-pulse" />
            </div>
        </div>
    );
}

export default function TableQRPage() {
    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-primary selection:text-white">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,_#1a1a1a_0%,_#000000_100%)] -z-20" />
            <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-primary/5 blur-[150px] rounded-full -z-10" />

            <Link href="/dashboard" className="absolute top-8 left-8 z-50 text-white/30 hover:text-white flex items-center gap-3 transition-all bg-black/40 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/5 hover:border-white/20 group font-black text-[10px] uppercase tracking-widest">
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> Dashboard
            </Link>

            <Suspense fallback={<div className="text-white/50 font-black tracking-widest uppercase text-xs animate-pulse">Iniciando Generador...</div>}>
                <QRContent />
            </Suspense>
        </div>
    );
}
