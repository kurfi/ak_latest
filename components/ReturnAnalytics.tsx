import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { RotateCcw, AlertCircle, ShoppingBag, TrendingUp, BarChart3 } from 'lucide-react';

export const ReturnAnalytics: React.FC = () => {
  const returns = useLiveQuery(() => db.returns.toArray());
  const returnedItems = useLiveQuery(() => db.returnedItems.toArray());

  const stats = {
    totalRefunds: returns?.reduce((sum, r) => sum + r.totalRefundAmount, 0) || 0,
    returnCount: returns?.length || 0,
    damagedItems: returnedItems?.filter(i => i.restockStatus === 'DAMAGED').length || 0,
    restockedItems: returnedItems?.filter(i => i.restockStatus === 'RESTOCK').length || 0,
  };

  // Top reason analysis (mock logic)
  const reasons = returns?.reduce((acc: any, r) => {
    acc[r.reason] = (acc[r.reason] || 0) + 1;
    return acc;
  }, {});
  
  const topReason = reasons ? Object.entries(reasons).sort(([,a]:any,[,b]:any) => b-a)[0] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><RotateCcw className="w-4 h-4" /></div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Returns</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-xl font-black text-slate-800">{stats.returnCount}</h3>
          <span className="text-[10px] text-slate-400 font-medium">Transactions</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-50 rounded-lg text-red-600"><TrendingUp className="w-4 h-4" /></div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Refund Value</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-xl font-black text-red-600">₦{stats.totalRefunds.toLocaleString()}</h3>
          <span className="text-[10px] text-slate-400 font-medium">Issued</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><AlertCircle className="w-4 h-4" /></div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Loss Items</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-xl font-black text-slate-800">{stats.damagedItems}</h3>
          <span className="text-[10px] text-slate-400 font-medium">Not restocked</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-green-50 rounded-lg text-green-600"><BarChart3 className="w-4 h-4" /></div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Top Reason</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold text-slate-800 truncate max-w-[120px]">
            {topReason ? topReason[0] : 'N/A'}
          </h3>
          <span className="text-[10px] text-slate-400 font-medium">Frequent</span>
        </div>
      </div>
    </div>
  );
};
