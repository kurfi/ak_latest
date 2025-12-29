
import React, { useState, useEffect, useRef } from 'react';
import { db, logAudit } from '../db/db';
import { Product, Sale, Customer, PaymentMethod, HeldSale, UserRole } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
    Search, 
    ShoppingCart, 
    Plus, 
    Minus, 
    Trash2, 
    X, 
    User, 
    CreditCard, 
    Banknote, 
    Smartphone, 
    FileText, 
    History, 
    Clock, 
    Receipt, 
    PauseCircle, 
    RotateCcw,
    Layers,
    Tag,
    ChevronRight,
    ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { generateReceiptBuffer } from '../services/printerService';
import { generateAndSavePdfFromHtml } from '../services/pdfService';
import { saveElementAsImage } from '../services/fileDialogService';

const POS: React.FC = () => {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'cart' | 'history' | 'held'>('cart');
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [discount, setDiscount] = useState<number>(0);
    const [isMultipayOpen, setIsMultipayOpen] = useState(false);
    const [multipayEntries, setMultipayEntries] = useState<{ method: PaymentMethod; amount: string }[]>([]);
    const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
    const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
    const receiptRef = useRef<HTMLDivElement>(null);

    // Live Queries
    const products = useLiveQuery(() => db.products.toArray());
    const batches = useLiveQuery(() => db.batches.toArray());
    const customers = useLiveQuery(() => 
        customerSearch 
            ? db.customers.where('name').startsWithIgnoreCase(customerSearch).toArray()
            : db.customers.limit(5).toArray()
    , [customerSearch]);

    const recentSales = useLiveQuery(() => 
        historySearchQuery
            ? db.sales.where('customerName').startsWithIgnoreCase(historySearchQuery).reverse().toArray()
            : db.sales.orderBy('date').reverse().limit(10).toArray()
    , [historySearchQuery]);

    const heldSales = useLiveQuery(() => db.heldSales.toArray());

    const productsWithStock = products?.map(product => {
        const productBatches = batches?.filter(b => b.productId === product.id) || [];
        const now = new Date();
        const validBatches = productBatches.filter(b => new Date(b.expiryDate) > now);
        const validStock = validBatches.reduce((acc, b) => acc + b.quantity, 0);
        return {
            ...product,
            validStock,
            isOutOfStock: validStock <= 0,
            hasExpiredStock: productBatches.some(b => new Date(b.expiryDate) <= now && b.quantity > 0)
        };
    }).filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode === searchQuery);

    const addToCart = (product: any) => {
        if (product.validStock <= 0) {
            showToast(`Product ${product.name} is out of stock!`, 'error');
            return;
        }

        const existingItem = cart.find(item => item.product.id === product.id);
        if (existingItem) {
            if (existingItem.quantity >= product.validStock) {
                showToast(`Cannot add more. Only ${product.validStock} available.`, 'error');
                return;
            }
            setCart(cart.map(item =>
                item.product.id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            ));
        } else {
            setCart([...cart, { product, quantity: 1 }]);
        }
        setIsCartOpen(true);
    };

    const updateQuantity = (productId: number, delta: number) => {
        const item = cart.find(i => i.product.id === productId);
        if (!item) return;

        const productWithStock = productsWithStock?.find(p => p.id === productId);
        const maxStock = productWithStock?.validStock || 0;

        const newQty = item.quantity + delta;
        if (newQty <= 0) {
            setCart(cart.filter(i => i.product.id !== productId));
        } else if (newQty > maxStock) {
            showToast(`Only ${maxStock} available in stock.`, 'error');
        } else {
            setCart(cart.map(i => i.product.id === productId ? { ...i, quantity: newQty } : i));
        }
    };

    const calculateTotal = () => cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

    const handleHoldSale = async () => {
        if (cart.length === 0) return;
        try {
            await db.heldSales.add({
                date: new Date(),
                items: cart.map(i => ({
                    productId: i.product.id!,
                    productName: i.product.name,
                    quantity: i.quantity,
                    price: i.product.price,
                    total: i.product.price * i.quantity
                })),
                totalAmount: calculateTotal(),
                discount: discount,
                finalAmount: calculateTotal() - discount,
                customerName: selectedCustomer?.name || 'Walk-in Customer',
                customerId: selectedCustomer?.id
            });
            setCart([]);
            setDiscount(0);
            setSelectedCustomer(null);
            showToast('Sale held successfully', 'success');
        } catch (error) {
            showToast('Failed to hold sale', 'error');
        }
    };

    const handleResumeSale = (heldSale: HeldSale) => {
        const resumedCart = heldSale.items.map(item => {
            const product = products?.find(p => p.id === item.productId);
            return {
                product: product || { id: item.productId, name: item.productName, price: item.price, barcode: '', category: '', minStockLevel: 0 },
                quantity: item.quantity
            };
        });
        setCart(resumedCart as any);
        setDiscount(heldSale.discount || 0);
        if (heldSale.customerId) {
            db.customers.get(heldSale.customerId).then(c => setSelectedCustomer(c || null));
        }
        db.heldSales.delete(heldSale.id!);
        setActiveTab('cart');
        setIsCartOpen(true);
    };

    const handleCheckout = async (method: PaymentMethod, multipayData?: any[]) => {
        const finalAmount = calculateTotal() - discount;

        if (method === PaymentMethod.CREDIT && !selectedCustomer) {
            showToast('Please select a customer for credit sales.', 'error');
            return;
        }

        if (method === PaymentMethod.CREDIT && selectedCustomer) {
            const currentDebt = selectedCustomer.currentDebt || 0;
            const limit = selectedCustomer.creditLimit || 0;
            if (limit > 0 && (currentDebt + finalAmount) > limit) {
                showToast(`Credit limit exceeded! Limit: ₦${limit}`, 'error');
                return;
            }
        }

        try {
            let saleId: number | undefined;

            await db.transaction('rw', [db.sales, db.batches, db.customers, db.auditLogs], async () => {
                // 1. Record Sale
                saleId = await db.sales.add({
                    date: new Date(),
                    items: cart.map(i => ({
                        productId: i.product.id!,
                        productName: i.product.name,
                        quantity: i.quantity,
                        price: i.product.price,
                        total: i.product.price * i.quantity
                    })),
                    totalAmount: calculateTotal(),
                    discount: discount,
                    finalAmount: finalAmount,
                    paymentMethod: method,
                    paymentMethods: multipayData,
                    customerName: selectedCustomer?.name || 'Walk-in Customer',
                    customerId: selectedCustomer?.id,
                    status: 'completed'
                });

                // 2. Update Stock (FIFO)
                for (const item of cart) {
                    let remainingToDeduct = item.quantity;
                    const productBatches = await db.batches
                        .where('productId')
                        .equals(item.product.id!)
                        .toArray();
                    
                    // Sort batches by expiry date (FIFO for medicine)
                    const sortedBatches = productBatches.sort((a, b) => 
                        new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
                    );

                    for (const batch of sortedBatches) {
                        if (remainingToDeduct <= 0) break;
                        
                        const deduct = Math.min(batch.quantity, remainingToDeduct);
                        await db.batches.update(batch.id!, {
                            quantity: batch.quantity - deduct
                        });
                        remainingToDeduct -= deduct;
                    }
                }

                // 3. Debt Update
                if (method === PaymentMethod.CREDIT && selectedCustomer?.id) {
                    const currentDebt = selectedCustomer.currentDebt || 0;
                    await db.customers.update(selectedCustomer.id, { currentDebt: currentDebt + finalAmount });
                }
            });

            if (saleId) {
                const sale = await db.sales.get(saleId);
                setReceiptSale(sale || null);

                await logAudit(
                    'SALE_COMPLETED',
                    `Sale #${saleId} completed. Amount: ₦${finalAmount}`,
                    currentUser?.username || 'Unknown'
                );
            }

            setCart([]);
            setDiscount(0);
            setIsPaymentModalOpen(false);
            setSelectedCustomer(null);
            setIsCartOpen(false);
            setIsMultipayOpen(false);
            setMultipayEntries([]);
        } catch (error: any) {
            console.error(error);
            showToast(error.message || 'Transaction failed.', 'error');
        }
    };

    const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-theme(spacing.24))] lg:h-[calc(100vh-theme(spacing.16))] gap-4 relative">

            {/* LEFT: Product Catalog */}
            <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden no-print">
                <div className="p-3 md:p-4 border-b border-slate-200 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            className="w-full pl-10 pr-4 py-2 md:py-3 rounded-lg bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm md:text-base"
                            placeholder="Scan barcode or search product..."
                            autoFocus
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-50">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                        {productsWithStock?.map(product => {
                            const isDisabled = product.isOutOfStock;
                            const statusLabel = product.isOutOfStock ? (product.hasExpiredStock ? 'Expired' : 'Out') : null;

                            return (
                                <div
                                    key={product.id}
                                    onClick={() => !isDisabled && addToCart(product)}
                                    className={`bg-white p-3 md:p-4 rounded-xl border shadow-sm transition-all duration-200 group flex flex-col justify-between h-[130px] md:h-40 ${isDisabled
                                        ? 'opacity-60 grayscale cursor-not-allowed border-slate-200'
                                        : 'hover:shadow-md hover:border-emerald-400 hover:-translate-y-0.5 active:scale-95 cursor-pointer border-slate-200'
                                        }`}
                                >
                                    <div className="min-w-0">
                                        <div className="flex justify-between items-start gap-1">
                                            <h3 className="font-bold text-slate-800 line-clamp-2 text-[11px] md:text-sm leading-tight uppercase tracking-tight">{product.name}</h3>
                                            {statusLabel && (
                                                <span className={`text-[8px] md:text-[9px] px-1 md:px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${product.hasExpiredStock ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
                                                    }`}>
                                                    {statusLabel}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[9px] md:text-xs text-slate-400 mt-0.5 truncate font-medium">{product.category}</p>
                                        <div className="mt-1 md:mt-2 flex items-center gap-1">
                                            <Layers className="w-2.5 h-2.5 md:w-3 md:h-3 text-slate-400" />
                                            <span className={`text-[9px] md:text-xs font-bold ${product.validStock <= product.minStockLevel ? 'text-amber-600' : 'text-slate-500'}`}>
                                                Qty: {product.validStock}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end mt-1">
                                        <span className="font-black text-emerald-600 text-xs md:text-base">₦{product.price.toLocaleString()}</span>
                                        <div className={`p-1 md:p-1.5 rounded-lg transition-colors ${isDisabled
                                            ? 'bg-slate-50 text-slate-300'
                                            : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white'
                                            }`}>
                                            <Plus className="w-3 h-3 md:w-4 md:h-4" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Mobile Cart Overlay */}
            {isCartOpen && (
                <div className="fixed inset-0 bg-black/50 z-30 lg:hidden no-print" onClick={() => setIsCartOpen(false)} />
            )}

            {/* RIGHT: Cart & Navigation Panel */}
            <div className={`
            fixed inset-y-0 right-0 w-full sm:w-96 bg-white z-40 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col no-print
            lg:relative lg:transform-none lg:w-96 lg:shadow-sm lg:border lg:border-slate-200 lg:rounded-xl lg:z-0
            ${isCartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
                {/* Tabs Header */}
                <div className="flex border-b border-slate-200 bg-slate-50 lg:rounded-t-xl overflow-hidden">
                    <button onClick={() => setActiveTab('cart')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'cart' ? 'bg-white text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                        <ShoppingCart className="w-4 h-4" /> Sale
                    </button>
                    <button onClick={() => setActiveTab('held')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${activeTab === 'held' ? 'bg-white text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                        <PauseCircle className="w-4 h-4" /> Held
                        {(heldSales?.length || 0) > 0 && (
                            <span className="ml-1 bg-amber-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{heldSales?.length}</span>
                        )}
                    </button>
                    <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'history' ? 'bg-white text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                        <History className="w-4 h-4" /> History
                    </button>
                </div>

                {/* 1. CART VIEW */}
                {activeTab === 'cart' && (
                    <>
                        <div className="p-4 border-b border-slate-100 bg-white">
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                    placeholder="Select Customer (Optional)..."
                                    value={customerSearch}
                                    onChange={(e) => setCustomerSearch(e.target.value)}
                                />
                                {customerSearch && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                                        {customers?.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }}
                                                className="w-full p-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0 flex justify-between items-center group"
                                            >
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm group-hover:text-emerald-600">{c.name}</p>
                                                    <p className="text-xs text-slate-500">{c.phone}</p>
                                                </div>
                                                {c.currentDebt > 0 && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">₦{c.currentDebt.toLocaleString()} Debt</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {selectedCustomer && (
                                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-emerald-500 p-1 rounded-md"><User className="w-3 h-3 text-white" /></div>
                                        <span className="text-sm font-bold text-emerald-800">{selectedCustomer.name}</span>
                                    </div>
                                    <button onClick={() => setSelectedCustomer(null)} className="text-emerald-500 hover:text-emerald-700"><X className="w-4 h-4" /></button>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                            {cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 opacity-50">
                                    <ShoppingCart className="w-12 h-12" />
                                    <p className="text-sm font-medium">Cart is empty</p>
                                </div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.product.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex gap-3 group animate-in slide-in-from-right-2">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-slate-800 text-sm truncate uppercase">{item.product.name}</h4>
                                            <p className="text-xs text-emerald-600 font-bold mt-1">₦{(item.product.price * item.quantity).toLocaleString()}</p>
                                        </div>
                                        <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-100">
                                            <button onClick={() => updateQuantity(item.product.id!, -1)} className="p-1 hover:bg-white hover:text-red-500 rounded transition-colors text-slate-400"><Minus className="w-4 h-4" /></button>
                                            <span className="w-8 text-center text-sm font-black text-slate-700">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.product.id!, 1)} className="p-1 hover:bg-white hover:text-emerald-600 rounded transition-colors text-slate-400"><Plus className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 bg-white border-t border-slate-200 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Tag className="w-3 h-3" /> Discount</span>
                                    <input 
                                        type="number" 
                                        value={discount} 
                                        onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                                        className="w-24 p-1 text-right text-sm border-b border-slate-200 focus:border-emerald-500 outline-none font-bold"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-slate-900 font-black text-lg">TOTAL</span>
                                    <span className="text-2xl font-black text-emerald-600">₦{Math.max(0, calculateTotal() - discount).toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleHoldSale}
                                    disabled={cart.length === 0}
                                    className="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                >
                                    <PauseCircle className="w-4 h-4" /> Hold
                                </button>
                                <button
                                    onClick={() => setIsPaymentModalOpen(true)}
                                    disabled={cart.length === 0}
                                    className="py-3 bg-emerald-600 text-white rounded-xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                >
                                    Pay <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* 2. HISTORY VIEW */}
                {activeTab === 'history' && (
                    <div className="flex-1 overflow-y-auto bg-white">
                        <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                    placeholder="Search by Name or ID..."
                                    value={historySearchQuery}
                                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {recentSales && recentSales.length > 0 ? (
                                recentSales.map((sale) => (
                                    <div key={sale.id} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-slate-800">₦{sale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{sale.paymentMethod}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                            <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(sale.date, 'MMM dd, HH:mm')}</div>
                                            <div className="flex items-center gap-1"><User className="w-3 h-3" /> {sale.customerName}</div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-slate-50 flex justify-end">
                                            <button
                                                onClick={() => setReceiptSale(sale)}
                                                className="text-xs text-emerald-600 flex items-center gap-1 hover:underline"
                                            >
                                                <Receipt className="w-3 h-3" /> Receipt
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                                    <History className="w-8 h-8 opacity-20" />
                                    <p>No recent sales.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. HELD SALES VIEW */}
                {activeTab === 'held' && (
                    <div className="flex-1 overflow-y-auto bg-white">
                        <div className="divide-y divide-slate-100">
                            {heldSales && heldSales.length > 0 ? (
                                heldSales.map(sale => (
                                    <div key={sale.id} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-bold text-slate-800">₦{sale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                <p className="text-xs text-slate-500 mt-1">{format(sale.date, 'MMM dd, HH:mm')} • {sale.items.length} Items</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-slate-500 mb-2">{sale.customerName}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => handleResumeSale(sale)}
                                                className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-1"
                                            >
                                                <RotateCcw className="w-3 h-3" /> Resume
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('Discard this held sale?')) await db.sales.delete(sale.id!);
                                                }}
                                                className="py-1.5 px-3 bg-red-50 text-red-600 text-xs font-bold rounded border border-red-200 hover:bg-red-100"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                                    <PauseCircle className="w-8 h-8 opacity-20" />
                                    <p>No sales on hold.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile Cart Toggle FAB */}
            <button
                onClick={() => setIsCartOpen(true)}
                className="lg:hidden fixed bottom-6 right-6 w-16 h-16 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center z-30 hover:bg-emerald-700 transition-transform active:scale-95 border-4 border-slate-50 no-print"
            >
                <ShoppingCart className="w-7 h-7" />
                {cartItemCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full border-2 border-emerald-600 shadow-sm transform translate-x-1 -translate-y-1">
                        {cartItemCount}
                    </span>
                )}
            </button>

            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 md:p-4 no-print">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-4 md:p-6">
                        <div className="flex justify-between items-center mb-4 md:mb-6">
                            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Complete Payment</h2>
                            <button onClick={() => { setIsPaymentModalOpen(false); setIsMultipayOpen(false); setMultipayEntries([]); }} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="text-center mb-6 md:mb-8 bg-slate-50 p-4 rounded-xl">
                            <p className="text-slate-500 text-[10px] md:text-sm uppercase tracking-wide mb-1">Total Payable</p>
                            <p className="text-2xl md:text-4xl font-extrabold text-emerald-600">₦{Math.max(0, calculateTotal() - discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            {discount > 0 && (
                                <p className="text-xs md:text-sm text-slate-400 mt-1 line-through">₦{calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            )}
                        </div>

                        {!isMultipayOpen ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
                                <button onClick={() => handleCheckout(PaymentMethod.CASH)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-emerald-100 text-emerald-600 rounded-full group-hover:bg-emerald-200"><Banknote className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-emerald-700 text-sm md:text-base">Cash</span>
                                </button>
                                <button onClick={() => handleCheckout(PaymentMethod.CARD)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-blue-100 text-blue-600 rounded-full group-hover:bg-blue-200"><CreditCard className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-blue-700 text-sm md:text-base">POS / Card</span>
                                </button>
                                <button onClick={() => handleCheckout(PaymentMethod.TRANSFER)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-purple-50 hover:border-purple-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-purple-100 text-purple-600 rounded-full group-hover:bg-purple-200"><Smartphone className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-purple-700 text-sm md:text-base">Transfer</span>
                                </button>
                                <button onClick={() => setIsMultipayOpen(true)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-fuchsia-50 hover:border-fuchsia-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-fuchsia-100 text-fuchsia-600 rounded-full group-hover:bg-fuchsia-200"><Layers className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-fuchsia-700 text-sm md:text-base">Multipay</span>
                                </button>
                                <button onClick={() => handleCheckout(PaymentMethod.CREDIT)} disabled={!selectedCustomer} className={`group p-4 md:p-6 border border-slate-200 rounded-xl transition-all flex flex-col items-center gap-2 md:gap-3 ${!selectedCustomer ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-orange-50 hover:border-orange-500 hover:shadow-md cursor-pointer'}`}>
                                    <div className={`p-2 md:p-3 rounded-full ${!selectedCustomer ? 'bg-slate-200 text-slate-400' : 'bg-orange-100 text-orange-600 group-hover:bg-orange-200'}`}><FileText className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className={`font-bold text-sm md:text-base ${!selectedCustomer ? 'text-slate-400' : 'text-slate-700 group-hover:text-orange-700'}`}>Debt / Credit</span>
                                    {!selectedCustomer && <span className="text-[9px] md:text-[10px] text-red-400 -mt-1 md:-mt-2">(Select Customer)</span>}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const amount = (form.elements.namedItem('amount') as HTMLInputElement).value;
                                    const method = (form.elements.namedItem('method') as HTMLSelectElement).value as PaymentMethod;
                                    if (amount && parseFloat(amount) > 0) {
                                        setMultipayEntries([...multipayEntries, { method, amount }]);
                                        form.reset();
                                    }
                                }}>
                                    <div className="flex flex-col md:flex-row gap-2">
                                        <select name="method" className="flex-1 p-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                                            <option value={PaymentMethod.CASH}>Cash</option>
                                            <option value={PaymentMethod.CARD}>POS / Card</option>
                                            <option value={PaymentMethod.TRANSFER}>Transfer</option>
                                        </select>
                                        <div className="flex flex-1 gap-2">
                                            <input name="amount" type="number" step="0.01" placeholder="Amount" className="flex-1 p-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-full" />
                                            <button type="submit" className="p-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 shrink-0"><Plus className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                </form>
                                <div className="space-y-2">
                                    {multipayEntries?.map((entry, index) => (
                                        <div key={index} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                                            <span className="text-xs md:text-sm font-medium">{entry.method}: <span className="text-emerald-600">₦{parseFloat(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                                            <button onClick={() => setMultipayEntries(multipayEntries.filter((_, i) => i !== index))} className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-4 border-t border-slate-200 space-y-2 text-[10px] md:text-sm uppercase font-bold tracking-wider">
                                    <div className="flex justify-between text-slate-500">
                                        <span>Total Paid:</span>
                                        <span className="text-slate-900 font-black">₦{multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Remaining:</span>
                                        <span className={`font-black ${(Math.max(0, calculateTotal() - discount) - multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0)) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>₦{(Math.max(0, calculateTotal() - discount) - multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleCheckout(PaymentMethod.MULTIPAY, multipayEntries)}
                                    disabled={multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0) !== Math.max(0, calculateTotal() - discount)}
                                    className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                                >
                                    Confirm Payment
                                </button>
                            </div>
                        )}

                        <button onClick={() => { setIsPaymentModalOpen(false); setIsMultipayOpen(false); setMultipayEntries([]); }} className="w-full py-3 text-slate-500 font-medium hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">Cancel Transaction</button>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {receiptSale && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 md:p-4" id="printable-receipt">
                    <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-lg max-h-[95vh]">
                        <div className="p-3 md:p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 no-print">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPaperSize('80mm')} className={`px-2 py-1 text-[10px] md:text-xs rounded ${paperSize === '80mm' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600'}`}>80mm</button>
                                <button onClick={() => setPaperSize('58mm')} className={`px-2 py-1 text-[10px] md:text-xs rounded ${paperSize === '58mm' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600'}`}>58mm</button>
                            </div>
                            <button onClick={() => setReceiptSale(null)} className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
                            </button>
                        </div>

                        <div className="p-4 md:p-6 bg-slate-100 flex justify-center overflow-y-auto">
                            <div
                                id="receipt-content"
                                ref={receiptRef}
                                className={`bg-white p-4 md:p-6 border border-slate-200 text-xs md:text-sm font-mono text-slate-800 leading-tight ${paperSize === '80mm' ? 'receipt-80mm' : 'receipt-58mm'}`}
                                style={{ minHeight: '400px' }}
                            >
                                <div className="text-center mb-4">
                                    <h2 className="text-base md:text-lg font-bold mb-1">AK Alheri Chemist PPMVS Kurfi</h2>
                                    <p className="text-[10px] md:text-xs text-slate-500">No.2&3 Maraɗi Aliyu Street Opposite JIBWIS Jumma'a Masjid Kurfi</p>
                                    <p className="text-[10px] md:text-xs text-slate-500">Tel: 09060605362, 07039177740</p>
                                    <p className="text-[10px] md:text-xs text-slate-500">Email: kabirbalakurfi@gmail.com</p>
                                </div>

                                <div className="border-b border-dashed border-slate-300 pb-2 mb-2 space-y-1">
                                    <div className="flex justify-between"><span>Date:</span><span>{format(receiptSale.date, 'dd/MM/yyyy HH:mm')}</span></div>
                                    <div className="flex justify-between"><span>Sale ID:</span><span>#{receiptSale.id}</span></div>
                                    <div className="flex justify-between"><span>Customer:</span><span>{receiptSale.customerName}</span></div>
                                </div>

                                <div className="mb-2">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-slate-300">
                                                <th className="pb-1">Item</th>
                                                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">Qty</th>
                                                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">Price</th>
                                                <th className="pb-1 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(receiptSale.items || []).map((item, i) => (
                                                <tr key={i}>
                                                    <td className="pt-1 pr-1">{item.productName}</td>
                                                    <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">{item.quantity}</td>
                                                    <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">{item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className="pt-1 text-right">{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 mb-4">
                                    {(receiptSale.discount || 0) > 0 && (
                                        <>
                                            <div className="flex justify-between text-[10px] md:text-xs">
                                                <span>Subtotal:</span>
                                                <span>₦{receiptSale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px] md:text-xs">
                                                <span>Discount:</span>
                                                <span>-₦{receiptSale.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex justify-between font-bold text-base md:text-lg">
                                        <span>TOTAL</span>
                                        <span>₦{receiptSale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] md:text-xs">
                                        <span>Payment Method:</span>
                                        {receiptSale.paymentMethod === PaymentMethod.MULTIPAY ? (
                                            <div className="text-right">
                                                {(receiptSale.paymentMethods || []).filter(pm => pm != null).map((pm, i) => (
                                                    <div key={i}>{pm.method}: ₦{pm.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span>{receiptSale.paymentMethod}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-center text-[10px] md:text-xs text-slate-500 mt-6">
                                    <p>Mun gode da kasuwancin ku!</p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-col gap-2 no-print">
                                <button
                                    onClick={() => window.print()}
                                    className="flex items-center justify-center gap-2 bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-700 transition-colors"
                                >
                                    <Receipt className="w-4 h-4" /> Print Receipt
                                </button>
                                <div className="flex gap-2">
                                    <button onClick={handleDownloadReceipt} className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-xs">
                                        Save PDF
                                    </button>
                                    <button onClick={handleDownloadImage} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-xs">
                                        Save Image
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POS;