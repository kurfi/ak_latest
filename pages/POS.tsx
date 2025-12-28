import React, { useState } from 'react';
import { db } from '../db/db';
import { Customer, Product, Batch, Sale, SaleStatus, PaymentMethod } from '../types';
import { 
  ShoppingCart, 
  Search, 
  User, 
  Trash2, 
  ChevronRight, 
  Package, 
  CreditCard, 
  History,
  AlertCircle,
  CheckCircle2,
  X,
  Plus,
  Minus,
  ArrowRight,
  Eye,
  Printer
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PrintReceipt } from '../components/PrintReceipt';

interface CartItem extends Product {
  cartId: string;
  selectedBatchId: number;
  selectedBatchNumber: string;
  quantity: number;
  stock: number;
}

export const POSPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  
  // Data queries
  const products = useLiveQuery(() => db.products.toArray());
  const batches = useLiveQuery(() => db.batches.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());
  const recentSales = useLiveQuery(() => db.sales.orderBy('date').reverse().limit(10).toArray());

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<{method: PaymentMethod, amount: number}[]>([
    { method: PaymentMethod.CASH, amount: 0 }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  // Computed values
  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode?.includes(searchTerm)
  );

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const finalAmount = Math.max(0, subtotal - discount);
  const totalPaid = paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
  const balance = finalAmount - totalPaid;

  const addToCart = (product: Product) => {
    const productBatches = batches?.filter(b => b.productId === product.id && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    if (!productBatches || productBatches.length === 0) {
      showToast('No stock available for this product.', 'error');
      return;
    }

    const batch = productBatches[0];
    const existingItem = cart.find(item => item.id === product.id && item.selectedBatchId === batch.id);

    if (existingItem) {
      if (existingItem.quantity + 1 > batch.quantity) {
        showToast('Cannot exceed available batch stock.', 'error');
        return;
      }
      setCart(cart.map(item => 
        item.cartId === existingItem.cartId 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        ...product,
        cartId: `${product.id}-${batch.id}`,
        selectedBatchId: batch.id!,
        selectedBatchNumber: batch.batchNumber,
        quantity: 1,
        stock: batch.quantity
      }]);
    }
  };

  const removeFromCart = (cartId: string) => {
    setCart(cart.filter(item => item.cartId !== cartId));
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.cartId === cartId) {
        const newQty = Math.max(1, Math.min(item.quantity + delta, item.stock));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    if (balance > 0 && !selectedCustomerId) {
      showToast('Customer selection required for credit sales.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const sale: Omit<Sale, 'id'> = {
        date: new Date(),
        customerId: selectedCustomerId,
        customerName: customers?.find(c => c.id === selectedCustomerId)?.name || 'Walk-in Customer',
        items: cart.map(item => ({
          productId: item.id!,
          productName: item.name,
          batchId: item.selectedBatchId,
          batchNumber: item.selectedBatchNumber,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity
        })),
        totalAmount: subtotal,
        discount,
        finalAmount,
        paymentMethod: paymentMethods.length > 1 ? PaymentMethod.MULTIPLE : paymentMethods[0].method,
        paymentMethods: paymentMethods.filter(pm => pm.amount > 0),
        status: balance <= 0 ? SaleStatus.PAID : SaleStatus.PARTIAL,
        invoiceNumber: `INV-${Date.now()}`
      };

      const saleId = await db.sales.add(sale as Sale);
      
      // Update Batch Stocks
      for (const item of cart) {
        const batch = await db.batches.get(item.selectedBatchId);
        if (batch) {
          await db.batches.update(item.selectedBatchId, {
            quantity: batch.quantity - item.quantity
          });
        }
      }

      // Update Customer Debt
      if (balance > 0 && selectedCustomerId) {
        const customer = await db.customers.get(selectedCustomerId);
        if (customer) {
          await db.customers.update(selectedCustomerId, {
            currentDebt: (customer.currentDebt || 0) + balance
          });
        }
      }

      const completedSale = { ...sale, id: saleId } as Sale;
      setReceiptSale(completedSale);
      setShowReceipt(true);
      
      // Reset POS
      setCart([]);
      setDiscount(0);
      setSelectedCustomerId(undefined);
      setPaymentMethods([{ method: PaymentMethod.CASH, amount: 0 }]);
      showToast('Sale completed successfully!', 'success');

    } catch (error) {
      console.error(error);
      showToast('Failed to complete sale.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-6">
      {/* Left: Product Selection */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
          <Search className="text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search products by name or barcode..."
            className="flex-1 outline-none text-slate-800"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {filteredProducts?.map(product => {
            const stock = batches?.filter(b => b.productId === product.id)
              .reduce((sum, b) => sum + b.quantity, 0) || 0;
            
            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={stock === 0}
                className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                    <Package className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    stock > 10 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {stock} in stock
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 mb-1 line-clamp-1">{product.name}</h3>
                <p className="text-indigo-600 font-bold">₦{product.price.toLocaleString()}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Cart & Checkout */}
      <div className="w-[400px] flex flex-col gap-4">
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Current Sale
            </h2>
            <button 
              onClick={() => setCart([])}
              className="text-xs text-red-600 hover:underline font-medium"
            >
              Clear Cart
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <ShoppingCart className="w-8 h-8 opacity-20" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.cartId} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{item.name}</h4>
                    <p className="text-xs text-slate-500">Batch: {item.selectedBatchNumber}</p>
                    <p className="text-sm font-bold text-indigo-600 mt-1">
                      ₦{(item.price * item.quantity).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => updateQuantity(item.cartId, -1)}
                      className="p-1 hover:bg-white rounded-md border border-slate-200"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.cartId, 1)}
                      className="p-1 hover:bg-white rounded-md border border-slate-200"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => removeFromCart(item.cartId)}
                      className="ml-2 p-1 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => setSelectedCustomerId(Number(e.target.value) || undefined)}
                className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none"
              >
                <option value="">Walk-in Customer</option>
                {customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.currentDebt > 0 ? `(Debt: ₦${c.currentDebt})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span>₦{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Discount</span>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-20 text-right bg-white border border-slate-200 rounded p-1 outline-none text-indigo-600 font-bold"
                />
              </div>
              <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total</span>
                <span className="text-indigo-600">₦{finalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Details</label>
              {paymentMethods.map((pm, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={pm.method}
                    onChange={(e) => {
                      const newMethods = [...paymentMethods];
                      newMethods[idx].method = e.target.value as PaymentMethod;
                      setPaymentMethods(newMethods);
                    }}
                    className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none"
                  >
                    {Object.values(PaymentMethod).filter(m => m !== PaymentMethod.MULTIPLE).map(method => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={pm.amount}
                    onChange={(e) => {
                      const newMethods = [...paymentMethods];
                      newMethods[idx].amount = Number(e.target.value);
                      setPaymentMethods(newMethods);
                    }}
                    className="w-24 bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none text-right font-bold"
                    placeholder="Amount"
                  />
                  {paymentMethods.length > 1 && (
                    <button 
                      onClick={() => setPaymentMethods(paymentMethods.filter((_, i) => i !== idx))}
                      className="p-2 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button 
                onClick={() => setPaymentMethods([...paymentMethods, { method: PaymentMethod.CASH, amount: 0 }])}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                + Add Payment Method
              </button>
            </div>

            <div className={`p-3 rounded-lg text-sm font-bold flex items-center justify-between ${
              balance > 0 ? 'bg-amber-50 text-amber-700' : balance < 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-green-50 text-green-700'
            }`}>
              <span>{balance > 0 ? 'Remaining Balance:' : balance < 0 ? 'Change to Return:' : 'Payment Status:'}</span>
              <span>{balance === 0 ? 'Fully Paid' : `₦${Math.abs(balance).toLocaleString()}`}</span>
            </div>

            <button
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || isProcessing}
              className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-900 transition-all disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : (
                <>Complete Sale <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Receipt View Modal */}
      {showReceipt && receiptSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Sale Successful</h2>
                  <p className="text-slate-500 text-sm">Invoice {receiptSale.invoiceNumber}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReceipt(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Receipt Content - We'll use the component here */}
            <div className="max-h-[60vh] overflow-y-auto mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <PrintReceipt sale={receiptSale} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => {
                  const content = document.getElementById('receipt-content');
                  if (content) {
                    const printWindow = window.open('', '', 'width=800,height=600');
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Print Receipt</title>
                            <style>
                              body { font-family: monospace; padding: 20px; }
                              @media print { body { padding: 0; } }
                            </style>
                          </head>
                          <body>${content.innerHTML}</body>
                        </html>
                      `);
                      printWindow.document.close();
                      printWindow.focus();
                      printWindow.print();
                      printWindow.close();
                    }
                  }
                }}
                className="flex items-center justify-center gap-2 py-3 border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Printer className="w-5 h-5" /> Print
              </button>
              <button 
                onClick={() => setShowReceipt(false)}
                className="py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
