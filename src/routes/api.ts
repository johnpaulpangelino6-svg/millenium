import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { db } from '../db/database-supabase.js';

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
    let { username, email, password, fullName, role, location, organization } = req.body;
    if (!username || !email || !password || !fullName || !role) {
      return res.status(400).json({ success: false, error: 'All required fields must be filled.' });
    }

    username = String(username).trim().toLowerCase();
    email = String(email).trim().toLowerCase();
    fullName = String(fullName).trim();
    location = (location && String(location).trim()) || 'Quezon City';

    if (!['technician', 'customer'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role. Only technician or customer accounts can self-register.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    // Determine organization automatically so customer accounts are never orphaned
    let orgName = (organization && String(organization).trim()) || '';
    if (role === 'customer' && !orgName) {
      orgName = `${fullName}'s Organization`;
    } else if (role === 'technician' && !orgName) {
      orgName = 'Brains Infinite Innovations';
    }

    const result = await db.registerUser({
      username,
      email,
      password,
      fullName,
      role,
      location,
      organization: orgName,
    });

    if (!result.success) {
      return res.status(409).json({ success: false, error: result.error });
    }

    // If role is customer, automatically ensure customer organization exists in customers table
    if (role === 'customer' && orgName) {
      const allCustomers = await db.getCustomers();
      const match = allCustomers.find(
        (c) => c.organizationName.toLowerCase() === orgName.toLowerCase()
      );
      if (!match) {
        await db.addCustomer({
          organizationName: orgName,
          clientType: orgName.toLowerCase().includes('inc') || orgName.toLowerCase().includes('corp') || orgName.toLowerCase().includes('bank') ? 'corporate' : 'school',
          contactPerson: fullName,
          email: email,
          city: location && location !== 'All Locations' ? location : 'Metro Manila',
        });
      }
    }

    // Automatically record in audit log
    await db.logAudit({
      userName: fullName,
      action: 'User Self-Registered',
      details: `New ${role} account created for ${fullName} (${email}) - Organization: ${orgName}`
    });

    console.log(`  ✅ Registered new ${role}: ${username} (${email}) -> Automatically stored to database.`);
    res.status(201).json({ success: true, user: result.user });
  } catch (error: any) {
    console.error('Registration Error:', error);
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
    const success = await db.deleteUser(id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// OAUTH ROUTES - Google, Facebook, Apple
// ============================================================

// Google OAuth
apiRouter.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

apiRouter.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req: Request, res: Response) => {
    const user: any = req.user;
    
    // If user needs role selection, redirect to role selection page
    if (user && user.needsRoleSelection) {
      // Store OAuth data in session
      (req.session as any).oauthData = user;
      return res.redirect('/#oauth-role-selection');
    }
    
    // User exists, redirect to app with user data
    const userData = encodeURIComponent(JSON.stringify(user));
    res.redirect(`/#oauth-success?user=${userData}`);
  }
);

// Facebook OAuth
apiRouter.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));

apiRouter.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  (req: Request, res: Response) => {
    const user: any = req.user;
    
    if (user && user.needsRoleSelection) {
      (req.session as any).oauthData = user;
      return res.redirect('/#oauth-role-selection');
    }
    
    const userData = encodeURIComponent(JSON.stringify(user));
    res.redirect(`/#oauth-success?user=${userData}`);
  }
);

// Apple OAuth
apiRouter.get('/auth/apple', passport.authenticate('apple', { scope: ['email', 'name'] }));

apiRouter.post('/auth/apple/callback',
  passport.authenticate('apple', { failureRedirect: '/' }),
  (req: Request, res: Response) => {
    const user: any = req.user;
    
    if (user && user.needsRoleSelection) {
      (req.session as any).oauthData = user;
      return res.redirect('/#oauth-role-selection');
    }
    
    const userData = encodeURIComponent(JSON.stringify(user));
    res.redirect(`/#oauth-success?user=${userData}`);
  }
);

