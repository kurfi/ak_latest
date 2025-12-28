import React from 'react';
import { ShoppingBag, Loader2 } from 'lucide-react';

export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center z-[999]">
      <div className="relative">
        <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 rotate-6 animate-pulse">
          <ShoppingBag className="w-12 h-12 text-white" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
        </div>
      </div>
      <div className="mt-8 text-center space-y-2">
        <h1 className="text-3xl font-black text-white tracking-tighter">AK ALHERI</h1>
        <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Initializing Pharmacy POS</p>
      </div>
      
      <div className="absolute bottom-12 text-slate-600 text-xs font-medium uppercase tracking-widest">
        Enterprise Edition v2.1.0
      </div>
    </div>
  );
};
