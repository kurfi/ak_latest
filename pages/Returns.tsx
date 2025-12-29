
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../db/db';
import { Sale, SaleItem, ReturnedItem, PaymentMethod, Product, Customer, ReturnReason } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Search, 
  RotateCcw, 
  ChevronRight, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft,
  Calendar,
  User,
  CreditCard,
  History,
  Clock,
  Package,
  Plus,
  Minus,
  RefreshCcw,
  Check,
  Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ReturnAnalytics from '../components/ReturnAnalytics';
import ReturnReceiptDisplay from '../components/ReturnReceiptDisplay';

const Returns: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [originalSale, setOriginalSale] = useState<Sale | null>(null);
  const [returnableItems, setReturnableItems] = useState<(SaleItem & { returnedQuantity: number; restockStatus: 'restocked' | 'damaged'; reason: ReturnReason | string })[]>([]);
  const [step, setStep] = useState(1);
  const [totalRefundAmount, setTotalRefundAmount] = useState(0);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedReturnId, setProcessedReturnId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const returnReceiptRef = React.useRef<HTMLDivElement>(null);

  const handleSearchSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      showToast('Enter a sale ID or customer name', 'error');
      return;
    }
    try {
      let sale: Sale | undefined;

      // Try searching by Sale ID
      const id = parseInt(searchQuery);
      if (!isNaN(id)) {
        sale = await db.sales.get(id);
      }
      
      // If not found, try by customer name (partial match)
      if (!sale) {
          const salesByCustomer = await db.sales
              .where('customerName').startsWithIgnoreCase(searchQuery)
              .sortBy('date');
          // For simplicity, take the latest sale. In a real app, you might show a list.
          if (salesByCustomer.length > 0) sale = salesByCustomer[salesByCustomer.length - 1];
      }
      
      if (sale) {
        setOriginalSale(sale);
        setReturnableItems(
          sale.items.map((item) => ({
            ...item,
            returnedQuantity: 0, // This is the quantity the user WANTS to return in THIS transaction
            restockStatus: 'damaged', // Default to damaged to force selection
            reason: ReturnReason.OTHER, // Default to other reason
            // The item.returnedQuantity from originalSale.items will be used to calculate maxReturnable
          }))
        );
        setTotalRefundAmount(0);
        setStep(2); // Advance to Select Items step
        showToast(`Sale #${sale.id} found.`, 'success');
      } else {
        setOriginalSale(null);
        setReturnableItems([]);
        setStep(1); // Stay on search step
        showToast('Sale not found', 'error');
      }
    } catch (error) {
      console.error('Error fetching sale:', error);
      showToast('Error searching for sale', 'error');
    }
  };

  const updateItemReturnQty = (productId: number, qty: number) => {
    setReturnableItems((items) =>
      items.map((item) => {
        if (item.productId === productId) {
          // Max returnable = Sold Qty - Previously Returned Qty
          const previouslyReturned = item.returnedQuantity || 0;
          const maxReturnable = item.quantity; // item.quantity is the total sold in that sale.
          // Wait, actually, item.returnedQuantity in originalSale.items tracks what was returned ALREADY.
          // Let's re-examine handleSearchSale logic for returnableItems
          
          const newQty = Math.max(0, Math.min(qty, maxReturnable));
          return { ...item, returnedQuantity: newQty };
        }
        return item;
      })
    );
  };

  const updateItemStatus = (productId: number, status: 'restocked' | 'damaged') => {
    setReturnableItems((items) =>
      items.map((item) => (item.productId === productId ? { ...item, restockStatus: status } : item))
    );
  };

  const updateItemReason = (productId: number, reason: string) => {
    setReturnableItems((items) =>
      items.map((item) => (item.productId === productId ? { ...item, reason: reason } : item))
    );
  };

  // Calculate total refund whenever items change
  useMemo(() => {
    const total = returnableItems.reduce((sum, item) => sum + item.returnedQuantity * item.price, 0);
    setTotalRefundAmount(total);
  }, [returnableItems]);

  const handleReturnAllItems = () => {
    setReturnableItems((items) =>
      items.map((item) => ({ ...item, returnedQuantity: item.quantity, restockStatus: 'restocked' }))
    );
  };

  const handleProcessReturn = async () => {
    if (!originalSale) return;
    const itemsToReturn = returnableItems.filter((item) => item.returnedQuantity > 0);

    if (itemsToReturn.length === 0) {
      showToast('Select at least one item to return', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      await db.transaction('rw', [db.returns, db.returnedItems, db.sales, db.batches, db.customers, db.auditLogs], async () => {
        // 1. Create Return Master Record
        const returnId = await db.returns.add({
          saleId: originalSale.id!,
          customerId: originalSale.customerId,
          customerName: originalSale.customerName,
          staffId: currentUser?.id,
          returnDate: new Date(),
          totalRefundAmount: totalRefundAmount,
          reason: ReturnReason.OTHER, // Could be aggregate reason
          paymentMethod: refundMethod,
          notes: `Return for Sale #${originalSale.id}`
        });

        // 2. Process each returned item
        for (const item of itemsToReturn) {
          // a. Record returned item
          await db.returnedItems.add({
            returnId: returnId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.returnedQuantity,
            price: item.price,
            refundAmount: item.returnedQuantity * item.price,
            restockStatus: item.restockStatus,
            valueLost: item.restockStatus === 'damaged' ? item.returnedQuantity * item.price : 0,
            batchId: item.batchId
          });

          // b. Update stock if restocked (to the same batch if possible)
          if (item.restockStatus === 'restocked') {
            if (item.batchId) {
              const batch = await db.batches.get(item.batchId);
              if (batch) {
                await db.batches.update(item.batchId, { quantity: batch.quantity + item.returnedQuantity });
              }
            } else {
              // Fallback: add to the newest batch for that product
              const newestBatch = await db.batches.where('productId').equals(item.productId).reverse().first();
              if (newestBatch) {
                await db.batches.update(newestBatch.id!, { quantity: newestBatch.quantity + item.returnedQuantity });
              }
            }
          }

          // c. Update the original sale items to track returned quantity (denormalized for convenience)
          const updatedSaleItems = originalSale.items.map(saleItem => {
            if (saleItem.productId === item.productId) {
              const currentReturned = saleItem.returnedQuantity || 0;
              return { ...saleItem, returnedQuantity: currentReturned + item.returnedQuantity };
            }
            return saleItem;
          });
          await db.sales.update(originalSale.id!, { items: updatedSaleItems });
        }

        // 3. Handle Debt Adjustment if original sale was on Credit
        if (originalSale.paymentMethod === PaymentMethod.CREDIT && originalSale.customerId) {
          const customer = await db.customers.get(originalSale.customerId);
          if (customer) {
            const amountToDeduct = Math.min(customer.currentDebt, totalRefundAmount);
            await db.customers.update(customer.id!, { currentDebt: customer.currentDebt - amountToDeduct });
          }
        }

        // 4. Log Audit
        await db.auditLogs.add({
          action: 'RETURN_PROCESSED',
          details: `Processed return #${returnId} for Sale #${originalSale.id}. Refund: ₦${totalRefundAmount}`,
          user: currentUser?.username || 'Unknown',
          timestamp: new Date()
        });

        setProcessedReturnId(returnId);
      });

      setStep(3); // Success/Receipt step
      showToast('Return processed successfully', 'success');
    } catch (error) {
      console.error('Return processing failed:', error);
      showToast('Failed to process return', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetProcess = () => {
    setOriginalSale(null);
    setReturnableItems([]);
    setTotalRefundAmount(0);
    setSearchQuery('');
    setStep(1);
    setProcessedReturnId(null);
  };

  // Recent Returns Query
  const recentReturns = useLiveQuery(() => 
    db.returns.orderBy('returnDate').reverse().limit(10).toArray()
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Returns & Refunds</h1>
          <p className="text-xs md:text-sm text-slate-500">Process product returns and manage refunds</p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full md:w-auto px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center justify-center gap-2"
        >
          {showHistory ? <Plus className="w-4 h-4" /> : <History className="w-4 h-4" />}
          {showHistory ? 'Process New Return' : 'View Return History'}
        </button>
      </div>

      {showHistory ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
          <div className="lg:col-span-2 space-y-6">
            <ReturnAnalytics />
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider text-xs">
                  <RotateCcw className="w-4 h-4 text-orange-500" /> Recent Returns
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-black">
                    <tr>
                      <th className="p-4">ID</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Customer</th>
                      <th className="p-4">Refund</th>
                      <th className="p-4">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentReturns?.map(ret => (
                      <tr key={ret.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-mono text-xs text-slate-400">#{ret.id}</td>
                        <td className="p-4 text-slate-600 whitespace-nowrap">{format(ret.returnDate, 'MMM dd, HH:mm')}</td>
                        <td className="p-4 font-bold text-slate-700 truncate max-w-[150px]">{ret.customerName}</td>
                        <td className="p-4 font-black text-red-600">₦{ret.totalRefundAmount.toLocaleString()}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 border border-slate-200">{ret.paymentMethod}</span>
                        </td>
                      </tr>
                    ))}
                    {recentReturns?.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No returns found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
             <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm"><Receipt className="w-6 h-6" /></div>
                  <h3 className="text-lg font-bold">Policy Reminder</h3>
                </div>
                <ul className="space-y-3 text-indigo-100 text-sm">
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-300" /> Verify receipt ID before processing</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-300" /> Inspect items for damage carefully</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-300" /> Restocked items go back to inventory</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-300" /> Damaged items are logged as loss</li>
                </ul>
             </div>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          {/* Step indicator */}
          <div className="flex items-center justify-between px-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= s ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}>
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider hidden sm:block ${step === s ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {s === 1 ? 'Search' : s === 2 ? 'Select Items' : 'Complete'}
                </span>
                {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-indigo-600' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Search Sale */}
          {step === 1 && (
            <div className="bg-white p-6 md:p-10 rounded-2xl shadow-xl border border-slate-100 text-center space-y-6">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-indigo-50/50">
                <Search className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-800">Find Original Sale</h2>
                <p className="text-slate-500">Enter the Sale ID or Customer Name from the receipt</p>
              </div>
              <form onSubmit={handleSearchSale} className="max-w-md mx-auto flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 1045 or John Doe..."
                  className="flex-1 p-4 rounded-xl bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 outline-none transition-all font-bold text-lg"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="p-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center"
                >
                  <ArrowRight className="w-6 h-6" />
                </button>
              </form>
            </div>
          )}

          {/* Step 2: Select Items */}
          {step === 2 && originalSale && (
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-base md:text-lg font-semibold text-slate-700 mb-3 md:mb-4">Select Items for Return</h2>

              {/* Sale Info Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6 text-xs md:text-sm text-slate-700 bg-slate-50 p-3 md:p-4 rounded-lg">
                <div>
                  <p><strong>Sale ID:</strong> #{originalSale.id}</p>
                  <p><strong>Date:</strong> {format(originalSale.date, 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <p className="truncate"><strong>Customer:</strong> {originalSale.customerName || 'Walk-in'}</p>
                  <p><strong>Method:</strong> {originalSale.paymentMethod}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-base md:text-lg font-bold text-indigo-600"><strong>Total:</strong> ₦{originalSale.finalAmount.toLocaleString()}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleReturnAllItems}
                  className="flex-1 md:flex-none px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Return All
                </button>
                <button
                  onClick={resetProcess}
                  className="px-3 py-2 text-slate-500 hover:text-slate-700 text-xs font-bold uppercase"
                >
                  Cancel
                </button>
              </div>

              {/* Item Selection List */}
              <div className="space-y-3 md:space-y-4 max-h-[40vh] overflow-y-auto pr-2 mb-6">
                {returnableItems.map((item) => (
                  <div key={item.productId} className="flex flex-col md:flex-row md:items-center gap-3 p-3 md:p-4 border rounded-xl hover:border-indigo-300 transition-colors">
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800 text-sm uppercase">{item.productName}</h4>
                      <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                        Sold: {item.quantity} units @ ₦{item.price.toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Quantity Controls */}
                      <div className="flex items-center bg-slate-100 rounded-lg p-1 border">
                        <button onClick={() => updateItemReturnQty(item.productId, item.returnedQuantity - 1)} className="p-1 hover:bg-white hover:text-red-500 rounded text-slate-400"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="w-10 text-center text-sm font-black">{item.returnedQuantity}</span>
                        <button onClick={() => updateItemReturnQty(item.productId, item.returnedQuantity + 1)} className="p-1 hover:bg-white hover:text-indigo-600 rounded text-slate-400"><Plus className="w-3.5 h-3.5" /></button>
                      </div>

                      {/* Status Selector */}
                      <div className="flex p-1 bg-slate-100 rounded-lg">
                        <button
                          onClick={() => updateItemStatus(item.productId, 'restocked')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${item.restockStatus === 'restocked' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Restock
                        </button>
                        <button
                          onClick={() => updateItemStatus(item.productId, 'damaged')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${item.restockStatus === 'damaged' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Damaged
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Refund Footer */}
              <div className="border-t pt-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div className="w-full md:w-64 space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Refund Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setRefundMethod(PaymentMethod.CASH)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${refundMethod === PaymentMethod.CASH ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Cash</button>
                      <button onClick={() => setRefundMethod(PaymentMethod.TRANSFER)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${refundMethod === PaymentMethod.TRANSFER ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Transfer</button>
                    </div>
                  </div>

                  <div className="w-full md:text-right space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Refund Amount</p>
                    <p className="text-3xl font-black text-red-600">₦{totalRefundAmount.toLocaleString()}</p>
                    <button
                      onClick={handleProcessReturn}
                      disabled={isProcessing || totalRefundAmount <= 0}
                      className="mt-4 w-full md:w-auto px-10 py-4 bg-red-600 text-white rounded-xl font-black shadow-xl shadow-red-100 hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                    >
                      {isProcessing ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                      Process Refund
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Success & Receipt */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl border border-slate-100 text-center">
                <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50/50">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-black text-slate-800 mb-2">Refund Successful!</h2>
                <p className="text-slate-500 mb-8">The return has been processed and stock records updated.</p>
                
                <div className="flex flex-col sm:flex-row justify-center gap-3 no-print">
                  <button onClick={() => window.print()} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all"><Receipt className="w-5 h-5" /> Print Receipt</button>
                  <button onClick={resetProcess} className="px-8 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">New Return</button>
                </div>
              </div>

              {/* Receipt Preview */}
              <div className="max-w-md mx-auto">
                <ReturnReceiptDisplay
                  ref={returnReceiptRef}
                  originalSale={originalSale!}
                  returnItems={returnableItems}
                  totalRefundAmount={totalRefundAmount}
                  returnReason="Standard Return"
                  refundMethod={refundMethod}
                  customer={null}
                  cashierUsername={currentUser?.username || 'Unknown'}
                  returnDate={new Date()}
                  returnId={processedReturnId}
                  paperSize={paperSize}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Returns;