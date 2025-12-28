import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Package, RotateCcw, Printer, ArrowRight } from 'lucide-react';

interface ReturnReceiptDisplayProps {
  returnData: any;
  onDone: () => void;
}

export const ReturnReceiptDisplay: React.FC<ReturnReceiptDisplayProps> = ({ returnData, onDone }) => {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-100">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Return Processed</h2>
        <p className="text-slate-500 text-sm">Return ID: #{returnData.id}</p>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-4 font-mono text-xs">
        <div className="flex justify-between border-b border-slate-200 pb-2">
          <span className="text-slate-500 uppercase">Original Invoice</span>
          <span className="font-bold text-slate-800">#{returnData.saleInvoice}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200 pb-2">
          <span className="text-slate-500 uppercase">Date</span>
          <span className="font-bold text-slate-800">{format(returnData.returnDate, 'dd/MM/yyyy HH:mm')}</span>
        </div>
        
        <div className="space-y-2">
          <p className="text-slate-400 uppercase text-[10px] font-bold">Items Returned</p>
          {returnData.items.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between items-start">
              <span className="flex-1 pr-4">{item.productName} x{item.returnQty}</span>
              <span className="font-bold">₦{(item.price * item.returnQty).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t-2 border-slate-200 flex justify-between items-center text-sm">
          <span className="font-bold text-slate-900 uppercase">Total Refund</span>
          <span className="text-lg font-black text-indigo-600">₦{returnData.totalRefundAmount.toLocaleString()}</span>
        </div>

        <div className="pt-2 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Refund via {returnData.paymentMethod}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button 
          onClick={() => window.print()}
          className="w-full py-3 border-2 border-slate-200 rounded-xl font-bold text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
        >
          <Printer className="w-5 h-5" /> Print Return Slip
        </button>
        <button 
          onClick={onDone}
          className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
        >
          Continue <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
