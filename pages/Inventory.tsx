import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { 
  Plus, 
  Search, 
  Package, 
  AlertTriangle, 
  BarChart2, 
  ChevronRight, 
  ArrowUpRight, 
  MoreVertical,
  History,
  Calendar,
  Layers,
  Edit,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { Product, Batch } from '../types';
import { format, isPast, isWithinInterval, addMonths } from 'date-fns';

const Inventory: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'products' | 'batches'>('products');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);

  // Queries
  const products = useLiveQuery(() => 
    db.products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).toArray()
  );
  const batches = useLiveQuery(() => db.batches.toArray());

  // Stats
  const stats = {
    totalItems: products?.length || 0,
    lowStock: products?.filter(p => {
      const stock = batches?.filter(b => b.productId === p.id).reduce((sum, b) => sum + b.quantity, 0) || 0;
      return stock <= (p.minStockLevel || 0);
    }).length || 0,
    expiringSoon: batches?.filter(b => {
      const expiry = new Date(b.expiryDate);
      return !isPast(expiry) && isWithinInterval(expiry, { 
        start: new Date(), 
        end: addMonths(new Date(), 3) 
      });
    }).length || 0,
    expired: batches?.filter(b => isPast(new Date(b.expiryDate))).length || 0
  };

  // Form States
  const [productForm, setProductForm] = useState<Omit<Product, 'id'>>({
    name: '', barcode: '', category: '', price: 0, minStockLevel: 5
  });
  const [batchForm, setBatchForm] = useState<Omit<Batch, 'id'>>({
    productId: 0, batchNumber: '', expiryDate: new Date(), quantity: 0, costPrice: 0, sellingPrice: 0
  });

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      await db.products.update(editingProduct.id!, productForm);
    } else {
      await db.products.add(productForm as Product);
    }
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBatch) {
      await db.batches.update(editingBatch.id!, batchForm);
    } else {
      await db.batches.add(batchForm as Batch);
    }
    setIsBatchModalOpen(false);
    setEditingBatch(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
          <p className="text-slate-500 text-sm">Monitor stock levels, batches, and expiries.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setEditingBatch(null);
              setBatchForm({ productId: products?.[0]?.id || 0, batchNumber: '', expiryDate: new Date(), quantity: 0, costPrice: 0, sellingPrice: 0 });
              setIsBatchModalOpen(true);
            }}
            className="bg-white border-2 border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2"
          >
            <Layers className="w-4 h-4" /> New Batch
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              setProductForm({ name: '', barcode: '', category: '', price: 0, minStockLevel: 5 });
              setIsProductModalOpen(true);
            }}
            className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 font-medium flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-5 h-5" /> Add Product
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-indigo-50 rounded-lg"><Package className="w-5 h-5 text-indigo-600" /></div>
            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">+12%</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mt-3">{stats.totalItems}</h3>
          <p className="text-slate-500 text-sm font-medium">Total Products</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-amber-50 rounded-lg"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
          </div>
          <h3 className="text-2xl font-bold text-amber-600 mt-3">{stats.lowStock}</h3>
          <p className="text-slate-500 text-sm font-medium">Low Stock Items</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-orange-50 rounded-lg"><Calendar className="w-5 h-5 text-orange-600" /></div>
          </div>
          <h3 className="text-2xl font-bold text-orange-600 mt-3">{stats.expiringSoon}</h3>
          <p className="text-slate-500 text-sm font-medium">Expiring Soon</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-red-50 rounded-lg"><AlertCircle className="w-5 h-5 text-red-600" /></div>
          </div>
          <h3 className="text-2xl font-bold text-red-600 mt-3">{stats.expired}</h3>
          <p className="text-slate-500 text-sm font-medium">Expired Batches</p>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex p-1 bg-slate-100 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('products')}
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                activeTab === 'products' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              All Products
            </button>
            <button
              onClick={() => setActiveTab('batches')}
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                activeTab === 'batches' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Active Batches
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'products' ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold">Product Name</th>
                  <th className="p-4 font-semibold">Category</th>
                  <th className="p-4 font-semibold">Price</th>
                  <th className="p-4 font-semibold">Total Stock</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products?.map(product => {
                  const stock = batches?.filter(b => b.productId === product.id).reduce((sum, b) => sum + b.quantity, 0) || 0;
                  const status = stock <= (product.minStockLevel || 0) ? 'Low' : 'OK';
                  
                  return (
                    <tr key={product.id} className="hover:bg-slate-50 group">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{product.name}</span>
                          <span className="text-xs text-slate-400">{product.barcode || 'No barcode'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">{product.category || 'General'}</td>
                      <td className="p-4 font-bold text-indigo-600">₦{product.price.toLocaleString()}</td>
                      <td className="p-4 text-slate-600">{stock} units</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              setEditingProduct(product);
                              setProductForm({ ...product });
                              setIsProductModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold">Batch #</th>
                  <th className="p-4 font-semibold">Product</th>
                  <th className="p-4 font-semibold">Expiry</th>
                  <th className="p-4 font-semibold">Qty</th>
                  <th className="p-4 font-semibold">Cost/Sell</th>
                  <th className="p-4 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches?.map(batch => {
                  const product = products?.find(p => p.id === batch.productId);
                  const expiry = new Date(batch.expiryDate);
                  const isExpired = isPast(expiry);
                  
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50">
                      <td className="p-4 font-mono font-bold text-slate-700">{batch.batchNumber}</td>
                      <td className="p-4 font-bold text-slate-800">{product?.name || 'Unknown'}</td>
                      <td className="p-4">
                        <span className={isExpired ? 'text-red-600 font-bold' : 'text-slate-600'}>
                          {format(expiry, 'dd/MM/yyyy')}
                        </span>
                      </td>
                      <td className="p-4 font-bold">{batch.quantity}</td>
                      <td className="p-4">
                        <div className="flex flex-col text-xs">
                          <span className="text-slate-400">C: ₦{batch.costPrice}</span>
                          <span className="text-indigo-600 font-bold">S: ₦{batch.sellingPrice}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          isExpired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {isExpired ? 'Expired' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold text-slate-800 mb-6">{editingProduct ? 'Edit' : 'Add'} Product</h2>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                <input
                  required
                  className="w-full border-slate-200 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  value={productForm.name}
                  onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Barcode</label>
                  <input
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={productForm.barcode}
                    onChange={e => setProductForm({ ...productForm, barcode: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={productForm.category}
                    onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Retail Price (₦)</label>
                  <input
                    type="number"
                    required
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={productForm.price}
                    onChange={e => setProductForm({ ...productForm, price: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min. Stock Level</label>
                  <input
                    type="number"
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={productForm.minStockLevel}
                    onChange={e => setProductForm({ ...productForm, minStockLevel: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="flex-1 py-2 border border-slate-200 rounded-lg font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900 shadow-lg shadow-slate-200"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Receive New Batch</h2>
            <form onSubmit={handleSaveBatch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Product</label>
                <select
                  required
                  className="w-full border-slate-200 border p-2 rounded-lg outline-none bg-white"
                  value={batchForm.productId}
                  onChange={e => setBatchForm({ ...batchForm, productId: Number(e.target.value) })}
                >
                  {products?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Batch Number</label>
                  <input
                    required
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={batchForm.batchNumber}
                    onChange={e => setBatchForm({ ...batchForm, batchNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    required
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={format(batchForm.expiryDate, 'yyyy-MM-dd')}
                    onChange={e => setBatchForm({ ...batchForm, expiryDate: new Date(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    required
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={batchForm.quantity}
                    onChange={e => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price</label>
                  <input
                    type="number"
                    required
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={batchForm.costPrice}
                    onChange={e => setBatchForm({ ...batchForm, costPrice: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sell Price</label>
                  <input
                    type="number"
                    required
                    className="w-full border-slate-200 border p-2 rounded-lg outline-none"
                    value={batchForm.sellingPrice}
                    onChange={e => setBatchForm({ ...batchForm, sellingPrice: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="flex-1 py-2 border border-slate-200 rounded-lg font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                >
                  Receive Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
