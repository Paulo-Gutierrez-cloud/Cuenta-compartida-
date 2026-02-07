"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, ArrowRight, RefreshCcw, QrCode } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

function JoinContent() {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<{ id: string; table_number: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();

  const paramTableId = searchParams.get("table_id");
  const paramMesaNum = searchParams.get("mesa");

  const resolveSession = async () => {
    setIsLoading(true);
    setStatusMessage("");
    try {
      if (paramMesaNum) {
        const { data: sessionId, error: rpcError } = await supabase.rpc('get_active_session', { p_table_number: paramMesaNum });
        if (sessionId) {
          setSelectedTable({ id: sessionId, table_number: paramMesaNum });
        } else {
          setStatusMessage("No detectamos una mesa activa. Asegúrate de que el camarero haya abierto tu mesa.");
        }
      } else if (paramTableId) {
        const { data } = await supabase
          .from('sessions')
          .select('id, table_number')
          .eq('id', paramTableId)
          .single();
        if (data) setSelectedTable(data);
        else setStatusMessage("No pudimos encontrar tu sesión. Por favor, escanea el QR de nuevo.");
      } else {
        setStatusMessage("¡Hola! Por favor escanea el código QR de tu mesa para ver tu cuenta.");
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Hubo un problema de conexión. Inténtalo de nuevo en unos segundos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    resolveSession();
  }, [paramTableId, paramMesaNum]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedTable) return;

    localStorage.setItem("user_name", name);
    localStorage.setItem("current_session_id", selectedTable.id);
    router.push(`/order?table_id=${selectedTable.id}`);
  };

  if (isLoading) return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground font-black text-xs uppercase tracking-widest">Sincronizando Mesa...</p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card w-full max-w-sm rounded-[3rem] shadow-2xl border border-border p-10 text-center font-sans relative overflow-hidden"
    >
      <div className="w-20 h-20 bg-primary/10 text-primary rounded-[2rem] flex items-center justify-center mx-auto mb-8 relative">
        <Users size={32} strokeWidth={2.5} />
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full -z-10 animate-pulse" />
      </div>

      <h1 className="text-3xl font-black mb-2 tracking-tighter italic uppercase">
        {selectedTable ? `¡BIENVENIDOS!` : "HOLA"}
      </h1>

      <p className="text-muted-foreground mb-10 font-medium text-sm leading-relaxed px-2">
        {selectedTable
          ? `Estás en la Mesa ${selectedTable.table_number}. Ingresa tu nombre para comenzar.`
          : statusMessage
        }
      </p>

      {selectedTable ? (
        <form onSubmit={handleJoin} className="space-y-4">
          <input
            type="text"
            placeholder="Tu Nombre (ej. Carlos)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-6 py-5 rounded-2xl border-2 border-transparent bg-muted focus:bg-background focus:border-primary/40 transition-all text-lg text-center font-black outline-none placeholder:opacity-30"
            autoFocus
          />
          <button
            type="submit"
            className="w-full bg-primary text-primary-foreground font-black py-5 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-primary/20 text-md uppercase italic tracking-widest"
            disabled={!name.trim()}
          >
            Ingresar <ArrowRight size={20} strokeWidth={3} />
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-muted text-foreground font-black py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-muted/80 transition-all text-xs uppercase tracking-[0.2em]"
          >
            <RefreshCcw size={16} /> Reintentar Escaneo
          </button>
          <div className="pt-4 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest italic">
              ¿Necesitas ayuda? Solicítalo al camarero
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function RootPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 relative overflow-hidden selection:bg-primary selection:text-white">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,_rgba(var(--primary-rgb),0.1),transparent)] -z-10" />
      <Suspense fallback={<div className="text-muted-foreground font-black uppercase tracking-widest text-xs animate-pulse">Iniciando...</div>}>
        <JoinContent />
      </Suspense>
    </div>
  );
}
