import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { 
  AlertTriangle, 
  Calendar, 
  Search, 
  Package, 
  FileText,
  Filter,
  ChevronDown,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const DamagedItemsReport: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });

  // Queries
  const damagedItems = useLiveQuery(() => 
    db.returnedItems
      .filter(item => item.restockStatus === 'DAMAGED')
      .toArray()
  );

  const returns = useLiveQuery(() => db.returns.toArray());
  const products = useLiveQuery(() => db.products.toArray());

  // Filter items based on date and search term
  const filteredItems = damagedItems?.filter(item => {
    const parentReturn = returns?.find(r => r.id === item.returnId);
    if (!parentReturn) return false;
    
    const returnDate = new Date(parentReturn.returnDate);
    const isInDateRange = returnDate >= dateRange.start && returnDate <= dateRange.end;
    const matchesSearch = item.productName.toLowerCase().includes(searchTerm.toLowerCase());
    
    return isInDateRange && matchesSearch;
  });

  const totalValueLost = filteredItems?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Damaged Items</h1>
          <p className="text-slate-500 text-sm">Tracking inventory value lost due to damage or expiration.</p>
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

      {/* Summary Banner */}
      <div className="bg-red-600 rounded-2xl p-6 text-white shadow-xl shadow-red-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl">
            <AlertTriangle className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-red-100 text-sm font-medium">Total Value Lost (Selected Period)</p>
            <h2 className="text-3xl font-black">₦{totalValueLost.toLocaleString()}</h2>
          </div>
        </div>
        <div className="hidden md:block text-right">
          <p className="text-red-100 text-xs font-bold uppercase tracking-widest">Affected Units</p>
          <p className="text-2xl font-bold">{filteredItems?.reduce((sum, i) => sum + i.quantity, 0) || 0}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search damaged products..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Product</th>
                <th className="px-6 py-4 font-semibold">Date Logged</th>
                <th className="px-6 py-4 font-semibold">Reason</th>
                <th className="px-6 py-4 font-semibold">Qty</th>
                <th className="px-6 py-4 font-semibold text-right">Loss Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems?.map(item => {
                const parentReturn = returns?.find(r => r.id === item.returnId);
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 rounded-lg">
                          <Package className="w-4 h-4 text-red-600" />
                        </div>
                        <span className="font-bold text-slate-800">{item.productName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {parentReturn ? format(parentReturn.returnDate, 'dd MMM, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="italic">{parentReturn?.reason || 'No reason provided'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{item.quantity} units</td>
                    <td className="px-6 py-4 text-right font-bold text-red-600">
                      ₦{(item.price * item.quantity).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {filteredItems?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No damaged items found for this search or period.
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

export default DamagedItemsReport;
