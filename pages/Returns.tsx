import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Sale, Product, Batch, Return, ReturnedItem, PaymentMethod } from '../types';
import { 
  Search, 
  RotateCcw, 
  ShoppingCart, 
  History, 
  AlertCircle,
  X,
  Plus,
  ArrowRight,
  Package,
  CheckCircle2,
  Trash2,
  Undo2,
  Eye,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../auth/AuthContext';
import { ReturnReceiptDisplay } from '../components/ReturnReceiptDisplay';

const Returns: React.FC = () => {
  const { showToast } = useToast();
  const { currentUser } = useAuth();
  
  // State
  const [activeStep, setActiveStep] = useState<'search' | 'process' | 'receipt'>('search');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnPaymentMethod, setReturnPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedReturn, setCompletedReturn] = useState<any>(null);

  // Queries
  const recentSales = useLiveQuery(() => 
    db.sales.orderBy('date').reverse().limit(10).toArray()
  );

  const handleSearchInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceSearch.trim()) return;

    const sale = await db.sales.where('invoiceNumber').equalsIgnoreCase(invoiceSearch.trim()).first();
    if (sale) {
      setSelectedSale(sale);
      setReturnItems(sale.items.map(item => ({
        ...item,
        returnQty: 0,
        restockStatus: 'RESTOCK'
      })));
      setActiveStep('process');
    } else {
      showToast('Invoice not found.', 'error');
    }
  };

  const handleProcessReturn = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQty > 0);
    if (itemsToReturn.length === 0) {
      showToast('Please select items to return.', 'error');
      return;
    }

    if (!returnReason.trim()) {
      showToast('Please provide a reason for the return.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const totalRefund = itemsToReturn.reduce((sum, item) => sum + (item.price * item.returnQty), 0);
      
      // 1. Create Return Record
      const returnEntry: Omit<Return, 'id'> = {
        saleId: selectedSale!.id!,
        customerId: selectedSale!.customerId,
        staffId: currentUser?.id || 0,
        returnDate: new Date(),
        reason: returnReason,
        paymentMethod: returnPaymentMethod,
        totalRefundAmount: totalRefund,
        notes: '',
        updated_at: new Date().toISOString()
      };

      const returnId = await db.returns.add(returnEntry as Return);

      // 2. Create Returned Items & Update Stock
      for (const item of itemsToReturn) {
        await db.returnedItems.add({
          returnId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.returnQty,
          price: item.price,
          refundAmount: item.price * item.returnQty,
          restockStatus: item.restockStatus as 'RESTOCK' | 'DAMAGED',
          batchId: item.batchId,
          updated_at: new Date().toISOString()
        } as ReturnedItem);

        // Update Batch Stock if restocked
        if (item.restockStatus === 'RESTOCK' && item.batchId) {
          const batch = await db.batches.get(item.batchId);
          if (batch) {
            await db.batches.update(item.batchId, {
              quantity: batch.quantity + item.returnQty
            });
          }
        }
      }

      // 3. Update Original Sale Status (Optional logic depending on partial return)
      // For now, we just log it.
      
      setCompletedReturn({
        ...returnEntry,
        id: returnId,
        items: itemsToReturn,
        saleInvoice: selectedSale?.invoiceNumber
      });
      setActiveStep('receipt');
      showToast('Return processed successfully!', 'success');

    } catch (error) {
      console.error(error);
      showToast('Failed to process return.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sales Returns</h1>
          <p className="text-slate-500 text-sm">Process product returns and refunds.</p>
        </div>
        {activeStep !== 'search' && (
          <button 
            onClick={() => setActiveStep('search')}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Search
          </button>
        )}
      </div>

      {activeStep === 'search' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Search Box */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <RotateCcw className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Find Original Sale</h2>
              <p className="text-slate-500 text-sm">Enter the invoice number from the receipt to begin.</p>
              
              <form onSubmit={handleSearchInvoice} className="flex gap-2 pt-4">
                <input
                  type="text"
                  placeholder="INV-12345678..."
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  value={invoiceSearch}
                  onChange={e => setInvoiceSearch(e.target.value)}
                />
                <button 
                  type="submit"
                  className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors flex items-center gap-2"
                >
                  <Search className="w-5 h-5" /> Find
                </button>
              </form>
            </div>
          </div>

          {/* Recent Sales Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" /> Recent Sales
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Invoice</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Customer</th>
                    <th className="px-6 py-4 font-semibold text-right">Amount</th>
                    <th className="px-6 py-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentSales?.map(sale => (
                    <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-700">{sale.invoiceNumber}</td>
                      <td className="px-6 py-4 text-slate-500">{format(sale.date, 'MMM dd, HH:mm')}</td>
                      <td className="px-6 py-4 text-slate-600">{sale.customerName || 'Walk-in'}</td>
                      <td className="px-6 py-4 text-right font-bold">₦{sale.finalAmount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => {
                            setSelectedSale(sale);
                            setReturnItems(sale.items.map(item => ({ ...item, returnQty: 0, restockStatus: 'RESTOCK' })));
                            setActiveStep('process');
                          }}
                          className="text-indigo-600 font-bold hover:underline flex items-center gap-1 justify-end"
                        >
                          Select <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeStep === 'process' && selectedSale && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right duration-300">
          {/* Item Selection */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between">
                <h3 className="font-bold text-slate-800">Items in Invoice {selectedSale.invoiceNumber}</h3>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{format(selectedSale.date, 'dd MMM yyyy')}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {returnItems.map((item, idx) => (
                  <div key={idx} className="p-4 flex items-center gap-4 hover:bg-slate-50/50">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Package className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800">{item.productName}</h4>
                      <p className="text-xs text-slate-500">Bought {item.quantity} @ ₦{item.price.toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400">Return Qty:</span>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          className="w-16 bg-white border border-slate-200 rounded p-1 text-center font-bold text-sm"
                          value={item.returnQty}
                          onChange={e => {
                            const val = Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0));
                            const newItems = [...returnItems];
                            newItems[idx].returnQty = val;
                            setReturnItems(newItems);
                          }}
                        />
                      </div>
                      <select 
                        className="text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                        value={item.restockStatus}
                        onChange={e => {
                          const newItems = [...returnItems];
                          newItems[idx].restockStatus = e.target.value;
                          setReturnItems(newItems);
                        }}
                      >
                        <option value="RESTOCK">Restock</option>
                        <option value="DAMAGED">Damaged/No Restock</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Refund Summary */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" /> Refund Summary
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Returning Items:</span>
                  <span className="font-bold text-slate-800">{returnItems.reduce((sum, i) => sum + i.returnQty, 0)} units</span>
                </div>
                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="font-medium text-slate-600">Total Refund:</span>
                  <span className="text-xl font-black text-indigo-600">
                    ₦{returnItems.reduce((sum, i) => sum + (i.price * i.returnQty), 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Reason for Return</label>
                  <textarea
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 h-24"
                    placeholder="e.g. Expired, wrong item, customer change of mind..."
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Refund Method</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none font-bold"
                    value={returnPaymentMethod}
                    onChange={e => setReturnPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    <option value={PaymentMethod.CASH}>Cash Refund</option>
                    <option value={PaymentMethod.TRANSFER}>Bank Transfer</option>
                    <option value={PaymentMethod.CREDIT}>Credit Store (Debt Deduction)</option>
                  </select>
                </div>

                <button
                  disabled={isProcessing || returnItems.reduce((sum, i) => sum + i.returnQty, 0) === 0}
                  onClick={handleProcessReturn}
                  className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-900 transition-all disabled:opacity-50"
                >
                  {isProcessing ? 'Processing...' : (
                    <>Process Return <CheckCircle2 className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </div>
            
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                Note: Restocking items will automatically increase inventory counts for the specific batches selected. Damaged items will be logged but not restocked.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeStep === 'receipt' && completedReturn && (
        <div className="max-w-md mx-auto animate-in zoom-in duration-300">
          <ReturnReceiptDisplay returnData={completedReturn} onDone={() => setActiveStep('search')} />
        </div>
      )}
    </div>
  );
};

export default Returns;
