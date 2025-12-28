import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2, ShieldCheck, ShoppingBag } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Invalid login credentials.');
      } else {
        // Success! navigate is handled by the useEffect above
      }
    } catch (err) {
      setError('An unexpected error occurred. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      {/* Background patterns */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-indigo-200 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-100 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative">
        {/* Brand/Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-slate-900 rounded-2xl shadow-xl shadow-slate-200 mb-4 transform -rotate-6">
             <ShoppingBag className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">AK ALHERI</h1>
          <p className="text-slate-500 font-medium">Pharmacy Point Management System</p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 p-8 border border-slate-100">
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-800">Welcome Back</h2>
            <p className="text-slate-400 text-sm">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="email"
                  required
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 font-medium"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="password"
                  required
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 font-medium"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-bold flex items-center gap-3 border border-red-100 animate-shake">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white rounded-2xl py-4 font-bold text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-50 flex justify-center">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium bg-slate-50 px-4 py-2 rounded-full">
              <ShieldCheck className="w-4 h-4" /> Secure Enterprise Access
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-slate-400 text-xs font-medium uppercase tracking-widest">
          &copy; 2025 AK Alheri Chemist. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
