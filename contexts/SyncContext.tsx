import React, { createContext, useContext, useEffect, useState } from 'react';
import { startSyncService, syncData, subscribeToSyncStatus, SyncStatus } from '../services/syncService';
import { useAuth } from '../auth/AuthContext';

interface SyncContextType {
  status: SyncStatus;
  forceSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const { currentUser } = useAuth();

  useEffect(() => {
    // Only start sync if a user is logged in
    if (currentUser) {
      console.log("User logged in, starting sync service...");
      startSyncService();
      
      const unsubscribe = subscribeToSyncStatus((newStatus) => {
        setStatus(newStatus);
      });

      return () => {
        unsubscribe();
      };
    }
  }, [currentUser]);

  const forceSync = async () => {
    await syncData();
  };

  return (
    <SyncContext.Provider value={{ status, forceSync }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
