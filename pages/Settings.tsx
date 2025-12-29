
import React, { useState } from 'react';
import { db, logAudit, clearAuditLogs } from '../db/db';
import { User, UserRole, SyncLog } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { Shield, UserPlus, Key, Trash2, Edit, X, RefreshCw, Server, History, CheckCircle2, AlertCircle, Database, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { format } from 'date-fns';
import { useSync } from '../contexts/SyncContext';
import { useToast } from '../contexts/ToastContext';

const Settings: React.FC = () => {
  const { currentUser } = useAuth();
  const { syncStatus, lastSyncTime, syncLogs } = useSync();
  const { showToast } = useToast();
  
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  
  const [addUserForm, setAddUserForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: UserRole.CASHIER,
    error: ''
  });

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    role: UserRole.CASHIER,
    password: '',
    confirmPassword: '',
    error: ''
  });

  const [changePasswordForm, setChangePasswordForm] = useState({
    password: '',
    confirmPassword: '',
    loading: false,
    error: ''
  });

  const [auditLogSearch, setAuditLogSearch] = useState('');

  const users = useLiveQuery(() => db.users.toArray());
  const auditLogs = useLiveQuery(() => 
    auditLogSearch
      ? db.auditLogs.where('action').startsWithIgnoreCase(auditLogSearch).or('details').startsWithIgnoreCase(auditLogSearch).reverse().limit(100).toArray()
      : db.auditLogs.orderBy('timestamp').reverse().limit(100).toArray()
  , [auditLogSearch]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addUserForm.password !== addUserForm.confirmPassword) {
      setAddUserForm({ ...addUserForm, error: 'Passwords do not match' });
      return;
    }

    try {
      const existing = await db.users.where('username').equals(addUserForm.username).first();
      if (existing) {
        setAddUserForm({ ...addUserForm, error: 'Username already exists' });
        return;
      }

      await db.users.add({
        username: addUserForm.username,
        email: addUserForm.email,
        password: addUserForm.password,
        role: addUserForm.role,
        createdAt: new Date()
      });

      await logAudit('USER_CREATED', `Created new user: ${addUserForm.username} (${addUserForm.role})`, currentUser?.username || 'System');
      
      setIsAddUserModalOpen(false);
      setAddUserForm({ username: '', email: '', password: '', confirmPassword: '', role: UserRole.CASHIER, error: '' });
      showToast('User created successfully', 'success');
    } catch (error) {
      showToast('Failed to create user', 'error');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (editUserForm.password && editUserForm.password !== editUserForm.confirmPassword) {
      setEditUserForm({ ...editUserForm, error: 'Passwords do not match' });
      return;
    }

    try {
      const updates: any = { role: editUserForm.role };
      if (editUserForm.password) updates.password = editUserForm.password;

      await db.users.update(editingUser.id!, updates);
      await logAudit('USER_UPDATED', `Updated user: ${editingUser.username}`, currentUser?.username || 'System');
      
      setIsEditUserModalOpen(false);
      setEditingUser(null);
      showToast('User updated successfully', 'success');
    } catch (error) {
      showToast('Failed to update user', 'error');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      showToast('Cannot delete yourself!', 'error');
      return;
    }

    if (window.confirm(`Delete user ${user.username}?`)) {
      await db.users.delete(user.id!);
      await logAudit('USER_DELETED', `Deleted user: ${user.username}`, currentUser?.username || 'System');
      showToast('User deleted', 'success');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changePasswordForm.password !== changePasswordForm.confirmPassword) {
      setChangePasswordForm(p => ({ ...p, error: 'Passwords do not match' }));
      return;
    }

    setChangePasswordForm(p => ({ ...p, loading: true, error: '' }));
    try {
      await db.users.update(currentUser!.id!, { password: changePasswordForm.password });
      await logAudit('PASSWORD_CHANGED', `User ${currentUser?.username} changed their password`, currentUser?.username || 'System');
      
      setIsChangePasswordModalOpen(false);
      setChangePasswordForm({ password: '', confirmPassword: '', loading: false, error: '' });
      showToast('Password changed successfully', 'success');
    } catch (error) {
      setChangePasswordForm(p => ({ ...p, loading: false, error: 'Failed to update password' }));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">System Settings</h1>
        <button
          onClick={() => setIsChangePasswordModalOpen(true)}
          className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 shadow-sm text-sm font-medium"
        >
          <Key className="w-4 h-4" /> Change My Password
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* User Management */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-500" /> User Management
            </h2>
            <button
              onClick={() => setIsAddUserModalOpen(true)}
              className="text-indigo-600 hover:text-indigo-700 text-sm font-bold flex items-center gap-1"
            >
              <UserPlus className="w-4 h-4" /> New User
            </button>
          </div>
          
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-4 font-bold">Username</th>
                    <th className="p-4 font-bold">Role</th>
                    <th className="p-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users?.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-medium text-slate-800">{user.username}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${user.role === UserRole.ADMIN ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => {
                              setEditingUser(user);
                              setEditUserForm({ role: user.role, password: '', confirmPassword: '', error: '' });
                              setIsEditUserModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteUser(user)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sync Status */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" /> Cloud Synchronization
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${syncStatus === 'syncing' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  <RefreshCw className={`w-6 h-6 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Status: {syncStatus.toUpperCase()}</p>
                  <p className="text-xs text-slate-500">Last Synced: {lastSyncTime ? format(lastSyncTime, 'MMM dd, HH:mm:ss') : 'Never'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> Recent Sync Activities
              </h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {syncLogs && syncLogs.length > 0 ? (
                  syncLogs.map((log: SyncLog, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-white border border-slate-100 rounded-lg text-[11px]">
                      <div className="flex items-center gap-2">
                        {log.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                        <span className="font-bold text-slate-700">{log.entity.toUpperCase()}</span>
                        <span className="text-slate-400">({log.operation})</span>
                      </div>
                      <span className="text-slate-400 font-mono">{format(log.timestamp, 'HH:mm:ss')}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-8 text-slate-400 text-xs italic">No sync logs available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" /> System Logs (Audit)
          </h2>
          <div className="relative w-full md:w-64">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
             <input 
                placeholder="Search logs..." 
                className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                value={auditLogSearch}
                onChange={(e) => setAuditLogSearch(e.target.value)}
             />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="p-4 font-bold">Timestamp</th>
                  <th className="p-4 font-bold">User</th>
                  <th className="p-4 font-bold">Action</th>
                  <th className="p-4 font-bold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs?.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-500 font-mono whitespace-nowrap">{format(log.timestamp, 'MMM dd, HH:mm:ss')}</td>
                    <td className="p-4 font-bold text-slate-700">{log.user}</td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-bold uppercase text-[9px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 min-w-[200px]">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button 
              onClick={async () => {
                if(confirm('Clear all system logs? This cannot be undone.')) {
                  await clearAuditLogs();
                  showToast('Audit logs cleared', 'success');
                }
              }}
              className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Audit History
            </button>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">Add New User</h2>
              <button onClick={() => setIsAddUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Username</label>
                <input required value={addUserForm.username} onChange={e => setAddUserForm(p => ({ ...p, username: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Email (for Login)</label>
                <input type="email" required value={addUserForm.email} onChange={e => setAddUserForm(p => ({ ...p, email: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg placeholder:text-slate-400 text-sm" placeholder="user@example.com" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Password</label>
                <input required type="password" value={addUserForm.password} onChange={e => setAddUserForm(p => ({ ...p, password: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input required type="password" value={addUserForm.confirmPassword} onChange={e => setAddUserForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Role</label>
                <select value={addUserForm.role} onChange={e => setAddUserForm(p => ({ ...p, role: e.target.value as UserRole }))} className="w-full border-slate-300 border p-2 rounded-lg bg-white text-sm">
                  <option value={UserRole.CASHIER}>Cashier</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>
              {addUserForm.error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{addUserForm.error}</p>}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsAddUserModalOpen(false)} className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs md:text-sm font-bold">Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditUserModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">Edit User: {editingUser.username}</h2>
              <button onClick={() => setIsEditUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Role</label>
                <select value={editUserForm.role} onChange={e => setEditUserForm(p => ({ ...p, role: e.target.value as UserRole }))} className="w-full border-slate-300 border p-2 rounded-lg bg-white text-sm">
                  <option value={UserRole.CASHIER}>Cashier</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>
              <p className="text-[10px] md:text-xs text-slate-500 border-t border-slate-100 pt-4 italic text-center">Leave password blank to keep current.</p>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input type="password" value={editUserForm.password} onChange={e => setEditUserForm(p => ({ ...p, password: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input type="password" value={editUserForm.confirmPassword} onChange={e => setEditUserForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              {editUserForm.error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{editUserForm.error}</p>}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsEditUserModalOpen(false)} className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs md:text-sm font-bold">Update User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isChangePasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">Change Password</h2>
              <button
                onClick={() => setIsChangePasswordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
                disabled={changePasswordForm.loading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input
                  required
                  type="password"
                  value={changePasswordForm.password}
                  onChange={e => setChangePasswordForm(p => ({ ...p, password: e.target.value, error: '' }))}
                  className="w-full border-slate-300 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                <input
                  required
                  type="password"
                  value={changePasswordForm.confirmPassword}
                  onChange={e => setChangePasswordForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))}
                  className="w-full border-slate-300 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Confirm new password"
                />
              </div>

              {changePasswordForm.error && (
                <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 italic">
                  {changePasswordForm.error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100"
                  disabled={changePasswordForm.loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs md:text-sm font-bold disabled:opacity-50 flex items-center gap-2"
                  disabled={changePasswordForm.loading}
                >
                  {changePasswordForm.loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;