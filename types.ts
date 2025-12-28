export interface Customer {
  id?: number;
  supabase_id?: string;
  name: string;
  phone: string;
  email?: string;
  creditLimit: number;
  currentDebt: number;
  updated_at?: string;
}

export interface Product {
  id?: number;
  supabase_id?: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  minStockLevel: number;
  updated_at?: string;
}

export interface Batch {
  id?: number;
  supabase_id?: string;
  productId: number; // This will need to map to product's supabase_id for online sync
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  costPrice: number;
  sellingPrice?: number;
  updated_at?: string;
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  CREDIT = 'CREDIT', // Store credit/Debt
  STORE_CREDIT = 'STORE_CREDIT', // For returns
  MULTIPAY = 'MULTIPAY'
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  HELD = 'HELD',
  CANCELLED = 'CANCELLED'
}

export interface SaleItem {
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  batchId?: number; // Optional: if we track specific batch deduction
  returnedQuantity?: number; // New: To track how many of this item have been returned
  costPrice?: number; // Calculated COGS for this item at time of sale
}

export interface Sale {
  id?: number;
  supabase_id?: string;
  customerId?: number; // This will need to map to customer's supabase_id for online sync
  customerName?: string; // denormalized for easier reporting
  date: Date;
  invoiceNumber?: string; // New: Added for tracking and search
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: PaymentMethod;
  paymentMethods?: { method: PaymentMethod; amount: number }[];
  status: SaleStatus;
  items: SaleItem[]; // SaleItem itself might need ID mapping or be embedded
  updated_at?: string;
}

export interface CustomerPayment {
  id?: number;
  supabase_id?: string;
  customerId: number; // This will need to map to customer's supabase_id for online sync
  date: Date;
  amount: number;
  paymentMethod: PaymentMethod;
  note?: string;
  updated_at?: string;
}

export interface Expense {
  id?: number;
  supabase_id?: string;
  date: Date;
  category: string;
  amount: number;
  note: string;
  status: 'PAID' | 'PENDING';
  updated_at?: string;
}

export interface Setting {
  key: string;
  value: any;
}

// --- Added for Authentication ---\nexport enum UserRole {\n  ADMIN = 'ADMIN',\n  CASHIER = 'CASHIER'\n}\n\nexport interface User {\n  id?: number;\n  supabase_id?: string;\n  username: string;\n  password?: string; // In a real app, this should be a hash, and ideally not part of the sync for security\n  role: UserRole;\n  updated_at?: string;\n}\n\n// --- New Enums for Returns ---\nexport enum ReturnReason {\n  DEFECTIVE = 'Defective Item',\n  WRONG_ITEM = 'Wrong Item Shipped',\n  CUSTOMER_CHANGED_MIND = 'Customer Changed Mind',\n  SIZE_ISSUE = 'Size Issue',\n  DAMAGED_IN_TRANSIT = 'Damaged in Transit',\n  OTHER = 'Other'\n}\n\n// --- New Interfaces for Returns ---\nexport interface Return {\n  id?: number;\n  supabase_id?: string;\n  saleId: number; // Reference to the original sale (will need to map to supabase_id)\n  customerId?: number; // Optional reference to the customer (will need to map to supabase_id)\n  customerName?: string; // Denormalized for easier display\n  staffId?: number; // New: Staff who processed the return (will need to map to user's supabase_id)\n  returnDate: Date;\n  totalRefundAmount: number;\n  reason: ReturnReason; // Changed to use ReturnReason enum\n  paymentMethod: PaymentMethod; // How the refund was issued (CASH, STORE_CREDIT, etc.)\n  notes?: string;\n  updated_at?: string;\n}\n\nexport interface ReturnedItem {\n  id?: number;\n  supabase_id?: string;\n  returnId: number; // Reference to the parent return transaction (will need to map to return's supabase_id)\n  productId: number; // (will need to map to product's supabase_id)\n  productName: string;\n  quantity: number;\n  price: number; // Price at time of return (per unit)\n  refundAmount: number; // Calculated refund for this item (quantity * price)\n  restockStatus: 'restocked' | 'damaged'; // Changed: Removed 'not_applicable', now explicitly restocked or damaged\n  valueLost?: number; // New: Value lost for damaged items\n  batchId?: number; // Optional: if a specific batch was returned from (will need to map to batch's supabase_id)\n  updated_at?: string;\n}\n\nexport interface AuditLog {\n  id?: number;\n  supabase_id?: string;\n  action: string;\n  details: string;\n  user: string; // This will likely map to the user's supabase_id or email\n  timestamp: Date;\n  updated_at?: string;\n}\n\n// --- New Interface for Synchronization Queue ---\nexport interface SyncEntry {\n  id?: number;\n  table_name: string;\n  local_id: number;\n  supabase_id?: string; // Supabase UUID if available\n  action: 'create' | 'update' | 'delete';\n  payload?: any; // The data to sync, or a partial update\n  timestamp: Date;\n  status: 'pending' | 'in_progress' | 'completed' | 'failed';\n  error?: string;\n}\n