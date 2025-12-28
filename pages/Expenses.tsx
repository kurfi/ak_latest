import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Expense } from '../types';
import { Plus, Search, DollarSign, Calendar, Tag, Trash2, Edit, PieChart, ArrowUpRight, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

const Expenses: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState<Omit<Expense, 'id'>>({
    date: new Date(),
    category: '',
    amount: 0,
    note: ''
  });

  const expenses = useLiveQuery(() => 
    db.expenses
      .filter(e => e.category.toLowerCase().includes(searchTerm.toLowerCase()) || e.note?.toLowerCase().includes(searchTerm.toLowerCase()))
      .reverse()
      .toArray()
  );

  const stats = {
    total: expenses?.reduce((sum, e) => sum + e.amount, 0) || 0,
    count: expenses?.length || 0,
    avg: expenses?.length ? (expenses.reduce((sum, e) => sum + e.amount, 0) / expenses.length) : 0
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingExpense) {
        await db.expenses.update(editingExpense.id!, formData);
      } else {
        await db.expenses.add(formData as Expense);
      }
      setIsModalOpen(false);
      setEditingExpense(null);
      setFormData({ date: new Date(), category: '', amount: 0, note: '' });
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this expense record?')) {
      await db.expenses.delete(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Expense Tracking</h1>
          <p className="text-slate-500 text-sm">Manage business costs and utility payments.</p>
        </div>
        <button
          onClick={() => {
            setEditingExpense(null);
            setFormData({ date: new Date(), category: '', amount: 0, note: '' });
            setIsModalOpen(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-5 h-5" /> Log Expense
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 rounded-lg"><DollarSign className="w-6 h-6 text-red-600" /></div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Total Expenses</p>
              <h3 className="text-2xl font-bold text-slate-900">₦{stats.total.toLocaleString()}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-lg"><PieChart className="w-6 h-6 text-blue-600" /></div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Monthly Average</p>
              <h3 className="text-2xl font-bold text-slate-900">₦{stats.avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-lg"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Total Count</p>
              <h3 className="text-2xl font-bold text-slate-900">{stats.count} Records</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Filter by category or note..."
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
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Category</th>
                <th className="p-4 font-semibold">Note</th>
                <th className="p-4 font-semibold">Amount</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses?.map(expense => (
                <tr key={expense.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4 text-slate-600 font-medium">
                    {format(expense.date, 'dd MMM, yyyy')}
                  </td>
                  <td className="p-4">
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold uppercase">
                      {expense.category}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500">{expense.note || '-'}</td>
                  <td className="p-4 font-bold text-red-600">₦{expense.amount.toLocaleString()}</td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setEditingExpense(expense);
                          setFormData({ ...expense });
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(expense.id!)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    <p>No expense records found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-slate-800 mb-6">
              {editingExpense ? 'Edit Expense' : 'New Expense Entry'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  value={format(formData.date, 'yyyy-MM-dd')}
                  onChange={e => setFormData({ ...formData, date: new Date(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  required
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none bg-white"
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="">Select Category</option>
                  <option value="UTILITIES">Utilities</option>
                  <option value="SALARY">Staff Salary</option>
                  <option value="RENT">Rent/Maintenance</option>
                  <option value="STOCK">Inventory Purchase</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦)</label>
                <input
                  type="number"
                  required
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                <textarea
                  className="w-full border-slate-200 border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 h-24"
                  value={formData.note}
                  onChange={e => setFormData({ ...formData, note: e.target.value })}
                  placeholder="What was this expense for?"
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-900 shadow-lg shadow-slate-200 transition-all"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
