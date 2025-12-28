import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { 
  RotateCcw, 
  Calendar, 
  Search, 
  ArrowLeftRight, 
  Filter,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  FileText
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const ReturnsReport: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });

  // Queries
  const returns = useLiveQuery(() => 
    db.returns.where('returnDate').between(dateRange.start, dateRange.end).toArray()
  );
  const returnedItems = useLiveQuery(() => db.returnedItems.toArray());
  const products = useLiveQuery(() => db.products.toArray());

  // Calculations
  const totalRefunded = returns?.reduce((sum, r) => sum + (r.totalRefundAmount || 0), 0) || 0;
  const totalItemsCount = returns?.length || 0;
  
  const damagedCount = returnedItems?.filter(item => 
    item.restockStatus === 'DAMAGED' && 
    returns?.some(r => r.id === item.returnId)
  ).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Returns Report</h1>
          <p className="text-slate-500 text-sm">Analysis of product returns and refunds.</p>
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
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="p-3 bg-indigo-50 rounded-xl w-fit mb-4">
            <RotateCcw className="w-6 h-6 text-indigo-600" />
          </div>
          <p className="text-slate-500 text-sm font-medium">Total Refunded</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">₦{totalRefunded.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="p-3 bg-amber-50 rounded-xl w-fit mb-4">
            <ArrowLeftRight className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-slate-500 text-sm font-medium">Return Transactions</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalItemsCount}</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="p-3 bg-red-50 rounded-xl w-fit mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-slate-500 text-sm font-medium">Damaged Products</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{damagedCount} Items</h3>
        </div>
      </div>

      {/* List Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50/50 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" /> Detailed Log
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Sale ID</th>
                <th className="px-6 py-4 font-semibold">Reason</th>
                <th className="px-6 py-4 font-semibold">Refund Method</th>
                <th className="px-6 py-4 font-semibold text-right">Refund Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {returns?.map(ret => (
                <tr key={ret.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-600">{format(ret.returnDate, 'MMM dd, yyyy')}</td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-700">#{ret.saleId}</td>
                  <td className="px-6 py-4 text-slate-600 italic">"{ret.reason}"</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {ret.paymentMethod}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-600">₦{ret.totalRefundAmount.toLocaleString()}</td>
                </tr>
              ))}
              {returns?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No returns found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReturnsReport;
