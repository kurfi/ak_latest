
import React, { useState } from 'react';
import { db, logAudit } from '../db/db';
import { Customer, UserRole, PaymentMethod } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, UserPlus, Phone, Mail, CreditCard, History, X, Edit, Trash2, ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../contexts/ToastContext';

const Customers: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    creditLimit: 0,
    currentDebt: 0
  });

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [repayForm, setRepayForm] = useState({
    amount: '',
    method: PaymentMethod.CASH,
    note: ''
  });

  const customers = useLiveQuery(async () => {
    if (searchTerm) {
      return await db.customers.where('name').startsWithIgnoreCase(searchTerm).or('phone').startsWith(searchTerm).toArray();
    }
    return await db.customers.toArray();
  }, [searchTerm]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.customers.add({
        name: newCustomer.name!,
        phone: newCustomer.phone!,
        email: newCustomer.email || '',
        creditLimit: Number(newCustomer.creditLimit) || 0,
        currentDebt: 0,
        createdAt: new Date()
      });
      setIsAddModalOpen(false);
      setNewCustomer({ name: '', phone: '', email: '', creditLimit: 0 });
      showToast('Customer added successfully', 'success');
    } catch (error) {
      showToast('Failed to add customer', 'error');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      await db.customers.update(editingCustomer.id!, {
        name: editingCustomer.name,
        phone: editingCustomer.phone,
        email: editingCustomer.email,
        creditLimit: Number(editingCustomer.creditLimit)
      });
      setIsEditModalOpen(false);
      setEditingCustomer(null);
      showToast('Customer updated successfully', 'success');
    } catch (error) {
      showToast('Failed to update customer', 'error');
    }
  };

  const handleRepayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const repayAmount = parseFloat(repayForm.amount);
    
    if (isNaN(repayAmount) || repayAmount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    if (repayAmount > selectedCustomer.currentDebt) {
      showToast('Repayment amount exceeds current debt', 'error');
      return;
    }

    try {
      await db.transaction('rw', [db.customers, db.sales, db.auditLogs], async () => {
        // 1. Update Customer Debt
        const newDebt = selectedCustomer.currentDebt - repayAmount;
        await db.customers.update(selectedCustomer.id!, { currentDebt: newDebt });

        // 2. Log payment as a special sale entry for reports
        await db.sales.add({
          date: new Date(),
          items: [{
            productId: 0,
            productName: 'DEBT_REPAYMENT',
            quantity: 1,
            price: repayAmount,
            total: repayAmount
          }],
          totalAmount: repayAmount,
          discount: 0,
          finalAmount: repayAmount,
          paymentMethod: repayForm.method,
          customerName: selectedCustomer.name,
          customerId: selectedCustomer.id,
          status: 'completed',
          note: repayForm.note || 'Debt repayment'
        });

        await logAudit(
          'DEBT_REPAYMENT',
          `Customer ${selectedCustomer.name} repaid ₦${repayAmount} via ${repayForm.method}`,
          currentUser?.username || 'Unknown'
        );
      });

      setIsRepayModalOpen(false);
      setRepayForm({ amount: '', method: PaymentMethod.CASH, note: '' });
      showToast('Payment recorded successfully', 'success');
    } catch (error) {
      showToast('Failed to record payment', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Customer Management</h1>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 shadow-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
              <tr>
                <th className="p-4 font-medium">Customer Name</th>
                <th className="p-4 font-medium">Contact</th>
                <th className="p-4 font-medium">Credit Limit</th>
                <th className="p-4 font-medium">Current Debt</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers?.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4 font-medium text-slate-800">{customer.name}</td>
                  <td className="p-4 text-slate-600">
                    <div className="flex flex-col text-xs gap-1">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {customer.phone}</span>
                      {customer.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {customer.email}</span>}
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">₦{customer.creditLimit.toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`font-bold ${customer.currentDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      ₦{customer.currentDebt.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      {customer.currentDebt > 0 && (
                        <button
                          onClick={() => { setSelectedCustomer(customer); setIsRepayModalOpen(true); }}
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                          title="Repay Debt"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => { setEditingCustomer(customer); setIsEditModalOpen(true); }}
                        className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg md:text-xl font-bold text-slate-800">New Customer</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-3 md:space-y-4">
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    placeholder="e.g. John Doe" 
                    required
                    value={newCustomer.name || ''}
                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    placeholder="e.g. 08012345678" 
                    required
                    value={newCustomer.phone || ''}
                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    type="email"
                    placeholder="john@example.com" 
                    value={newCustomer.email || ''}
                    onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Credit Limit (₦)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    type="number"
                    placeholder="0.00" 
                    value={newCustomer.creditLimit || ''}
                    onChange={e => setNewCustomer({...newCustomer, creditLimit: parseFloat(e.target.value)})}
                  />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-xs md:text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs md:text-sm font-medium">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && editingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg md:text-xl font-bold text-slate-800">Edit Customer</h2>
                <button onClick={() => setIsEditModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdateCustomer} className="space-y-3 md:space-y-4">
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    required
                    value={editingCustomer.name || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    required
                    value={editingCustomer.phone || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    type="email"
                    value={editingCustomer.email || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, email: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Credit Limit (₦)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" 
                    type="number"
                    placeholder="0.00" 
                    value={editingCustomer.creditLimit || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, creditLimit: parseFloat(e.target.value) || 0})}
                  />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-xs md:text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs md:text-sm font-medium">Update Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repay Debt Modal */}
      {isRepayModalOpen && selectedCustomer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">Repay Debt</h2>
                    <button onClick={() => setIsRepayModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="mb-4 md:mb-6 bg-red-50 border border-red-100 p-3 md:p-4 rounded-lg">
                    <p className="text-[10px] md:text-sm text-red-600 uppercase font-bold tracking-wider mb-1">Outstanding Debt</p>
                    <p className="text-xl md:text-2xl font-black text-red-700">₦{selectedCustomer.currentDebt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>

                <form onSubmit={handleRepayDebt} className="space-y-3 md:space-y-4">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Amount (₦)</label>
                        <input 
                            type="number"
                            required
                            min="1"
                            max={selectedCustomer.currentDebt}
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            placeholder="0.00"
                            value={repayForm.amount}
                            onChange={e => setRepayForm({...repayForm, amount: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                        <select 
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                            value={repayForm.method}
                            onChange={e => setRepayForm({...repayForm, method: e.target.value as PaymentMethod})}
                        >
                            <option value={PaymentMethod.CASH}>Cash</option>
                            <option value={PaymentMethod.TRANSFER}>Transfer</option>
                            <option value={PaymentMethod.CARD}>POS / Card</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                        <input 
                            type="text"
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            placeholder="e.g. Partial payment"
                            value={repayForm.note}
                            onChange={e => setRepayForm({...repayForm, note: e.target.value})}
                        />
                    </div>
                    
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={() => setIsRepayModalOpen(false)} className="px-4 py-2 text-xs md:text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs md:text-sm font-bold">Confirm Payment</button>
                    </div>
                </form>
            </div>
          </div>
      )}
    </div>
  );
};

export default Customers;