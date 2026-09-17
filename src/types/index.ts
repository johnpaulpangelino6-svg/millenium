export type DeviceStatus = 'online' | 'offline' | 'warning' | 'maintenance';
export type DisplayModel = 'Millennium 86"' | 'Millennium 75"' | 'Millennium 65"';
export type ClientType = 'school' | 'corporate';

export interface Device {
  id: string; // e.g. 'MIL-2026-00125'
  model: DisplayModel;
  serialNumber: string;
  customerId: string;
  customerName: string;
  clientType: ClientType;
  location: string;
  city: string;
  latitude: number;
  longitude: number;
  status: DeviceStatus;
  osVersion: string; // 'Android 13 / Windows 11 Pro'
  opsSpec: string; // 'Intel Core i7-12700 / 16GB / 512GB SSD'
  ipAddress: string;
  screenLocked: boolean;
  powerScheduleOn: string; // '07:30'
  powerScheduleOff: string; // '18:00'
  wallpaperUrl: string;
  firmwareVersion: string;
  lastPing: string;
  installedAt: string;
  restartsLast7Days: number;
  temperatureC: number;
  cpuUsagePct: number;
  ramUsagePct: number;
  storageUsagePct: number;
  touchLatencyMs: number;
}

export interface Telemetry {
  id: string;
  deviceId: string;
  cpuUsagePct: number;
  ramUsagePct: number;
  storageUsagePct: number;
  temperatureC: number;
  unexpectedRestarts7d: number;
  touchLatencyMs: number;
  uptimeHours: number;
  networkLossPct: number;
  healthScore: number; // 0 - 100
  recordedAt: string;
}

export type TicketCategory =
  | 'Touchscreen'
  | 'OPS Hardware'
  | 'Software'
  | 'Display Panel'
  | 'Network'
  | 'Power Board'
  | 'Other';

export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type TicketStatus = 'Received' | 'Diagnosing' | 'Repairing' | 'Resolved' | 'Closed';

export interface TicketPartUsed {
  partId: string;
  partName: string;
  quantity: number;
}

export interface ServiceTicket {
  id: string;
  ticketNumber: string; // e.g. '#M-10245'
  deviceId: string;
  deviceModel: DisplayModel;
  customerId: string;
  customerName: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTechnician: string;
  technicianNotes: string;
  partsUsed: TicketPartUsed[];
  warrantyCovered: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface Warranty {
  id: string;
  deviceId: string;
  deviceModel: DisplayModel;
  customerName: string;
  purchaseDate: string;
  warrantyYears: number;
  expiryDate: string;
  status: 'Under Warranty' | 'Warranty Expired' | 'Void';
  coverageType: string;
  daysRemaining: number;
}

export interface InventoryPart {
  id: string;
  partCode: string;
  name: string;
  category: string;
  stockQuantity: number;
  minThreshold: number;
  unitCost: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
  lastRestocked: string;
}

export interface CmsContent {
  id: string;
  title: string;
  type: 'announcement' | 'image' | 'video' | 'presentation' | 'emergency';
  content: string;
  targetAudience: 'all' | 'schools' | 'corporate' | 'device';
  targetDeviceId?: string;
  active: boolean;
  scheduledFrom: string;
  scheduledTo: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  deviceId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface PredictiveAlert {
  id: string;
  deviceId: string;
  deviceModel: DisplayModel;
  customerName: string;
  riskLevel: 'High' | 'Moderate' | 'Low';
  riskFactor: string;
  unexpectedRestarts: number;
  temperatureC: number;
  uptimeHours: number;
  recommendedAction: string;
  timestamp: string;
}

export interface DashboardStats {
  totalDevices: number;
  devicesOnline: number;
  devicesOffline: number;
  devicesWarning: number;
  devicesMaintenance: number;
  totalCustomers: number;
  schoolClients: number;
  corporateClients: number;
  openTickets: number;
  resolvedTickets: number;
  criticalTickets: number;
  warrantyExpiringSoon: number;
  lowStockParts: number;
  recentActivity: string[];
  avgResponseTime: string;
}

export type UserRole = 'admin' | 'technician' | 'customer';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  location: string;           // Primary assigned location e.g. 'All Locations' or 'Quezon City'
  allowedLocations: string[];  // Accessible locations e.g. ['Quezon City', 'Taguig (BGC)']
  avatar?: string;
  organization?: string;
  customerId?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Customer {
  id: string;
  organizationName: string;
  clientType: ClientType;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  createdAt?: string;
  deviceCount?: number;
}

