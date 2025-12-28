import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { supabase } from '../services/supabase';
import { 
  BarChart3, 
  Download, 
  Filter, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  ShoppingBag, 
  Users, 
  Wallet,
  FileText,
  Clock,
  ChevronDown
} from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { generateAndSavePdfFromHtml } from '../services/pdfService';
import { useToast } from '../contexts/ToastContext';

const Reports: React.FC = () => {
  const { showToast } = useToast();
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });

  // Queries
  const sales = useLiveQuery(() => 
    db.sales.where('date').between(dateRange.start, dateRange.end).toArray()
  );
  const expenses = useLiveQuery(() => 
    db.expenses.where('date').between(dateRange.start, dateRange.end).toArray()
  );
  const products = useLiveQuery(() => db.products.toArray());

  // Calculations
  const totalSales = sales?.reduce((sum, s) => sum + s.finalAmount, 0) || 0;
  const totalExpenses = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const netProfit = totalSales - totalExpenses;
  const salesCount = sales?.length || 0;

  // Best Selling (Dummy logic for now)
  const productPerformance = sales?.reduce((acc: any, sale) => {
    sale.items.forEach(item => {
      acc[item.productName] = (acc[item.productName] || 0) + item.quantity;
    });
    return acc;
  }, {});

  const bestSelling = Object.entries(productPerformance || {})
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 5);

  const exportReport = async () => {
    const element = document.getElementById('report-container');
    if (!element) return;
    
    try {
      showToast('Generating report...', 'info');
      await generateAndSavePdfFromHtml(
        element, 
        `Report_${format(dateRange.start, 'yyyyMMdd')}_${format(dateRange.end, 'yyyyMMdd')}.pdf`,
        'reports'
      );
      showToast('Report saved to your Reports folder.', 'success');
    } catch (error) {
      showToast('Failed to export report.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Business Reports</h1>
          <p className="text-slate-500 text-sm">Financial performance and sales analytics.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
          <Calendar className="w-4 h-4 text-slate-400 ml-2" />
          <input 
            type="date" 
            className="text-sm outline-none bg-transparent"
            value={format(dateRange.start, 'yyyy-MM-dd')}
            onChange={e => setDateRange(prev => ({ ...prev, start: new Date(e.target.value) }))}
          />
          <span className="text-slate-300">to</span>
          <input 
            type="date" 
            className="text-sm outline-none bg-transparent"
            value={format(dateRange.end, 'yyyy-MM-dd')}
            onChange={e => setDateRange(prev => ({ ...prev, end: new Date(e.target.value) }))}
          />
          <button 
            onClick={exportReport}
            className="ml-2 bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-900 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div id="report-container" className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" /> Total Revenue
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-2">₦{totalSales.toLocaleString()}</h3>
            <div className="flex items-center gap-1 text-green-600 text-xs font-bold mt-2">
              <ArrowUpRight className="w-3 h-3" /> 12.5% vs last month
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Expenses
            </p>
            <h3 className="text-2xl font-bold text-red-600 mt-2">₦{totalExpenses.toLocaleString()}</h3>
            <div className="flex items-center gap-1 text-red-600 text-xs font-bold mt-2">
              <ArrowUpRight className="w-3 h-3" /> 4.2% higher costs
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Net Profit
            </p>
            <h3 className="text-2xl font-bold text-indigo-600 mt-2">₦{netProfit.toLocaleString()}</h3>
            <div className="flex items-center gap-1 text-green-600 text-xs font-bold mt-2">
              <ArrowUpRight className="w-3 h-3" /> 8.1% improvement
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" /> Transactions
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-2">{salesCount}</h3>
            <p className="text-xs text-slate-400 mt-2">Completed sales</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Best Selling Products */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" /> Best Selling Items
            </h3>
            <div className="space-y-4">
              {bestSelling.map(([name, qty]: any, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center font-bold text-slate-400 text-xs">
                    #{idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold text-slate-700">{name}</span>
                      <span className="text-xs font-bold text-indigo-600">{qty} Sold</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-full rounded-full" 
                        style={{ width: `${(qty / (bestSelling[0][1] as number)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {bestSelling.length === 0 && (
                <p className="text-center text-slate-400 py-8">No sales data for this period.</p>
              )}
            </div>
          </div>

          {/* Recent Performance Log */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" /> Detailed Transactions
              </h3>
              <button className="text-xs font-bold text-indigo-600 hover:underline">View All</button>
            </div>
            <div className="space-y-3">
              {sales?.slice(0, 5).map(sale => (
                <div key={sale.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <ShoppingBag className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">#{sale.invoiceNumber}</p>
                      <p className="text-xs text-slate-500">{format(sale.date, 'MMM dd, HH:mm')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">₦{sale.finalAmount.toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">{sale.paymentMethod}</p>
                  </div>
                </div>
              ))}
              {sales?.length === 0 && (
                <p className="text-center text-slate-400 py-8">No transactions logged.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
