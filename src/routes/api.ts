import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';

export const apiRouter = Router();

const getParam = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /api/auth/login
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const result = await db.loginUser(username, password);
    if (!result.success) {
      return res.status(401).json({ success: false, error: result.error });
    }
    res.json({ success: true, user: result.user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/register
apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, fullName, role, location, organization } = req.body;
    if (!username || !email || !password || !fullName || !role || !location) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }
    if (!['technician', 'customer'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role. Only technician or customer accounts can self-register.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }
    const result = await db.registerUser({ username, email, password, fullName, role, location, organization });
    if (!result.success) {
      return res.status(409).json({ success: false, error: result.error });
    }

    // If role is customer, ensure customer organization exists in customers table
    if (role === 'customer' && organization && organization.trim()) {
      const allCustomers = await db.getCustomers();
      const match = allCustomers.find(
        (c) => c.organizationName.toLowerCase() === organization.trim().toLowerCase()
      );
      if (!match) {
        await db.addCustomer({
          organizationName: organization.trim(),
          clientType: organization.toLowerCase().includes('inc') || organization.toLowerCase().includes('corp') || organization.toLowerCase().includes('bank') ? 'corporate' : 'school',
          contactPerson: fullName,
          email: email,
          city: location && location !== 'All Locations' ? location : 'Metro Manila',
        });
      }
    }

    res.status(201).json({ success: true, user: result.user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/users (admin only — returns safe list without passwordHash)
apiRouter.get('/auth/users', async (req: Request, res: Response) => {
  try {
    const users = (await db.getUsers()).map(({ passwordHash, ...u }: any) => u);
    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/users (admin create user)
apiRouter.post('/auth/users', async (req: Request, res: Response) => {
  try {
    const { username, email, password, fullName, role, location, organization } = req.body;
    if (!username || !email || !password || !fullName || !role) {
      return res.status(400).json({ success: false, error: 'Username, email, password, full name, and role are required.' });
    }
    const result = await db.createUser({
      username,
      email,
      password,
      fullName,
      role,
      location: location || 'All Locations',
      organization: organization || '',
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.status(201).json({ success: true, data: result.user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/auth/users/:id (admin update user)
apiRouter.patch('/auth/users/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { fullName, email, role, location, organization, password } = req.body;
    const result = await db.updateUser(id, { fullName, email, role, location, organization, password });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, data: result.user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/auth/users/:id (admin delete user)
apiRouter.delete('/auth/users/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const ok = await db.deleteUser(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Dashboard Stats ---
apiRouter.get('/stats/dashboard', async (req: Request, res: Response) => {
  try {
    const stats = await db.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Devices ---
apiRouter.get('/devices', async (req: Request, res: Response) => {
  try {
    let devices = await db.getDevices();
    const { status, model, clientType, search } = req.query;

    if (status) {
      devices = devices.filter((d) => d.status.toLowerCase() === (status as string).toLowerCase());
    }
    if (model) {
      devices = devices.filter((d) => d.model.toLowerCase().includes((model as string).toLowerCase()));
    }
    if (clientType) {
      devices = devices.filter((d) => d.clientType.toLowerCase() === (clientType as string).toLowerCase());
    }
    if (search) {
      const q = (search as string).toLowerCase();
      devices = devices.filter(
        (d) =>
          d.id.toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q) ||
          d.location.toLowerCase().includes(q) ||
          d.city.toLowerCase().includes(q) ||
          d.serialNumber.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: devices, count: devices.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/devices/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const device = await db.getDeviceById(id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    const warranty = await db.getWarrantyByDevice(device.id);
    const allTickets = await db.getTickets();
    const tickets = allTickets.filter((t) => t.deviceId.toLowerCase() === device.id.toLowerCase());
    const auditLogs = await db.getAuditLogs(device.id);

    res.json({ success: true, data: { ...device, warranty, tickets, auditLogs } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/devices', async (req: Request, res: Response) => {
  try {
    const { model, customerName, customerId, clientType, location, city, osVersion, opsSpec, createdByUserId, createdByUserName } = req.body;
    if (!model || (!customerName && !customerId) || !location) {
      return res.status(400).json({ success: false, error: 'Model, customer, and location are required.' });
    }

    let targetCustId = customerId;
    let targetCustName = customerName;
    let targetClientType = clientType || 'school';
    let targetCity = city || 'Metro Manila';

    if (targetCustId) {
      const found = await db.getCustomerById(targetCustId);
      if (found) {
        targetCustName = found.organizationName;
        targetClientType = found.clientType;
        targetCity = found.city || targetCity;
      }
    } else if (targetCustName) {
      const allCustomers = await db.getCustomers();
      const found = allCustomers.find(
        (c) => c.organizationName.toLowerCase() === targetCustName.trim().toLowerCase()
      );
      if (found) {
        targetCustId = found.id;
        targetCustName = found.organizationName;
        targetClientType = found.clientType;
        targetCity = found.city || targetCity;
      } else {
        const created = await db.addCustomer({
          organizationName: targetCustName.trim(),
          clientType: targetClientType,
          city: targetCity,
        });
        targetCustId = created.id;
      }
    }

    const nextNum = Math.floor(100 + Math.random() * 900);
    const year = new Date().getFullYear();
    const id = `MIL-${year}-00${nextNum}`;
    const serialNumber = `SN-MIL${model.includes('86') ? '86' : model.includes('75') ? '75' : '65'}-${year}-00${nextNum}`;

    const newDevice = await db.addDevice({
      id,
      model,
      serialNumber,
      customerId: targetCustId || 'CUST-001',
      customerName: targetCustName,
      clientType: targetClientType,
      location,
      city: targetCity,
      latitude: 14.5995 + (Math.random() - 0.5) * 0.1,
      longitude: 121.0369 + (Math.random() - 0.5) * 0.1,
      status: 'online',
      osVersion: osVersion || 'Android 13 / Windows 11 Pro',
      opsSpec: opsSpec || 'Intel Core i7-12700 / 16GB / 512GB SSD',
      ipAddress: `192.168.${Math.floor(10 + Math.random() * 190)}.${Math.floor(2 + Math.random() * 250)}`,
      screenLocked: false,
      powerScheduleOn: '07:30',
      powerScheduleOff: '18:00',
      wallpaperUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
      firmwareVersion: 'v4.2.1-stable',
      lastPing: new Date().toISOString(),
      installedAt: new Date().toISOString().split('T')[0],
      restartsLast7Days: 0,
      temperatureC: 44.5,
      cpuUsagePct: 20,
      ramUsagePct: 40,
      storageUsagePct: 25,
      touchLatencyMs: 4.0,
      createdByUserId: createdByUserId || '',
      createdByUserName: createdByUserName || 'System',
    });

    res.status(201).json({ success: true, data: newDevice });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.delete('/devices/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const ok = await db.deleteDevice(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Device not found.' });
    }
    res.json({ success: true, message: 'Device permanently deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/devices/:id/remote-action', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { action, payload } = req.body;
    if (!action) {
      return res.status(400).json({ success: false, error: 'Action parameter is required.' });
    }
    const result = await db.triggerRemoteAction(id, action, payload);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.patch('/devices/:id/assign', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { customerId, location, city } = req.body;
    if (!customerId) {
      return res.status(400).json({ success: false, error: 'customerId is required to assign device.' });
    }
    const result = await db.assignDeviceToCustomer(id, customerId, location, city);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true, data: result.device, message: 'Device successfully assigned to customer.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Customers (Schools & Corporate Clients) ---
apiRouter.get('/customers', async (req: Request, res: Response) => {
  try {
    const customers = await db.getCustomers();
    res.json({ success: true, data: customers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const customer = await db.getCustomerById(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }
    res.json({ success: true, data: customer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    const { organizationName, clientType, contactPerson, email, phone, address, city } = req.body;
    if (!organizationName) {
      return res.status(400).json({ success: false, error: 'Organization name is required.' });
    }
    const customer = await db.addCustomer({
      organizationName,
      clientType,
      contactPerson,
      email,
      phone,
      address,
      city: city || 'Metro Manila',
    });
    res.status(201).json({ success: true, data: customer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.patch('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const updated = await db.updateCustomer(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const ok = await db.deleteCustomer(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }
    res.json({ success: true, message: 'Customer organization deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Service Tickets ---
apiRouter.get('/tickets', async (req: Request, res: Response) => {
  try {
    let tickets = await db.getTickets();
    const { status, priority, category, deviceId } = req.query;

    if (status)   tickets = tickets.filter((t) => t.status.toLowerCase()   === (status as string).toLowerCase());
    if (priority) tickets = tickets.filter((t) => t.priority.toLowerCase() === (priority as string).toLowerCase());
    if (category) tickets = tickets.filter((t) => t.category.toLowerCase() === (category as string).toLowerCase());
    if (deviceId) tickets = tickets.filter((t) => t.deviceId.toLowerCase() === (deviceId as string).toLowerCase());

    res.json({ success: true, data: tickets, count: tickets.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/tickets', async (req: Request, res: Response) => {
  try {
    const { deviceId, title, description, category, priority, assignedTechnician, assignedTechnicianId, createdByUserId, createdByUserName } = req.body;
    if (!deviceId || !title || !description) {
      return res.status(400).json({ success: false, error: 'Device ID, title, and description are required.' });
    }

    const device = await db.getDeviceById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Referenced Millennium Device does not exist.' });
    }

    const newTicket = await db.createTicket({
      deviceId: device.id,
      deviceModel: device.model,
      customerId: device.customerId,
      customerName: device.customerName,
      title,
      description,
      category: category || 'Touchscreen',
      priority: priority || 'Medium',
      status: 'Received',
      assignedTechnician: assignedTechnician || 'Unassigned',
      assignedTechnicianId: assignedTechnicianId || '',
      technicianNotes: 'Ticket logged. Awaiting technician assignment.',
      partsUsed: [],
      warrantyCovered: true,
      createdByUserId: createdByUserId || '',
      createdByUserName: createdByUserName || 'System',
    });

    res.status(201).json({ success: true, data: newTicket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.delete('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const ok = await db.deleteTicket(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
    res.json({ success: true, message: 'Ticket permanently deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.patch('/tickets/:id/status', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { status, technicianNotes } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required.' });
    }
    const updated = await db.updateTicketStatus(id, status, technicianNotes);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/tickets/:id/use-part', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { partId, quantity, technicianName } = req.body;
    if (!partId || !quantity) {
      return res.status(400).json({ success: false, error: 'Part ID and quantity are required.' });
    }
    const result = await db.usePartForTicket(id, partId, Number(quantity), technicianName || 'John Santos');
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true, message: result.message, ticket: await db.getTicketById(id) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Warranties ---
apiRouter.get('/warranties', async (req: Request, res: Response) => {
  try {
    const warranties = await db.getWarranties();
    res.json({ success: true, data: warranties });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/warranties/check/:deviceId', async (req: Request, res: Response) => {
  try {
    const deviceId = getParam(req.params.deviceId);
    const warranty = await db.getWarrantyByDevice(deviceId);
    if (!warranty) {
      return res.status(404).json({ success: false, error: 'No warranty contract found for this device.' });
    }
    res.json({ success: true, data: warranty });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Inventory ---
apiRouter.get('/inventory', async (req: Request, res: Response) => {
  try {
    const inventory = await db.getInventory();
    res.json({ success: true, data: inventory });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/inventory', async (req: Request, res: Response) => {
  try {
    const { partCode, name, category, stockQuantity, minThreshold, unitCost } = req.body;
    if (!partCode || !name || !category) {
      return res.status(400).json({ success: false, error: 'Part code, name, and category are required.' });
    }

    // Generate ID
    const existingParts = await db.getInventory();
    const nextNum = existingParts.length + 1;
    const id = `PART-${String(nextNum).padStart(3, '0')}`;

    const status = (stockQuantity || 0) === 0 ? 'Out of Stock' : 
                   (stockQuantity || 0) < (minThreshold || 5) ? 'Low Stock' : 'In Stock';

    const newPart = await db.addInventoryPart({
      id,
      partCode,
      name,
      category,
      stockQuantity: stockQuantity || 0,
      minThreshold: minThreshold || 5,
      unitCost: unitCost || 0,
      status,
      lastRestocked: new Date().toISOString().split('T')[0],
    });

    res.status(201).json({ success: true, data: newPart });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.patch('/inventory/:id/stock', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { stockQuantity } = req.body;
    if (stockQuantity === undefined) {
      return res.status(400).json({ success: false, error: 'stockQuantity is required.' });
    }
    const updated = await db.updatePartStock(id, Number(stockQuantity));
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Part not found.' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.delete('/inventory/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const ok = await db.deleteInventoryPart(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Inventory part not found.' });
    }
    res.json({ success: true, message: 'Inventory part permanently deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- CMS ---
apiRouter.get('/cms', async (req: Request, res: Response) => {
  try {
    const cms = await db.getCms();
    res.json({ success: true, data: cms });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/cms', async (req: Request, res: Response) => {
  try {
    const { title, type, content, targetAudience, targetDeviceId, scheduledFrom, scheduledTo } = req.body;
    if (!title || !type || !content) {
      return res.status(400).json({ success: false, error: 'Title, type, and content are required.' });
    }
    const newItem = await db.addCms({
      title, type, content,
      targetAudience: targetAudience || 'all',
      targetDeviceId,
      active: true,
      scheduledFrom: scheduledFrom || new Date().toISOString().split('T')[0],
      scheduledTo: scheduledTo || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    });
    res.status(201).json({ success: true, data: newItem });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.patch('/cms/:id/toggle', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const updated = await db.toggleCms(id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'CMS item not found.' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.delete('/cms/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const ok = await db.deleteCms(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'CMS item not found.' });
    }
    res.json({ success: true, message: 'Content removed successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- AI Predictive Maintenance Alerts ---
apiRouter.get('/predictive/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = await db.getPredictiveAlerts();
    res.json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/predictive/simulate-telemetry', async (req: Request, res: Response) => {
  try {
    const { deviceId, temperatureSpike, restartSpike } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required.' });
    }
    const alert = await db.simulateTelemetryAnomaly(
      deviceId,
      Number(temperatureSpike || 85.5),
      Number(restartSpike || 10)
    );
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Device not found.' });
    }
    res.json({ success: true, data: alert, message: 'Telemetry anomaly injected into AI predictive engine!' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Audit Logs ---
apiRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const deviceId = req.query.deviceId as string | undefined;
    const logs = await db.getAuditLogs(deviceId);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
