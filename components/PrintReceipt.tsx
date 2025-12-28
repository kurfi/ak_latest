import React from 'react';
import { Sale } from '../types';
import { format } from 'date-fns';

interface PrintReceiptProps {
  sale: Sale;
}

export const PrintReceipt: React.FC<PrintReceiptProps> = ({ sale }) => {
  return (
    <div id="receipt-content" className="bg-white text-slate-900 text-sm font-mono max-w-[300px] mx-auto p-4 leading-relaxed">
      {/* Header */}
      <div className="text-center space-y-1 mb-6">
        <h2 className="text-xl font-bold uppercase tracking-wider">AK Alheri Chemist</h2>
        <p className="text-[10px] font-bold">PPMVS Kurfi</p>
        <p className="text-[10px]">No.2&3 Maradi Aliyu Street</p>
        <p className="text-[10px]">Opposite JIBWIS Jumma'a Masjid</p>
        <p className="text-[10px] font-bold">Tel: 09060605362</p>
      </div>

      {/* Meta Data */}
      <div className="border-y border-dashed border-slate-300 py-2 mb-4 text-[11px] space-y-0.5">
        <div className="flex justify-between">
          <span>Date:</span>
          <span className="font-bold">{format(sale.date, 'dd/MM/yyyy HH:mm')}</span>
        </div>
        <div className="flex justify-between">
          <span>Invoice:</span>
          <span className="font-bold">#{sale.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span className="font-bold truncate max-w-[120px]">{sale.customerName || 'Walk-in'}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-4 font-bold border-b border-slate-200 pb-1 text-[11px]">
          <span className="col-span-2">Item</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Total</span>
        </div>
        {sale.items.map((item, idx) => (
          <div key={idx} className="space-y-0.5">
            <div className="grid grid-cols-4 text-[11px]">
              <span className="col-span-2 font-bold leading-tight">{item.productName}</span>
              <span className="text-center">x{item.quantity}</span>
              <span className="text-right font-bold">₦{item.total.toLocaleString()}</span>
            </div>
            <div className="text-[9px] text-slate-500">@ ₦{item.price.toLocaleString()} per unit</div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-slate-200 pt-3 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span>Subtotal:</span>
          <span>₦{sale.totalAmount.toLocaleString()}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-[11px] text-red-600">
            <span>Discount:</span>
            <span>-₦{sale.discount.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-black pt-1 border-t border-slate-100">
          <span>TOTAL:</span>
          <span>₦{sale.finalAmount.toLocaleString()}</span>
        </div>
      </div>

      {/* Payment Details */}
      <div className="mt-4 pt-4 border-t border-dashed border-slate-300 text-center space-y-1">
        <p className="text-[10px] uppercase font-bold tracking-widest bg-slate-100 py-1 rounded">
          Paid via {sale.paymentMethod}
        </p>
        {sale.status === 'PARTIAL' && (
          <p className="text-[9px] font-bold text-red-600">Balance Added to Credit History</p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center space-y-2 border-t border-slate-100 pt-4">
        <p className="text-[10px] font-bold italic">Mun gode da kasuwancin ku!</p>
        <p className="text-[9px] text-slate-400">Thank you for your patronage!</p>
        
        {/* Simple visual separator for the end of physical receipt */}
        <div className="flex justify-center gap-1 opacity-20 mt-4">
          <div className="w-1 h-1 bg-slate-900 rounded-full"></div>
          <div className="w-1 h-1 bg-slate-900 rounded-full"></div>
          <div className="w-1 h-1 bg-slate-900 rounded-full"></div>
        </div>
      </div>
    </div>
  );
};
