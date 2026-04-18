"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function InventoryERP() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchItems = async () => {
        setLoading(true);
        console.log("Fetching inventory items...");
        const { data, error } = await supabase
            .from('inventory_items')
            .select('*')
            .order('name');
        
        if (error) {
            console.error("Error fetching items:", error);
            alert("Error al cargar: " + error.message);
        } else {
            console.log("Items fetched:", data);
            setItems(data || []);
        }
        setLoading(false);
    };

    const seedData = async () => {
        setLoading(true);
        console.log("Seeding data...");
        try {
            // 1. Insumos
            const { error: invError } = await supabase.from('inventory_items').upsert([
                { name: 'Harina', stock_quantity: 50, unit: 'kg', min_stock_alert: 5 },
                { name: 'Queso Mozzarella', stock_quantity: 20, unit: 'kg', min_stock_alert: 2 },
                { name: 'Salsa de Tomate', stock_quantity: 15, unit: 'kg', min_stock_alert: 3 },
                { name: 'Carne de Res', stock_quantity: 30, unit: 'kg', min_stock_alert: 5 },
                { name: 'Pan Artesanal', stock_quantity: 100, unit: 'units', min_stock_alert: 10 },
                { name: 'Queso Mascarpone', stock_quantity: 8, unit: 'kg', min_stock_alert: 1 }
            ], { onConflict: 'name' });

            if (invError) throw invError;

            // 2. Platillos
            const { error: menuError } = await supabase.from('menu_items').upsert([
                { name: 'Pizza Margarita', description: 'Clásica pizza italiana.', price: 12.5, category: 'Pizzas' },
                { name: 'Hamburguesa con Queso', description: 'Res 100% y cheddar.', price: 10, category: 'Hamburguesas' },
                { name: 'Ensalada César con Pollo', description: 'Lechuga romana.', price: 8.5, category: 'Ensaladas' },
                { name: 'Tiramisú', description: 'Postre de café.', price: 6, category: 'Postres' }
            ], { onConflict: 'name' });

            if (menuError) throw menuError;

            alert("¡Datos cargados con éxito!");
            await fetchItems();
        } catch (err: any) {
            console.error("Seed error:", err);
            alert("Error al cargar datos: " + (err.message || err.details || "Desconocido"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    return (
        <div className="p-8 bg-slate-50 min-h-screen font-sans">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-tight">Control de Inventario (ERP)</h1>
                <div className="flex gap-4">
                    <button onClick={seedData} className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-600 transition-all">
                        CARGAR MENÚ Y STOCK
                    </button>
                    <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all">
                        + NUEVO INGREDIENTE
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {items.length === 0 && !loading && (
                    <div className="col-span-full py-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                        No hay ingredientes en el inventario. Empieza agregando uno.
                    </div>
                )}
                {items.map(item => (
                    <div key={item.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="text-slate-500 text-xs font-bold uppercase mb-1">{item.unit}</h3>
                        <p className="text-lg font-bold text-slate-800 mb-4">{item.name}</p>
                        <div className="flex justify-between items-end">
                            <div>
                                <span className={`text-2xl font-black ${item.stock_quantity < (item.min_stock_alert || 0) ? 'text-red-500' : 'text-slate-900'}`}>
                                    {item.stock_quantity}
                                </span>
                            </div>
                            <button className="text-slate-400 hover:text-slate-900 transition-colors">Editar</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
