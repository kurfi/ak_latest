import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Wallet, 
  BarChart3, 
  Settings, 
  LogOut,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
  Menu,
  ChevronLeft
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

export const Sidebar: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      await logout();
      navigate('/login');
    }
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { icon: ShoppingCart, label: 'Point of Sale', path: '/pos', roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { icon: RotateCcw, label: 'Returns', path: '/returns', roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { icon: Package, label: 'Inventory', path: '/inventory', roles: [UserRole.ADMIN] },
    { icon: Users, label: 'Customers', path: '/customers', roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { icon: Wallet, label: 'Expenses', path: '/expenses', roles: [UserRole.ADMIN] },
    { icon: BarChart3, label: 'Reports', path: '/reports', roles: [UserRole.ADMIN] },
    { icon: Settings, label: 'Settings', path: '/settings', roles: [UserRole.ADMIN, UserRole.CASHIER] },
  ];

  return (
    <div className="w-64 bg-slate-900 text-slate-400 h-screen fixed left-0 top-0 flex flex-col z-40 border-r border-slate-800">
      {/* Brand Header */}
      <div className="p-6 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 rotate-3">
            <ShoppingCart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight leading-none">AK ALHERI</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Pharmacy Point</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          if (item.roles && !item.roles.includes(currentUser?.role as UserRole)) return null;
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                ${isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                  : 'hover:bg-slate-800 hover:text-slate-200'}
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-bold text-sm tracking-tight">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="p-4 mt-auto">
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-800 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
              {currentUser?.username[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{currentUser?.username}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{currentUser?.role}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors group"
        >
          <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-400" />
          <span className="font-bold text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
};
