
import React, { useState, useMemo, useRef } from 'react';
import { db } from '../db/db';
import { Sale, SaleStatus, PaymentMethod, Product, Batch, Expense, Return, ReturnedItem } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
    Search, 
    Download, 
    FileText, 
    TrendingUp, 
    TrendingDown, 
    ShoppingBag, 
    DollarSign, 
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Filter,
    X,
    ChevronDown,
    ChevronUp,
    PieChart as PieChartIcon,
    BarChart as BarChartIcon,
    Table as TableIcon,
    FileSpreadsheet,
    Receipt,
    RefreshCcw,
    AlertCircle
} from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';
import { useToast } from '../contexts/ToastContext';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { generateAndSavePdfFromHtml } from '../services/pdfService';

const Reports: React.FC = () => {
    const { showToast } = useToast();
    const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
    const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [salesSearchQuery, setSalesSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'inventory' | 'expenses' | 'returns'>('overview');
    const [isExporting, setIsProcessing] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    // Live Queries
    const sales = useLiveQuery(async () => {
        let start: Date, end: Date;
        const now = new Date();

        switch (dateRange) {
            case 'week':
                start = startOfWeek(now); end = endOfWeek(now);
                break;
            case 'month':
                start = startOfMonth(now); end = endOfMonth(now);
                break;
            case 'custom':
                start = startOfDay(new Date(customStart)); end = endOfDay(new Date(customEnd));
                break;
            default: // today
                start = startOfDay(now); end = endOfDay(now);
        }

        return await db.sales
            .where('date')
            .between(start, end)
            .reverse()
            .toArray();
    }, [dateRange, customStart, customEnd]) || [];

    const expenses = useLiveQuery(async () => {
        let start: Date, end: Date;
        const now = new Date();
        if (dateRange === 'week') { start = startOfWeek(now); end = endOfWeek(now); }
        else if (dateRange === 'month') { start = startOfMonth(now); end = endOfMonth(now); }
        else if (dateRange === 'custom') { start = startOfDay(new Date(customStart)); end = endOfDay(new Date(customEnd)); }
        else { start = startOfDay(now); end = endOfDay(now); }

        return await db.expenses.where('date').between(start, end).toArray();
    }, [dateRange, customStart, customEnd]) || [];

    const returns = useLiveQuery(async () => {
        let start: Date, end: Date;
        const now = new Date();
        if (dateRange === 'week') { start = startOfWeek(now); end = endOfWeek(now); }
        else if (dateRange === 'month') { start = startOfMonth(now); end = endOfMonth(now); }
        else if (dateRange === 'custom') { start = startOfDay(new Date(customStart)); end = endOfDay(new Date(customEnd)); }
        else { start = startOfDay(now); end = endOfDay(now); }

        return await db.returns.where('returnDate').between(start, end).toArray();
    }, [dateRange, customStart, customEnd]) || [];

    const products = useLiveQuery(() => db.products.toArray()) || [];
    const batches = useLiveQuery(() => db.batches.toArray()) || [];

    // --- Analytics Computations ---

    // 1. Overview Totals
    const totalSales = useMemo(() => sales.reduce((sum, s) => sum + s.finalAmount, 0), [sales]);
    const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
    const totalRefunds = useMemo(() => returns.reduce((sum, r) => sum + r.totalRefundAmount, 0), [returns]);
    
    // Calculate Gross Profit (Sales - COGS)
    const grossProfit = useMemo(() => {
        return sales.reduce((sum, sale) => {
            const saleCOGS = sale.items.reduce((cogs, item) => cogs + ((item.costPrice || 0) * item.quantity), 0);
            return sum + (sale.finalAmount - saleCOGS);
        }, 0);
    }, [sales]);

    // Calculate Value of returned items that were restocked vs lost
    const totalCostOfGoodReturns = useMemo(() => 0, []); // Simplified for now

    const netProfit = grossProfit - totalExpenses - totalRefunds + totalCostOfGoodReturns;

    // Filtered Sales for Display
    const filteredSales = useMemo(() => {
        if (!salesSearchQuery) return sales;
        const lowerQuery = salesSearchQuery.toLowerCase();
        return sales.filter(sale =>
            (sale.customerName?.toLowerCase() || '').includes(lowerQuery) ||
            (sale.id?.toString() || '').includes(lowerQuery)
        );
    }, [sales, salesSearchQuery]);

    // 2. Chart Data: Sales by Date
    const salesByDate = useMemo(() => {
        const grouped: Record<string, number> = {};
        sales.forEach(sale => {
            const dateStr = format(sale.date, 'MMM dd');
            grouped[dateStr] = (grouped[dateStr] || 0) + sale.finalAmount;
        });
        return Object.entries(grouped).map(([date, amount]) => ({ date, amount }));
    }, [sales]);

    // 3. Chart Data: Payment Methods
    const salesByPayment = useMemo(() => {
        const grouped: Record<string, number> = {};
        sales.forEach(sale => {
            if (sale.paymentMethod === PaymentMethod.MULTIPAY && sale.paymentMethods) {
                sale.paymentMethods.forEach(pm => {
                    grouped[pm.method] = (grouped[pm.method] || 0) + pm.amount;
                });
            } else {
                grouped[sale.paymentMethod] = (grouped[sale.paymentMethod] || 0) + sale.finalAmount;
            }
        });
        return Object.entries(grouped).map(([name, value]) => ({ name, value }));
    }, [sales]);

    // 4. Inventory Insights
    const inventoryStats = useMemo(() => {
        const totalValue = batches.reduce((sum, b) => sum + (b.costPrice * b.quantity), 0);
        const stockOutItems = products.filter(p => {
            const qty = batches.filter(b => b.productId === p.id).reduce((s, b) => s + b.quantity, 0);
            return qty <= 0;
        }).length;
        const lowStockItems = products.filter(p => {
            const qty = batches.filter(b => b.productId === p.id).reduce((s, b) => s + b.quantity, 0);
            return qty > 0 && qty <= p.minStockLevel;
        }).length;
        return { totalValue, stockOutItems, lowStockItems };
    }, [products, batches]);

    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

    const handleExportPDF = async () => {
        if (!reportRef.current) return;
        setIsProcessing(true);
        try {
            const filename = `Report-${dateRange}-${format(new Date(), 'yyyyMMdd')}.pdf`;
            await generateAndSavePdfFromHtml(reportRef.current, filename);
            showToast('Report exported successfully', 'success');
        } catch (error) {
            showToast('Export failed', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6 md:space-y-8" ref={reportRef}>
            {/* Header & Filters */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 no-print">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Business Reports</h1>
                    <p className="text-slate-500 font-medium">Analyze your chemist performance and inventory</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        {(['today', 'week', 'month', 'custom'] as const).map((r) => (
                            <button
                                key={r}
                                onClick={() => setDateRange(r)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${dateRange === r ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="p-2 text-xs font-bold border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                            <span className="text-slate-400 font-bold">to</span>
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="p-2 text-xs font-bold border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    )}

                    <button
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 text-sm font-bold"
                    >
                        {isExporting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Export PDF
                    </button>
                </div>
            </div>

            {/* Top Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between group hover:border-emerald-200 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">Gross Sales</span>
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Total Revenue</p>
                        <h3 className="text-2xl font-black text-slate-800">₦{totalSales.toLocaleString()}</h3>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between group hover:border-blue-200 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase">Profitability</span>
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Estimated Net Profit</p>
                        <h3 className={`text-2xl font-black ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>₦{netProfit.toLocaleString()}</h3>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between group hover:border-orange-200 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-colors">
                            <TrendingDown className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-1 rounded-full uppercase">Outflow</span>
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Expenses & Refunds</p>
                        <h3 className="text-2xl font-black text-slate-800">₦{(totalExpenses + totalRefunds).toLocaleString()}</h3>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between group hover:border-indigo-200 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <ShoppingBag className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase">Transactions</span>
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Volume</p>
                        <h3 className="text-2xl font-black text-slate-800">{sales.length} Sales</h3>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex border-b no-print overflow-x-auto">
                    {(['overview', 'sales', 'inventory', 'expenses', 'returns'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-8 py-5 text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-slate-50 text-indigo-600 border-b-4 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="p-4 md:p-8">
                    {activeTab === 'overview' && (
                        <div className="grid lg:grid-cols-2 gap-8 md:gap-12 animate-in fade-in slide-in-from-bottom-4">
                            <div className="space-y-6">
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                    <BarChartIcon className="w-5 h-5 text-indigo-500" /> Revenue Trend
                                </h3>
                                <div className="h-80 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={salesByDate}>
                                            <defs>
                                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} tickFormatter={(v) => `₦${v/1000}k`} />
                                            <Tooltip 
                                                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px'}}
                                                formatter={(v: number) => [`₦${v.toLocaleString()}`, 'Revenue']}
                                            />
                                            <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                    <PieChartIcon className="w-5 h-5 text-emerald-500" /> Payment Distribution
                                </h3>
                                <div className="h-80 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={salesByPayment}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {salesByPayment.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 font-bold text-[10px] uppercase">
                                                By Volume
                                            </text>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap justify-center gap-4 mt-4">
                                        {salesByPayment.map((entry, index) => (
                                            <div key={entry.name} className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}} />
                                                <span className="text-[10px] font-black text-slate-500 uppercase">{entry.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sales' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="flex flex-col md:flex-row gap-4 items-center justify-between no-print">
                                <div className="relative w-full md:w-96">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                    <input 
                                        type="text" 
                                        placeholder="Search by ID or Customer..." 
                                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
                                        value={salesSearchQuery}
                                        onChange={e => setSalesSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">{filteredSales.length} records found</div>
                            </div>

                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-black">
                                        <tr>
                                            <th className="p-4 border-b">Timestamp</th>
                                            <th className="p-4 border-b">Customer</th>
                                            <th className="p-4 border-b">Method</th>
                                            <th className="p-4 border-b">Items</th>
                                            <th className="p-4 border-b text-right">Discount</th>
                                            <th className="p-4 border-b text-right">Final Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredSales.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-12 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <AlertCircle className="w-8 h-8 opacity-20" />
                                                        <p className="italic">No transactions found for the selected period.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSales.map((sale) => (
                                                <tr key={sale.id} className="hover:bg-slate-50">
                                                    <td className="p-4">
                                                        <div className="font-medium text-slate-900">{format(sale.date, 'MMM dd, yyyy')}</div>
                                                        <div className="text-xs text-slate-500">{format(sale.date, 'HH:mm')}</div>
                                                    </td>
                                                    <td className="p-4 text-slate-700">{sale.customerName || 'Walk-in'}</td>
                                                    <td className="p-4">
                                                        <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200">
                                                            {sale.paymentMethod}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-slate-600">
                                                        {(sale.items?.length || 0)} items
                                                    </td>
                                                    <td className="p-4 text-right text-orange-500 font-bold">
                                                        {sale.discount > 0 ? `-₦${sale.discount.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="p-4 text-right font-black text-slate-900 text-base">
                                                        ₦{sale.finalAmount.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'inventory' && (
                        <div className="grid md:grid-cols-3 gap-6 animate-in fade-in">
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Valuation</p>
                                <h4 className="text-2xl font-black text-slate-800">₦{inventoryStats.totalValue.toLocaleString()}</h4>
                                <p className="text-xs text-slate-500">Total value at cost price</p>
                            </div>
                            <div className="bg-red-50 p-6 rounded-2xl border border-red-100 space-y-2">
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Out of Stock</p>
                                <h4 className="text-2xl font-black text-red-600">{inventoryStats.stockOutItems} Items</h4>
                                <p className="text-xs text-red-500">Require immediate replenishment</p>
                            </div>
                            <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 space-y-2">
                                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Low Stock Alert</p>
                                <h4 className="text-2xl font-black text-amber-600">{inventoryStats.lowStockItems} Items</h4>
                                <p className="text-xs text-amber-500">Below minimum safety levels</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'expenses' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-black">
                                        <tr>
                                            <th className="p-4 border-b">Date</th>
                                            <th className="p-4 border-b">Category</th>
                                            <th className="p-4 border-b">Description</th>
                                            <th className="p-4 border-b">Status</th>
                                            <th className="p-4 border-b text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {expenses.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No expenses recorded.</td></tr>
                                        ) : (
                                            expenses.map(exp => (
                                                <tr key={exp.id}>
                                                    <td className="p-4 text-slate-600">{format(exp.date, 'MMM dd, yyyy')}</td>
                                                    <td className="p-4 font-bold text-slate-700">{exp.category}</td>
                                                    <td className="p-4 text-slate-500">{exp.note}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${exp.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {exp.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right font-black text-slate-900">₦{exp.amount.toLocaleString()}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'returns' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-black">
                                        <tr>
                                            <th className="p-4 border-b">Date</th>
                                            <th className="p-4 border-b">Original Sale</th>
                                            <th className="p-4 border-b">Customer</th>
                                            <th className="p-4 border-b">Reason</th>
                                            <th className="p-4 border-b text-right">Refund</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {returns.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No returns found.</td></tr>
                                        ) : (
                                            returns.map(ret => (
                                                <tr key={ret.id}>
                                                    <td className="p-4 text-slate-600">{format(ret.returnDate, 'MMM dd, HH:mm')}</td>
                                                    <td className="p-4 font-mono text-xs text-slate-400">#{ret.saleId}</td>
                                                    <td className="p-4 font-bold text-slate-700">{ret.customerName}</td>
                                                    <td className="p-4 text-slate-500 italic">{ret.reason}</td>
                                                    <td className="p-4 text-right font-black text-red-600">₦{ret.totalRefundAmount.toLocaleString()}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Reports;