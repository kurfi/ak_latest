import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Customer } from '../types';
import { UserPlus, Search, Phone, Mail, CreditCard, Trash2, Edit, ChevronRight, UserCircle, History } from 'lucide-react';

const Customers: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', creditLimit: 0 });

  const customers = useLiveQuery(() => 
    db.customers
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .toArray()
  );

  const stats = {
    total: customers?.length || 0,
    withDebt: customers?.filter(c => c.currentDebt > 0).length || 0,
    totalDebt: customers?.reduce((sum, c) => sum + (c.currentDebt || 0), 0) || 0
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await db.customers.update(editingCustomer.id!, formData);
      } else {
        await db.customers.add({ ...formData, currentDebt: 0 });
      }
      setIsModalOpen(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', email: '', creditLimit: 0 });
    } catch (error) {
      console.error(error);
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      creditLimit: customer.creditLimit
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      await db.customers.delete(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customer Management</h1>
          <p className="text-slate-500 text-sm">Track customer debts and contact information.</p>
        </div>
        <button
          onClick={() => {
            setEditingCustomer(null);
            setFormData({ name: '', phone: '', email: '', creditLimit: 0 });
            setIsModalOpen(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 shadow-sm"
        >
          <UserPlus className="w-5 h-5" /> Add Customer
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Total Customers</p>
          <h3 className="text-3xl font-bold text-slate-900 mt-1">{stats.total}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Customers with Debt</p>
          <h3 className="text-3xl font-bold text-amber-600 mt-1">{stats.withDebt}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Total Receivables</p>
          <h3 className="text-3xl font-bold text-red-600 mt-1">₦{stats.totalDebt.toLocaleString()}</h3>
        </div>
      </div>

      {/* Search and Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search customers..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-4 font-semibold">Customer</th>
                <th className="p-4 font-semibold">Contact</th>
                <th className="p-4 font-semibold">Credit Limit</th>
                <th className="p-4 font-semibold">Current Debt</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers?.map(customer => (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold border border-indigo-100">
                        {customer.name[0].toUpperCase()}
                      </div>
                      <span className="font-bold text-slate-800">{customer.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-3.5 h-3.5" /> {customer.phone}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <Mail className="w-3.5 h-3.5" /> {customer.email}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">₦{customer.creditLimit.toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`font-bold ${customer.currentDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₦{customer.currentDebt.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(customer)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit Customer"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(customer.id!)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Customer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {customers?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 opacity-20" />
                      <p>No customers found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-slate-800 mb-6">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  required
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Credit Limit (₦)</label>
                <input
                  type="number"
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={formData.creditLimit}
                  onChange={e => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
                >
                  {editingCustomer ? 'Update' : 'Save'} Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
