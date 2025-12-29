
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { db, logAudit } from '../db/db';
import { Product, Batch, Sale, SaleStatus, PaymentMethod, Customer, UserRole } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
    Search, 
    ShoppingCart, 
    Plus, 
    Minus, 
    Trash2, 
    CreditCard, 
    User, 
    Receipt, 
    History, 
    Clock, 
    Search as SearchIcon, 
    AlertCircle, 
    CheckCircle2, 
    Printer,
    ArrowLeft,
    PauseCircle,
    PlayCircle,
    X,
    Filter,
    ChevronRight,
    ArrowRight,
    Smartphone,
    Monitor,
    LayoutGrid,
    LayoutList,
    Download,
    Image as ImageIcon,
    RefreshCcw
} from 'lucide-react';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';
import PrintReceipt from '../components/PrintReceipt';
import { printReceipt, printRawReceipt, generateReceiptBuffer } from '../services/printerService';
import { generateAndSavePdfFromHtml } from '../services/pdfService';
import { saveElementAsImage } from '../services/pdfService'; // Reuse image saving from pdfService

const POS: React.FC = () => {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [cart, setCart] = useState<(Product & { quantity: number; total: number; batchId?: number })[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
    const [activeTab, setActiveTab] = useState<'catalog' | 'history' | 'held'>('catalog');
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isMultipayOpen, setIsMultipayOpen] = useState(false);
    const [multipayEntries, setMultipayEntries] = useState<{ method: PaymentMethod; amount: string }[]>([]);
    const receiptRef = useRef<HTMLDivElement>(null);

    // Queries
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const batches = useLiveQuery(() => db.batches.toArray()) || [];
    const customers = useLiveQuery(() => db.customers.toArray()) || [];
    const recentSales = useLiveQuery(async () => {
        if (!historySearchQuery) {
            return await db.sales.orderBy('date').reverse().limit(20).toArray();
        }
        const lowerQuery = historySearchQuery.toLowerCase();
        return await db.sales
            .filter(s => 
                (s.customerName?.toLowerCase() || '').includes(lowerQuery) || 
                (s.id?.toString() || '').includes(lowerQuery)
            )
            .reverse()
            .toArray();
    }, [historySearchQuery]);

    const heldSales = useLiveQuery(() => db.sales.where('status').equals(SaleStatus.HELD).reverse().toArray());

    const categories = useMemo(() => {
        const cats = new Set(products.map(p => p.category));
        return ['All', ...Array.from(cats)];
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                p.barcode.includes(searchQuery);
            const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
            return matchesSearch && matchesCategory;
        });
    }, [products, searchQuery, activeCategory]);

    const getProductStock = (productId: number) => {
        return batches
            .filter(b => b.productId === productId && isAfter(new Date(b.expiryDate), new Date()))
            .reduce((sum, b) => sum + b.quantity, 0);
    };

    const addToCart = (product: Product) => {
        const stock = getProductStock(product.id!);
        if (stock <= 0) {
            showToast(`${product.name} is out of stock!`, 'error');
            return;
        }

        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                if (existing.quantity >= stock) {
                    showToast(`Cannot add more. Only ${stock} available.`, 'error');
                    return prev;
                }
                return prev.map(item => 
                    item.id === product.id 
                        ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price } 
                        : item
                );
            }
            return [...prev, { ...product, quantity: 1, total: product.price }];
        });
        setIsCartOpen(true);
    };

    const updateQuantity = (productId: number, delta: number) => {
        const stock = getProductStock(productId);
        setCart(prev => prev.map(item => {
            if (item.id === productId) {
                const newQty = Math.max(0, item.quantity + delta);
                if (newQty > stock) {
                    showToast(`Only ${stock} units available in stock.`, 'error');
                    return item;
                }
                return { ...item, quantity: newQty, total: newQty * item.price };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const calculateTotal = () => cart.reduce((sum, item) => sum + item.total, 0);

    const handleHoldSale = async () => {
        if (cart.length === 0) return;
        
        const heldSale: Omit<Sale, 'id'> = {
            customerName: selectedCustomer?.name || 'Walk-in',
            customerId: selectedCustomer?.id,
            date: new Date(),
            totalAmount: calculateTotal(),
            discount: discount,
            finalAmount: calculateTotal() - discount,
            paymentMethod: PaymentMethod.CASH, // Placeholder
            status: SaleStatus.HELD,
            items: cart.map(item => ({
                productId: item.id!,
                productName: item.name,
                quantity: item.quantity,
                price: item.price,
                total: item.total
            }))
        };

        await db.sales.add(heldSale as Sale);
        setCart([]);
        setSelectedCustomer(null);
        setDiscount(0);
        showToast('Sale held successfully', 'success');
    };

    const resumeSale = async (sale: Sale) => {
        // Check if items are still in stock
        for (const item of sale.items) {
            const stock = getProductStock(item.productId);
            if (stock < item.quantity) {
                showToast(`Cannot resume: ${item.productName} now has insufficient stock.`, 'error');
                return;
            }
        }

        const cartItems = sale.items.map(item => {
            const product = products.find(p => p.id === item.productId);
            return {
                ...product!,
                quantity: item.quantity,
                total: item.total
            };
        });

        setCart(cartItems);
        setDiscount(sale.discount);
        if (sale.customerId) {
            const customer = customers.find(c => c.id === sale.customerId);
            setSelectedCustomer(customer || null);
        }
        await db.sales.delete(sale.id!);
        setActiveTab('catalog');
        setIsCartOpen(true);
        showToast('Sale resumed', 'success');
    };

    const handleCheckout = async (method: PaymentMethod) => {
        const totalAmount = calculateTotal();
        const finalAmount = totalAmount - discount;

        if (method === PaymentMethod.CREDIT && !selectedCustomer) {
            showToast('Please select a customer for credit sales!', 'error');
            return;
        }

        if (method === PaymentMethod.MULTIPAY) {
            const totalMultipay = multipayEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
            if (Math.abs(totalMultipay - finalAmount) > 0.01) {
                showToast(`Multipay total (₦${totalMultipay}) must equal sale total (₦${finalAmount})`, 'error');
                return;
            }
        }

        try {
            let saleId: number | undefined;

            await db.transaction('rw', [db.sales, db.batches, db.customers, db.auditLogs], async () => {
                // 1. Inventory Deduction (FIFO)
                const finalItems = [];
                for (const item of cart) {
                    const validBatches = batches
                        .filter(b => b.productId === item.id && isAfter(new Date(b.expiryDate), new Date()))
                        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

                    const availableTotal = validBatches.reduce((s, b) => s + b.quantity, 0);
                    if (availableTotal < item.quantity) {
                        throw new Error(`Insufficient valid (unexpired) stock for ${item.productName}`);
                    }

                    let remainingQtyToDeduct = item.quantity;
                    let totalItemCost = 0;

                    // Deduct from valid batches and calculate cost
                    for (const batch of validBatches) {
                        if (remainingQtyToDeduct <= 0) break;

                        const deduct = Math.min(batch.quantity, remainingQtyToDeduct);

                        if (deduct > 0) {
                            // Calculate cost portion
                            totalItemCost += deduct * batch.costPrice;

                            // Update batch
                            await db.batches.update(batch.id!, { quantity: batch.quantity - deduct });
                            remainingQtyToDeduct -= deduct;
                        }
                    }

                    // Calculate weighted average cost per unit
                    // If quantity is 0 (shouldn't happen due to cart logic), avoid NaN
                    const averageCostPrice = item.quantity > 0 ? totalItemCost / item.quantity : 0;

                    finalItems.push({
                        ...item,
                        productId: item.id!, // Ensure productId is set correctly
                        productName: item.name,
                        costPrice: averageCostPrice
                    });
                }

                const saleData: Omit<Sale, 'id'> = {
                    customerId: selectedCustomer?.id,
                    customerName: selectedCustomer?.name || 'Walk-in',
                    date: new Date(),
                    totalAmount: totalAmount,
                    discount: discount,
                    finalAmount: finalAmount,
                    paymentMethod: method,
                    status: SaleStatus.COMPLETED,
                    items: finalItems // Use items with costPrice
                };

                if (method === PaymentMethod.MULTIPAY) {
                    saleData.paymentMethods = multipayEntries.map(e => ({ ...e, amount: parseFloat(e.amount) }));
                }

                const newSaleId = await db.sales.add(saleData as Sale);
                saleId = newSaleId;

                // 2. Debt Update
                if (method === PaymentMethod.CREDIT && selectedCustomer?.id) {
                    const customer = await db.customers.get(selectedCustomer.id);
                    if (customer) {
                        const currentDebt = customer.currentDebt || 0;
                        await db.customers.update(customer.id!, { 
                            currentDebt: currentDebt + finalAmount,
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            });

            // Log Audit outside transaction (to treat it as a side effect, or if db transaction included it, inside)
            // Since db transaction above doesn't include auditLogs, we do it here.
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
            // alert('Sale Completed Successfully!'); // Removed to show receipt
        } catch (error: any) {
            console.error(error);
            alert(error.message || 'Transaction failed.');
        }
    };

    const handlePrintReceipt = async () => {
        await printReceipt();
    };

    const handlePrintRaw = async () => {
        if (!receiptSale) return;
        try {
            const buffer = generateReceiptBuffer(receiptSale);
            await printRawReceipt(buffer);
        } catch (error) {
            console.error("Raw print failed:", error);
            showToast("Failed to generate raw print data.", 'error');
        }
    };

    const handleDownloadImage = async () => {
        if (!receiptRef.current || !receiptSale) {
            showToast("Receipt content is not available to save as an image.", 'error');
            return;
        }
        const defaultFileName = `receipt-${receiptSale.id}-${format(new Date(), 'yyyyMMdd')}.png`;
        receiptRef.current.classList.add('bg-white');
        try {
            await saveElementAsImage(receiptRef.current, defaultFileName);
            showToast('Receipt image saved successfully!', 'success');
        } catch (error) {
            console.error("Receipt image download failed:", error);
            showToast('Failed to save receipt image.', 'error');
        } finally {
            receiptRef.current.classList.remove('bg-white');
        }
    };

    const handleDownloadReceipt = async () => {
        if (!receiptRef.current || !receiptSale) {
            showToast("Receipt content is not available to save as PDF.", 'error');
            return;
        }

        const defaultFileName = `receipt-${receiptSale.id}-${format(new Date(), 'yyyyMMdd')}.pdf`;

        // Temporarily add a white background to the receipt element for consistent PDF rendering
        receiptRef.current.classList.add('bg-white');

        try {
            await generateAndSavePdfFromHtml(receiptRef.current, defaultFileName);
            showToast('Receipt PDF saved successfully!', 'success');
        } catch (error) {
            console.error("Receipt PDF download failed:", error);
            showToast('Failed to save Receipt PDF.', 'error');
        } finally {
            // Remove the temporary white background
            receiptRef.current.classList.remove('bg-white');
        }
    };

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-theme(spacing.24))] lg:h-[calc(100vh-theme(spacing.16))] gap-4 relative">

            {/* LEFT: Product Catalog */}
            <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden no-print">
                <div className="p-3 md:p-4 border-b border-slate-200 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            className="w-full pl-10 pr-4 py-2 md:py-2.5 rounded-lg bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
                            placeholder="Search by name or barcode..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 md:p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 md:p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <LayoutList className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex gap-2 p-3 md:p-4 overflow-x-auto no-scrollbar border-b border-slate-100">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-bold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-slate-900 text-white shadow-lg shadow-slate-200 scale-105' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-4">
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                            {filteredProducts.map(product => {
                                const stock = getProductStock(product.id!);
                                return (
                                    <div
                                        key={product.id}
                                        onClick={() => stock > 0 && addToCart(product)}
                                        className={`group relative bg-white border border-slate-200 rounded-xl p-3 md:p-4 transition-all hover:shadow-xl hover:border-emerald-200 cursor-pointer ${stock <= 0 ? 'opacity-50' : 'active:scale-95'}`}
                                    >
                                        <div className="mb-2 md:mb-3">
                                            <div className="flex justify-between items-start mb-1 md:mb-2">
                                                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">{product.category}</span>
                                                {stock <= product.minStockLevel && stock > 0 && <AlertCircle className="w-3 h-3 md:w-4 md:h-4 text-amber-500" />}
                                                {stock <= 0 && <span className="text-[10px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded uppercase">Out</span>}
                                            </div>
                                            <h3 className="font-bold text-slate-800 text-xs md:text-sm line-clamp-2 leading-tight h-8 md:h-10">{product.name}</h3>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] md:text-xs text-slate-400 font-bold">Price</span>
                                                <span className="text-sm md:text-lg font-black text-slate-900">₦{product.price.toLocaleString()}</span>
                                            </div>
                                            <div className={`px-2 py-1 rounded-lg text-[10px] font-black border ${stock <= product.minStockLevel ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                {stock} Units
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredProducts.map(product => {
                                const stock = getProductStock(product.id!);
                                return (
                                    <div
                                        key={product.id}
                                        onClick={() => stock > 0 && addToCart(product)}
                                        className={`flex items-center justify-between p-3 md:p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-200 transition-all cursor-pointer ${stock <= 0 ? 'opacity-50' : 'active:bg-slate-50'}`}
                                    >
                                        <div className="flex-1 min-w-0 pr-4">
                                            <h3 className="font-bold text-slate-800 text-xs md:text-sm truncate">{product.name}</h3>
                                            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-widest font-bold">{product.category} • {product.barcode}</p>
                                        </div>
                                        <div className="flex items-center gap-4 md:gap-8">
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Price</p>
                                                <p className="text-sm md:text-base font-black text-slate-900">₦{product.price.toLocaleString()}</p>
                                            </div>
                                            <div className="text-right min-w-[60px] md:min-w-[80px]">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Stock</p>
                                                <p className={`text-sm md:text-base font-black ${stock <= product.minStockLevel ? 'text-amber-500' : 'text-slate-700'}`}>{stock} U</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Cart / Tabs */}
            <div className={`fixed inset-0 z-40 lg:relative lg:inset-auto lg:z-0 lg:w-96 flex flex-col bg-white border-l border-slate-200 transition-transform duration-300 transform ${isCartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
                <div className="p-2 md:p-3 border-b border-slate-100 flex gap-1 bg-slate-50">
                    <button onClick={() => setActiveTab('catalog')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'catalog' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Cart ({cart.length})</button>
                    <button onClick={() => setActiveTab('history')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'history' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Recent</button>
                    <button onClick={() => setActiveTab('held')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'held' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Held ({heldSales?.length || 0})</button>
                    <button onClick={() => setIsCartOpen(false)} className="lg:hidden p-2 text-slate-400"><X className="w-5 h-5" /></button>
                </div>

                {/* 1. CART VIEW */}
                {activeTab === 'catalog' && (
                    <>
                        <div className="p-3 md:p-4 border-b border-slate-100">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Selected Customer</label>
                            <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <select
                                    className="w-full pl-10 pr-4 py-2.5 md:py-3 bg-slate-50 border-none rounded-xl text-xs md:text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
                                    value={selectedCustomer?.id || ''}
                                    onChange={(e) => {
                                        const id = parseInt(e.target.value);
                                        const customer = customers.find(c => c.id === id);
                                        setSelectedCustomer(customer || null);
                                    }}
                                >
                                    <option value="">Walk-in Customer</option>
                                    {customers.filter(c => c.name !== 'Walk-in Customer').map(c => (
                                        <option key={c.id} value={c.id}>{c.name} (₦{c.currentDebt.toLocaleString()})</option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6">
                            {cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                                    <ShoppingCart className="w-16 h-16 md:w-20 md:h-20 opacity-10" />
                                    <p className="font-bold text-sm md:text-base uppercase tracking-widest opacity-20">Cart is empty</p>
                                </div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.id} className="flex items-center mb-4 md:mb-6 group animate-in slide-in-from-right-2 duration-300">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-slate-800 text-xs md:text-sm truncate uppercase">{item.name}</h4>
                                            <p className="text-[10px] md:text-xs text-slate-400 font-bold">₦{item.price.toLocaleString()} / unit</p>
                                        </div>
                                        <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                                            <button onClick={() => updateQuantity(item.id!, -1)} className="p-1 hover:bg-white hover:text-red-500 rounded text-slate-400"><Minus className="w-3 h-3" /></button>
                                            <span className="w-8 md:w-10 text-center text-xs md:text-sm font-black">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id!, 1)} className="p-1 hover:bg-white hover:text-emerald-600 rounded text-slate-400"><Plus className="w-3 h-3" /></button>
                                        </div>
                                        <div className="ml-3 md:ml-4 text-right min-w-[70px] md:min-w-[80px]">
                                            <p className="font-black text-slate-900 text-xs md:text-sm">₦{item.total.toLocaleString()}</p>
                                            <button onClick={() => removeFromCart(item.id!)} className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Remove</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 md:p-6 bg-white border-t border-slate-100 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs md:text-sm text-slate-400 font-bold uppercase tracking-widest">
                                    <span>Subtotal</span>
                                    <span>₦{calculateTotal().toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs md:text-sm text-slate-400 font-bold uppercase tracking-widest">
                                    <span>Discount</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-300">₦</span>
                                        <input
                                            type="number"
                                            value={discount || ''}
                                            onChange={(e) => setDiscount(Math.min(calculateTotal(), Math.max(0, parseFloat(e.target.value) || 0)))}
                                            className="w-20 md:w-24 px-2 py-1 bg-slate-50 border-none rounded text-right font-black text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div className="pt-4 flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Payable</p>
                                        <p className="text-2xl md:text-3xl font-black text-slate-900">₦{(calculateTotal() - discount).toLocaleString()}</p>
                                    </div>
                                    <div className="flex gap-2 no-print">
                                        <button
                                            onClick={handleHoldSale}
                                            disabled={cart.length === 0}
                                            className="p-3 md:p-4 bg-amber-50 text-amber-600 rounded-2xl hover:bg-amber-100 transition-all disabled:opacity-30 active:scale-95"
                                            title="Hold Sale"
                                        >
                                            <PauseCircle className="w-5 h-5 md:w-6 md:h-6" />
                                        </button>
                                        <button
                                            onClick={() => setIsPaymentModalOpen(true)}
                                            disabled={cart.length === 0}
                                            className="px-6 md:px-10 py-3 md:py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm md:text-base shadow-xl shadow-emerald-100 hover:bg-emerald-600 hover:shadow-emerald-200 transition-all active:scale-95 disabled:opacity-30 flex items-center gap-3"
                                        >
                                            Checkout <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* 2. HISTORY VIEW */}
                {activeTab === 'history' && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="p-3 md:p-4 border-b border-slate-100 sticky top-0 bg-white/80 backdrop-blur-md z-10">
                            <div className="relative">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                                    placeholder="Search by Customer or ID..."
                                    value={historySearchQuery}
                                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-50 p-2">
                            {recentSales && recentSales.length > 0 ? (
                                recentSales.map((sale) => (
                                    <div key={sale.id} className="p-3 md:p-4 hover:bg-slate-50 rounded-xl transition-all group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sale #{sale.id}</p>
                                                <h4 className="font-black text-slate-800 text-base md:text-lg">₦{sale.finalAmount.toLocaleString()}</h4>
                                            </div>
                                            <span className="px-2 py-1 rounded-md bg-slate-100 text-[10px] font-black text-slate-500 uppercase border border-slate-200">{sale.paymentMethod}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-500 font-bold">
                                                    <Clock className="w-3 h-3 text-slate-300" /> {format(sale.date, 'MMM dd, HH:mm')}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-500 font-bold">
                                                    <User className="w-3 h-3 text-slate-300" /> {sale.customerName}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setReceiptSale(sale)}
                                                className="p-2 bg-emerald-50 text-emerald-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-emerald-600 hover:text-white"
                                            >
                                                <Receipt className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                                    <History className="w-12 h-12 md:w-16 md:h-16 opacity-10 mb-4" />
                                    <p className="text-xs md:text-sm font-bold uppercase tracking-widest opacity-20">No recent transactions</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. HELD VIEW */}
                {activeTab === 'held' && (
                    <div className="flex-1 overflow-y-auto p-2 md:p-4 bg-slate-50">
                        {heldSales && heldSales.length > 0 ? (
                            <div className="grid gap-2 md:gap-3">
                                {heldSales.map(sale => (
                                    <div key={sale.id} className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 group animate-in zoom-in-95 duration-200">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Held Sale</p>
                                                <h4 className="font-black text-slate-800 text-sm md:text-base">₦{sale.finalAmount.toLocaleString()}</h4>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400">{format(sale.date, 'HH:mm')}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-bold mb-4 flex items-center gap-2"><User className="w-3 h-3" /> {sale.customerName}</p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => resumeSale(sale)}
                                                className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all"
                                            >
                                                Resume
                                            </button>
                                            <button
                                                onClick={() => db.sales.delete(sale.id!)}
                                                className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                                <PauseCircle className="w-12 h-12 md:w-16 md:h-16 opacity-10 mb-4" />
                                <p className="text-xs md:text-sm font-bold uppercase tracking-widest opacity-20">No held transactions</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* PAYMENT MODAL */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-2 md:p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-4 md:p-6 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Complete Transaction</p>
                                <h2 className="text-xl md:text-2xl font-black">Choose Payment Method</h2>
                            </div>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="p-6 md:p-8">
                            <div className="text-center mb-8 md:mb-10">
                                <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Amount Due</p>
                                <h3 className="text-4xl md:text-5xl font-black text-slate-900">₦{(calculateTotal() - discount).toLocaleString()}</h3>
                                {selectedCustomer && (
                                    <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold">
                                        <User className="w-4 h-4" /> Customer: {selectedCustomer.name}
                                    </div>
                                )}
                            </div>

                            {!isMultipayOpen ? (
                                <div className="grid grid-cols-2 gap-3 md:gap-4">
                                    <button 
                                        onClick={() => handleCheckout(PaymentMethod.CASH)}
                                        className="p-4 md:p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-3 hover:border-emerald-500 hover:bg-emerald-50 transition-all active:scale-95 group"
                                    >
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-slate-400 group-hover:text-emerald-600 transition-colors"><Smartphone className="w-6 h-6 md:w-8 md:h-8" /></div>
                                        <span className="font-black text-xs md:text-sm text-slate-600 uppercase tracking-widest">Cash</span>
                                    </button>
                                    <button 
                                        onClick={() => handleCheckout(PaymentMethod.TRANSFER)}
                                        className="p-4 md:p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-3 hover:border-indigo-500 hover:bg-indigo-50 transition-all active:scale-95 group"
                                    >
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-slate-400 group-hover:text-indigo-600 transition-colors"><RefreshCcw className="w-6 h-6 md:w-8 md:h-8" /></div>
                                        <span className="font-black text-xs md:text-sm text-slate-600 uppercase tracking-widest">Transfer</span>
                                    </button>
                                    <button 
                                        onClick={() => handleCheckout(PaymentMethod.CARD)}
                                        className="p-4 md:p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-3 hover:border-blue-500 hover:bg-blue-50 transition-all active:scale-95 group"
                                    >
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-slate-400 group-hover:text-blue-600 transition-colors"><CreditCard className="w-6 h-6 md:w-8 md:h-8" /></div>
                                        <span className="font-black text-xs md:text-sm text-slate-600 uppercase tracking-widest">POS / Card</span>
                                    </button>
                                    <button 
                                        onClick={() => handleCheckout(PaymentMethod.CREDIT)}
                                        disabled={!selectedCustomer}
                                        className="p-4 md:p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-3 hover:border-amber-500 hover:bg-amber-50 transition-all active:scale-95 group disabled:opacity-30 disabled:grayscale"
                                    >
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-slate-400 group-hover:text-amber-600 transition-colors"><User className="w-6 h-6 md:w-8 md:h-8" /></div>
                                        <span className="font-black text-xs md:text-sm text-slate-600 uppercase tracking-widest">Debt / Credit</span>
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setIsMultipayOpen(true);
                                            setMultipayEntries([{ method: PaymentMethod.CASH, amount: '' }]);
                                        }}
                                        className="col-span-2 p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95"
                                    >
                                        <LayoutGrid className="w-5 h-5" />
                                        <span className="font-black text-xs md:text-sm uppercase tracking-widest">Multipay (Split Payment)</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">Split Details</h4>
                                        <button onClick={() => setIsMultipayOpen(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600">Back to Simple</button>
                                    </div>
                                    <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2">
                                        {multipayEntries.map((entry, idx) => (
                                            <div key={idx} className="flex gap-2 animate-in slide-in-from-right-2 duration-200">
                                                <select
                                                    className="flex-1 p-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 outline-none"
                                                    value={entry.method}
                                                    onChange={(e) => {
                                                        const newEntries = [...multipayEntries];
                                                        newEntries[idx].method = e.target.value as PaymentMethod;
                                                        setMultipayEntries(newEntries);
                                                    }}
                                                >
                                                    <option value={PaymentMethod.CASH}>Cash</option>
                                                    <option value={PaymentMethod.CARD}>POS / Card</option>
                                                    <option value={PaymentMethod.TRANSFER}>Transfer</option>
                                                    <option value={PaymentMethod.CREDIT}>Debt / Credit</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    className="w-32 md:w-40 p-3 bg-slate-50 border-none rounded-xl text-xs md:text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                                                    placeholder="0.00"
                                                    value={entry.amount}
                                                    onChange={(e) => {
                                                        const newEntries = [...multipayEntries];
                                                        newEntries[idx].amount = e.target.value;
                                                        setMultipayEntries(newEntries);
                                                    }}
                                                />
                                                <button
                                                    onClick={() => setMultipayEntries(prev => prev.filter((_, i) => i !== idx))}
                                                    disabled={multipayEntries.length === 1}
                                                    className="p-3 text-red-400 hover:text-red-600 disabled:opacity-0"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setMultipayEntries([...multipayEntries, { method: PaymentMethod.CASH, amount: '' }])}
                                        className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" /> Add Payment Line
                                    </button>
                                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                        <div className="text-right flex-1 pr-6">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Multipay Balance</p>
                                            <p className={`text-lg font-black ${Math.abs(multipayEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) - (calculateTotal() - discount)) < 0.01 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                ₦{multipayEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0).toLocaleString()} / ₦{(calculateTotal() - discount).toLocaleString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleCheckout(PaymentMethod.MULTIPAY)}
                                            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
                                        >
                                            Complete Sale
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* RECEIPT MODAL */}
            {receiptSale && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[70] flex items-center justify-center p-2 md:p-4 overflow-y-auto no-print animate-in fade-in duration-500">
                    <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
                        <div className="p-4 md:p-6 bg-emerald-600 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl"><CheckCircle2 className="w-6 h-6 md:w-8 md:h-8" /></div>
                                <div>
                                    <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest">Transaction Success</p>
                                    <h2 className="text-xl md:text-2xl font-black">Sale Completed!</h2>
                                </div>
                            </div>
                            <button onClick={() => setReceiptSale(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="p-4 md:p-8 space-y-6 md:space-y-8">
                            <div className="flex justify-center">
                                <div ref={receiptRef} className="max-w-[320px] w-full transform scale-90 md:scale-100">
                                    <PrintReceipt sale={receiptSale} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                                <button
                                    onClick={handlePrintReceipt}
                                    className="p-3 md:p-4 bg-slate-900 text-white rounded-2xl flex flex-col items-center gap-2 hover:bg-slate-800 transition-all active:scale-95"
                                >
                                    <Printer className="w-5 h-5 md:w-6 md:h-6" />
                                    <span className="text-[10px] md:text-xs font-black uppercase tracking-wider">Print</span>
                                </button>
                                <button
                                    onClick={handleDownloadReceipt}
                                    className="p-3 md:p-4 bg-slate-100 text-slate-700 rounded-2xl flex flex-col items-center gap-2 hover:bg-slate-200 transition-all active:scale-95"
                                >
                                    <Download className="w-5 h-5 md:w-6 md:h-6" />
                                    <span className="text-[10px] md:text-xs font-black uppercase tracking-wider">PDF</span>
                                </button>
                                <button
                                    onClick={handleDownloadImage}
                                    className="p-3 md:p-4 bg-slate-100 text-slate-700 rounded-2xl flex flex-col items-center gap-2 hover:bg-slate-200 transition-all active:scale-95"
                                >
                                    <ImageIcon className="w-5 h-5 md:w-6 md:h-6" />
                                    <span className="text-[10px] md:text-xs font-black uppercase tracking-wider">Image</span>
                                </button>
                                <button
                                    onClick={handlePrintRaw}
                                    className="p-3 md:p-4 bg-indigo-50 text-indigo-600 rounded-2xl flex flex-col items-center gap-2 hover:bg-indigo-100 transition-all active:scale-95"
                                    title="ESC/POS Direct Print"
                                >
                                    <Printer className="w-5 h-5 md:w-6 md:h-6" />
                                    <span className="text-[10px] md:text-xs font-black uppercase tracking-wider">Raw</span>
                                </button>
                            </div>
                            
                            <button
                                onClick={() => setReceiptSale(null)}
                                className="w-full py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                            >
                                <ArrowLeft className="w-5 h-5" /> Back to Catalog
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POS;
