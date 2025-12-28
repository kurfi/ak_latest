import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { 
  TrendingUp, 
  ShoppingBag, 
  Users, 
  Wallet, 
  AlertTriangle, 
  ArrowUpRight, 
  Clock, 
  Package,
  Calendar,
  ChevronRight,
  Plus
} from 'lucide-react';
import { format, startOfDay, subDays } from 'date-fns';
import { Link } from 'react-router-dom';

const Dashboard: React.FC = () => {
  // Real data queries
  const sales = useLiveQuery(() => db.sales.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const batches = useLiveQuery(() => db.batches.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());
  const expenses = useLiveQuery(() => db.expenses.toArray());

  // Calculations
  const today = startOfDay(new Date());
  const todaySales = sales?.filter(s => s.date >= today) || [];
  const totalRevenueToday = todaySales.reduce((sum, s) => sum + s.finalAmount, 0);
  
  const lowStockCount = products?.filter(p => {
    const stock = batches?.filter(b => b.productId === p.id).reduce((sum, b) => sum + b.quantity, 0) || 0;
    return stock <= (p.minStockLevel || 0);
  }).length || 0;

  const totalDebt = customers?.reduce((sum, c) => sum + (c.currentDebt || 0), 0) || 0;

  const recentTransactions = sales?.slice(-5).reverse() || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome Back!</h1>
          <p className="text-slate-500 text-sm">Here's what's happening at AK Alheri Chemist today.</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-bold text-slate-700">{format(new Date(), 'EEEE, dd MMMM')}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-indigo-50 rounded-xl">
              <TrendingUp className="w-6 h-6 text-indigo-600" />
            </div>
            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">+₦{totalRevenueToday.toLocaleString()}</span>
          </div>
          <p className="text-slate-500 text-sm font-medium">Daily Revenue</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">₦{totalRevenueToday.toLocaleString()}</h3>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-50 rounded-xl">
              <ShoppingBag className="w-6 h-6 text-amber-600" />
            </div>
            <span className="text-xs font-bold text-slate-400">Total: {sales?.length || 0}</span>
          </div>
          <p className="text-slate-500 text-sm font-medium">Today's Sales</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{todaySales.length}</h3>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-50 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <Link to="/inventory" className="text-xs font-bold text-red-600 hover:underline">Fix Now</Link>
          </div>
          <p className="text-slate-500 text-sm font-medium">Low Stock Alerts</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{lowStockCount} Items</h3>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-50 rounded-xl">
              <Wallet className="w-6 h-6 text-emerald-600" />
            </div>
            <Link to="/customers" className="text-xs font-bold text-emerald-600 hover:underline">View All</Link>
          </div>
          <p className="text-slate-500 text-sm font-medium">Pending Credits</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">₦{totalDebt.toLocaleString()}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-xl shadow-slate-200">
            <h3 className="font-bold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/pos" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                <ShoppingBag className="w-5 h-5" />
                <span className="text-xs font-medium">New Sale</span>
              </Link>
              <Link to="/inventory" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                <Package className="w-5 h-5" />
                <span className="text-xs font-medium">Add Stock</span>
              </Link>
              <Link to="/expenses" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                <Wallet className="w-5 h-5" />
                <span className="text-xs font-medium">Expenses</span>
              </Link>
              <Link to="/customers" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                <Users className="w-5 h-5" />
                <span className="text-xs font-medium">Customers</span>
              </Link>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
              Inventory Status
              <Link to="/inventory" className="text-xs text-indigo-600">View All</Link>
            </h3>
            <div className="space-y-4">
              {products?.slice(0, 4).map(product => {
                const stock = batches?.filter(b => b.productId === product.id).reduce((sum, b) => sum + b.quantity, 0) || 0;
                const percentage = Math.min(100, (stock / (product.minStockLevel || 10) * 100));
                
                return (
                  <div key={product.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-600 truncate max-w-[150px]">{product.name}</span>
                      <span className={stock <= (product.minStockLevel || 0) ? 'text-red-600' : 'text-slate-500'}>
                        {stock} units
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${stock <= (product.minStockLevel || 0) ? 'bg-red-500' : 'bg-indigo-500'}`} 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" /> Recent Sales
            </h3>
            <Link to="/reports" className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
              Full Report
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentTransactions.map(sale => (
                  <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">#{sale.invoiceNumber}</td>
                    <td className="px-6 py-4 text-slate-600">{sale.customerName || 'Walk-in'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        sale.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-indigo-600">
                      ₦{sale.finalAmount.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                      No transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
