"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminAuditLogs() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (!error) setLogs(data || []);
            setLoading(false);
        };

        fetchLogs();
    }, []);

    if (loading) return <div>Cargando Auditoría...</div>;

    return (
        <div className="p-8 bg-slate-50 min-h-screen font-sans">
            <h1 className="text-2xl font-bold text-slate-800 mb-6 uppercase tracking-tight">Panel de Auditoría ERP</h1>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-100 text-slate-600 text-sm uppercase font-bold border-b border-slate-200">
                            <th className="px-6 py-4">Acción</th>
                            <th className="px-6 py-4">Mesa</th>
                            <th className="px-6 py-4">Detalles</th>
                            <th className="px-6 py-4">Fecha</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-semibold text-slate-700">
                                    <span className={`px-2 py-1 rounded text-xs ${log.action.includes('DELETE') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {log.action}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-slate-600">
                                    {log.table_name === 'sessions' ? `Mesa #${log.old_data?.table_number}` : log.table_name}
                                </td>
                                <td className="px-6 py-4 text-slate-500 text-xs font-mono max-w-xs overflow-hidden truncate">
                                    {log.action === 'DELETE_ORDER_ITEM' ? `Producto: ${log.old_data?.name}` : 'Mesa Liberada'}
                                </td>
                                <td className="px-6 py-4 text-slate-400 text-xs">
                                    {new Date(log.created_at).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