// Complete OAuth registration with role selection
apiRouter.post('/auth/oauth/complete', async (req: Request, res: Response) => {
  try {
    const { role, location, organization } = req.body;
    const oauthData = (req.session as any).oauthData;
    
    if (!oauthData) {
      return res.status(400).json({ success: false, error: 'No OAuth session found' });
    }
    
    if (!role || !['technician', 'customer'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Valid role is required' });
    }
    
    // Determine organization
    let orgName = (organization && String(organization).trim()) || '';
    if (role === 'customer' && !orgName) {
      orgName = `${oauthData.fullName}'s Organization`;
    } else if (role === 'technician' && !orgName) {
      orgName = 'Brains Infinite Innovations';
    }
    
    // Create user in database
    const result = await db.registerOAuthUser({
      email: oauthData.email,
      fullName: oauthData.fullName,
      role,
      location: location || 'Quezon City',
      organization: orgName,
      oauthProvider: oauthData.provider,
      oauthProviderId: oauthData.providerId,
      profilePhoto: oauthData.profilePhoto || null,
    });
    
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    
    // If customer, create customer organization
    if (role === 'customer' && orgName) {
      const allCustomers = await db.getCustomers();
      const match = allCustomers.find(
        (c) => c.organizationName.toLowerCase() === orgName.toLowerCase()
      );
      if (!match) {
        await db.addCustomer({
          organizationName: orgName,
          clientType: orgName.toLowerCase().includes('inc') || orgName.toLowerCase().includes('corp') ? 'corporate' : 'school',
          contactPerson: oauthData.fullName,
          email: oauthData.email,
          city: location || 'Metro Manila',
        });
      }
    }
    
    // Log audit
    await db.logAudit({
      userName: oauthData.fullName,
      action: 'OAuth User Registered',
      details: `New ${role} account via ${oauthData.provider} - ${oauthData.email}`
    });
    
    // Clear OAuth session data
    delete (req.session as any).oauthData;
    
    console.log(`  ✅ OAuth registration complete: ${oauthData.email} as ${role}`);
    res.json({ success: true, user: result.user });
  } catch (error: any) {
    console.error('OAuth completion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get OAuth session data
apiRouter.get('/auth/oauth/session', (req: Request, res: Response) => {
  const oauthData = (req.session as any).oauthData;
  if (!oauthData) {
    return res.status(404).json({ success: false, error: 'No OAuth session found' });
  }
  res.json({ success: true, data: oauthData });
});

apiRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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
    const { model, customerName, customerId, clientType, location, city, osVersion, opsSpec } = req.body;
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
    const { status, priority, category, deviceId, userId, userRole } = req.query;

    // Role-based filtering
    if (userRole === 'technician' && userId) {
      // Technicians only see tickets assigned to them
      tickets = tickets.filter((t) => t.assignedTechnicianId === userId);
    } else if (userRole === 'customer' && userId) {
      // Customers only see their own tickets
      // Find customer's organization and devices
      const users = await db.getUsers();
      const user = users.find(u => u.id === userId);
      
      if (user) {
        const userOrg = (user.organization || '').trim().toLowerCase();
        const userCustId = (user.customerId || '').trim().toLowerCase();
        
        // Find matched customer record
        const customers = await db.getCustomers();
        const matchedCustomer = customers.find(c =>
          (userCustId && c.id.toLowerCase() === userCustId) ||
          (userOrg && c.organizationName.toLowerCase() === userOrg)
        );
        
        // Get customer's devices
        const devices = await db.getDevices();
        const customerDeviceIds = new Set(
          devices
            .filter(d => {
              const devCustId = (d.customerId || '').trim().toLowerCase();
              const devCustName = (d.customerName || '').trim().toLowerCase();
              if (matchedCustomer && devCustId === matchedCustomer.id.toLowerCase()) return true;
              if (userCustId && devCustId === userCustId) return true;
              if (userOrg && devCustName === userOrg) return true;
              return false;
            })
            .map(d => d.id)
        );
        
        // Filter tickets by customer's devices or organization name
        tickets = tickets.filter(t => {
          const tCustName = (t.customerName || '').trim().toLowerCase();
          if (userOrg && tCustName === userOrg) return true;
          if (customerDeviceIds.has(t.deviceId)) return true;
          return false;
        });
      }
    }
    // If admin or no userRole specified, show all tickets (default behavior)

    // Apply additional filters
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
    const { deviceId, title, description, category, priority, assignedTechnician } = req.body;
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
      technicianNotes: 'Ticket logged. Awaiting technician assignment.',
      partsUsed: [],
      warrantyCovered: true,
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

// POST /api/tickets/:id/assign - Assign ticket to technician (Admin only)
apiRouter.post('/tickets/:id/assign', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { technicianId, technicianName } = req.body;
    
    if (!technicianId || !technicianName) {
      return res.status(400).json({ success: false, error: 'Technician ID and name are required.' });
    }
    
    // Verify technician exists
    const users = await db.getUsers();
    const technician = users.find(u => u.id === technicianId && u.role === 'technician');
    if (!technician) {
      return res.status(404).json({ success: false, error: 'Technician not found.' });
    }
    
    const updated = await db.assignTicketToTechnician(id, technicianId, technicianName);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
    
    res.json({ success: true, data: updated, message: `Ticket assigned to ${technicianName}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/tickets/:id/messages - Get private chat messages for a ticket
apiRouter.get('/tickets/:id/messages', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    
    // Verify ticket exists
    const ticket = await db.getTicketById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
    
    const messages = await db.getTicketMessages(id);
    res.json({ success: true, data: messages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tickets/:id/messages - Send a message in ticket chat
apiRouter.post('/tickets/:id/messages', async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params.id);
    const { senderId, senderName, senderRole, message } = req.body;
    
    if (!senderId || !senderName || !senderRole || !message) {
      return res.status(400).json({ success: false, error: 'Sender ID, name, role, and message are required.' });
    }
    
    // Verify ticket exists
    const ticket = await db.getTicketById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
    
    // Verify sender is admin or assigned technician
    if (senderRole !== 'admin' && senderRole !== 'technician') {
      return res.status(403).json({ success: false, error: 'Only admin and technicians can send messages.' });
    }
    
    if (senderRole === 'technician' && ticket.assignedTechnicianId !== senderId) {
      return res.status(403).json({ success: false, error: 'Only the assigned technician can send messages.' });
    }
    
    const newMessage = await db.addTicketMessage(id, senderId, senderName, senderRole, message);
    res.status(201).json({ success: true, data: newMessage });
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
    const updated = await db.updateInventoryPart(id, { stockQuantity: Number(stockQuantity) });
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
    const cms = await db.getCmsById(id);
    if (!cms) {
      return res.status(404).json({ success: false, error: 'CMS item not found.' });
    }
    const updated = await db.updateCms(id, { active: !cms.active });
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
    await db.simulateTelemetryAnomaly(
      deviceId,
      Number(temperatureSpike || 85.5),
      Number(restartSpike || 10)
    );
    res.json({ success: true, message: 'Telemetry anomaly simulated.' });
    res.json({ success: true, message: 'Telemetry anomaly simulated.' });
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
