import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import fs from "fs";

async function startServer() {
  dotenv.config();
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "change-me-in-production";

  app.use(express.json({ limit: '50mb' }));

  // Session management
  interface Session {
    sock: any;
    qrCode: string | null;
    connectionStatus: 'connecting' | 'open' | 'close' | 'qr';
    contactsStore: any;
    groupsStore: any;
    groupsCache: any;
    lastGroupFetch: number;
    userName: string | null;
  }

  const sessions = new Map<string, Session>();
  const GROUP_CACHE_TTL = 5 * 60 * 1000;

  const hasAdminConfig = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);

  const secureEquals = (a: string, b: string): boolean => {
    const aBuffer = Buffer.from(a, "utf-8");
    const bBuffer = Buffer.from(b, "utf-8");
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
  };

  const createAdminToken = () => {
    const payload = {
      username: ADMIN_USERNAME,
      exp: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
    };
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(payloadEncoded).digest("base64url");
    return `${payloadEncoded}.${signature}`;
  };

  const verifyAdminToken = (token: string): boolean => {
    try {
      const [payloadEncoded, signature] = token.split(".");
      if (!payloadEncoded || !signature) return false;
      const expectedSignature = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(payloadEncoded).digest("base64url");
      if (!secureEquals(signature, expectedSignature)) return false;
      const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf-8"));
      if (!payload?.exp || Date.now() > payload.exp) return false;
      if (payload?.username !== ADMIN_USERNAME) return false;
      return true;
    } catch {
      return false;
    }
  };

  const enforceAdminAuth = (req: express.Request, res: express.Response): boolean => {
    if (!hasAdminConfig) {
      res.status(503).json({ error: "Admin access is not configured on the server." });
      return false;
    }
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || !verifyAdminToken(token)) {
      res.status(401).json({ error: "Unauthorized admin request." });
      return false;
    }
    return true;
  };

  function getSessionId(req: any): string {
    // Prioritize client-provided ID for browser/computer isolation
    // Check headers (Express/Polling)
    const clientId = req.headers?.['x-client-id'] as string;
    if (clientId && clientId.length > 5) {
      return clientId.replace(/[^a-zA-Z0-9]/g, '_');
    }

    // Check Socket.IO auth (if req is actually a socket or has handshake)
    if (req.handshake?.auth?.clientId) {
      return req.handshake.auth.clientId.replace(/[^a-zA-Z0-9]/g, '_');
    }

    // Fallback to IP address if no client ID provided
    const ip = (req.headers?.['x-forwarded-for'] as string || req.socket?.remoteAddress || 'default').split(',')[0].trim();
    // Sanitize IP for filename usage
    return ip.replace(/[^a-zA-Z0-9]/g, '_');
  }

  function getOrCreateSession(sessionId: string): Session {
    if (!sessions.has(sessionId)) {
      const session: Session = {
        sock: null,
        qrCode: null,
        connectionStatus: 'close',
        contactsStore: {},
        groupsStore: {},
        groupsCache: null,
        lastGroupFetch: 0,
        userName: null,
      };

      // Load persisted data for this session
      const contactsPath = `contacts_${sessionId}.json`;
      const groupsPath = `groups_${sessionId}.json`;
      const infoPath = `info_${sessionId}.json`;

      if (fs.existsSync(contactsPath)) {
        try {
          session.contactsStore = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));
        } catch (e) { console.error(`Failed to load contacts for ${sessionId}:`, e); }
      }

      if (fs.existsSync(groupsPath)) {
        try {
          session.groupsStore = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));
        } catch (e) { console.error(`Failed to load groups for ${sessionId}:`, e); }
      }

      if (fs.existsSync(infoPath)) {
        try {
          const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
          session.userName = info.userName;
        } catch (e) { console.error(`Failed to load info for ${sessionId}:`, e); }
      }

      sessions.set(sessionId, session);
    }
    return sessions.get(sessionId)!;
  }

  const saveSessionData = (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    try {
      fs.writeFileSync(`contacts_${sessionId}.json`, JSON.stringify(session.contactsStore));
      fs.writeFileSync(`groups_${sessionId}.json`, JSON.stringify(session.groupsStore));
      fs.writeFileSync(`info_${sessionId}.json`, JSON.stringify({ userName: session.userName }));
    } catch (e) {
      console.error(`Failed to save data for ${sessionId}:`, e);
    }
  };

  const logger = pino({ level: 'silent' });

  async function connectToWhatsApp(sessionId: string) {
    const session = getOrCreateSession(sessionId);
    const authPath = `auth_info_${sessionId}`;
    
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger,
    });

    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messaging-history.set', ({ contacts, chats }: any) => {
      if (contacts) {
        contacts.forEach((c: any) => {
          session.contactsStore[c.id] = { ...session.contactsStore[c.id], ...c };
        });
      }
      if (chats) {
        chats.forEach((chat: any) => {
          if (chat.id.endsWith('@s.whatsapp.net')) {
            const existing = session.contactsStore[chat.id] || {};
            session.contactsStore[chat.id] = { 
              ...existing,
              id: chat.id, 
              name: chat.name || existing.name || chat.id.split('@')[0] 
            };
          }
        });
      }
      saveSessionData(sessionId);
    });

    sock.ev.on('contacts.upsert', (contacts: any) => {
      contacts.forEach((c: any) => {
        session.contactsStore[c.id] = { ...session.contactsStore[c.id], ...c };
      });
      saveSessionData(sessionId);
    });

    sock.ev.on('contacts.update', (updates: any) => {
      updates.forEach((update: any) => {
        if (session.contactsStore[update.id]) {
          session.contactsStore[update.id] = { ...session.contactsStore[update.id], ...update };
        } else {
          session.contactsStore[update.id] = update;
        }
      });
      saveSessionData(sessionId);
    });

    sock.ev.on('chats.upsert', (chats: any) => {
      chats.forEach((chat: any) => {
        if (chat.id.endsWith('@s.whatsapp.net')) {
          if (!session.contactsStore[chat.id]) {
            session.contactsStore[chat.id] = { id: chat.id, name: chat.name || chat.id.split('@')[0] };
          } else {
            session.contactsStore[chat.id] = { ...session.contactsStore[chat.id], ...chat };
          }
        }
      });
      saveSessionData(sessionId);
    });

    sock.ev.on('group-participants.update', ({ id, participants, action }: any) => {
      if (session.groupsStore[id]) {
        if (action === 'add' && participants) {
          participants.forEach((p: any) => {
            const jid = typeof p === 'string' ? p : p.id;
            if (!session.groupsStore[id].participants.some((existing: any) => (typeof existing === 'string' ? existing : existing.id) === jid)) {
              session.groupsStore[id].participants.push(typeof p === 'string' ? p : { id: jid });
            }
          });
        } else if (action === 'remove' && participants) {
          participants.forEach((p: any) => {
            const jid = typeof p === 'string' ? p : p.id;
            session.groupsStore[id].participants = session.groupsStore[id].participants.filter((existing: any) => (typeof existing === 'string' ? existing : existing.id) !== jid);
          });
        }
        saveSessionData(sessionId);
      }

      if (participants) {
        participants.forEach((p: any) => {
          const jid = typeof p === 'string' ? p : p.id;
          if (jid && jid.endsWith('@s.whatsapp.net') && !session.contactsStore[jid]) {
            session.contactsStore[jid] = { id: jid };
          }
        });
        saveSessionData(sessionId);
      }
    });

    sock.ev.on('groups.upsert', (groups: any) => {
      groups.forEach((g: any) => {
        session.groupsStore[g.id] = { ...session.groupsStore[g.id], ...g };
        if (g.participants) {
          g.participants.forEach((p: any) => {
            const jid = typeof p === 'string' ? p : p.id;
            if (jid && jid.endsWith('@s.whatsapp.net') && !session.contactsStore[jid]) {
              session.contactsStore[jid] = { id: jid };
            }
          });
        }
      });
      saveSessionData(sessionId);
    });

    sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      if (type === 'notify') {
        for (const msg of messages) {
          if (msg.key.remoteJid && !session.contactsStore[msg.key.remoteJid]) {
            session.contactsStore[msg.key.remoteJid] = {
              id: msg.key.remoteJid,
              name: msg.pushName || msg.key.remoteJid.split('@')[0]
            };
            saveSessionData(sessionId);
          }
        }
      }
    });

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        session.qrCode = await QRCode.toDataURL(qr);
        session.connectionStatus = 'qr';
        io.to(sessionId).emit('whatsapp-status', { status: 'qr', qr: session.qrCode });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        session.connectionStatus = 'close';
        session.qrCode = null;
        io.to(sessionId).emit('whatsapp-status', { status: 'close' });
        if (shouldReconnect) {
          connectToWhatsApp(sessionId);
        }
      } else if (connection === 'open') {
        session.connectionStatus = 'open';
        session.qrCode = null;
        if (sock.user) {
          session.userName = sock.user.name || sock.user.id.split(':')[0];
          saveSessionData(sessionId);
        }
        io.to(sessionId).emit('whatsapp-status', { status: 'open' });
      }
    });
  }

  io.on('connection', (socket) => {
    const sessionId = getSessionId(socket);
    socket.join(sessionId);
    const session = getOrCreateSession(sessionId);
    socket.emit('whatsapp-status', { status: session.connectionStatus, qr: session.qrCode, sessionId });
    
    if (session.connectionStatus === 'close') {
      connectToWhatsApp(sessionId);
    }
  });

  // Resume existing sessions on boot
  const files = fs.readdirSync(process.cwd());
  const authDirs = files.filter(f => f.startsWith('auth_info_') && fs.statSync(f).isDirectory());
  for (const dir of authDirs) {
    const sessionId = dir.replace('auth_info_', '');
    console.log(`Resuming session: ${sessionId}`);
    connectToWhatsApp(sessionId);
  }

  // API Routes
  app.get('/api/whatsapp/status', (req, res) => {
    const sessionId = getSessionId(req);
    const session = getOrCreateSession(sessionId);
    res.json({ status: session.connectionStatus, qr: session.qrCode, sessionId });
  });

  // Admin API Routes
  app.get('/api/admin/configured', (req, res) => {
    res.json({ configured: hasAdminConfig });
  });

  app.post('/api/admin/login', (req, res) => {
    if (!hasAdminConfig) {
      return res.status(503).json({ error: 'Admin access is not configured on the server.' });
    }
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!secureEquals(username, ADMIN_USERNAME!) || !secureEquals(password, ADMIN_PASSWORD!)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    res.json({ token: createAdminToken() });
  });

  app.get('/api/admin/sessions', (req, res) => {
    if (!enforceAdminAuth(req, res)) return;

    const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
      id,
      userName: session.userName,
      status: session.connectionStatus,
      contactsCount: Object.keys(session.contactsStore).length,
      groupsCount: Object.keys(session.groupsStore).length
    }));
    
    // Also check for sessions that might not be in memory but have auth files
    const files = fs.readdirSync(process.cwd());
    const authDirs = files.filter(f => f.startsWith('auth_info_') && fs.statSync(f).isDirectory());
    authDirs.forEach(dir => {
      const id = dir.replace('auth_info_', '');
      if (!sessions.has(id)) {
        let userName = null;
        if (fs.existsSync(`info_${id}.json`)) {
          try {
            userName = JSON.parse(fs.readFileSync(`info_${id}.json`, 'utf-8')).userName;
          } catch (e) {}
        }
        sessionList.push({
          id,
          userName,
          status: 'close',
          contactsCount: 0,
          groupsCount: 0
        });
      }
    });

    res.json(sessionList);
  });

  app.post('/api/admin/logout-session', (req, res) => {
    if (!enforceAdminAuth(req, res)) return;

    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    try {
      const session = sessions.get(sessionId);
      if (session?.sock) {
        session.sock.logout().catch(() => {});
        session.sock.end(undefined);
      }
      // We don't delete the session from the map or files, 
      // just force a logout so they have to re-auth.
      if (session) {
        session.connectionStatus = 'close';
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/delete-session', (req, res) => {
    if (!enforceAdminAuth(req, res)) return;

    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    try {
      const session = sessions.get(sessionId);
      if (session?.sock) {
        session.sock.logout().catch(() => {});
        session.sock.end(undefined);
      }
      sessions.delete(sessionId);
      
      const authPath = `auth_info_${sessionId}`;
      if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
      if (fs.existsSync(`contacts_${sessionId}.json`)) fs.unlinkSync(`contacts_${sessionId}.json`);
      if (fs.existsSync(`groups_${sessionId}.json`)) fs.unlinkSync(`groups_${sessionId}.json`);
      if (fs.existsSync(`info_${sessionId}.json`)) fs.unlinkSync(`info_${sessionId}.json`);
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/whatsapp/clear-all', (req, res) => {
    if (!enforceAdminAuth(req, res)) return;

    const files = fs.readdirSync(process.cwd());
    const authDirs = files.filter(f => f.startsWith('auth_info_') && fs.statSync(f).isDirectory());
    for (const dir of authDirs) {
      const sessionId = dir.replace('auth_info_', '');
      try {
        const session = sessions.get(sessionId);
        if (session?.sock) {
          session.sock.logout().catch(() => {});
          session.sock.end(undefined);
        }
        sessions.delete(sessionId);
        fs.rmSync(dir, { recursive: true, force: true });
        if (fs.existsSync(`contacts_${sessionId}.json`)) fs.unlinkSync(`contacts_${sessionId}.json`);
        if (fs.existsSync(`groups_${sessionId}.json`)) fs.unlinkSync(`groups_${sessionId}.json`);
        if (fs.existsSync(`info_${sessionId}.json`)) fs.unlinkSync(`info_${sessionId}.json`);
      } catch (e) {
        console.error(`Clear-all failed for ${sessionId}:`, e);
      }
    }
    res.json({ success: true });
  });

  app.get('/api/whatsapp/groups', async (req, res) => {
    const sessionId = getSessionId(req);
    const session = getOrCreateSession(sessionId);

    if (session.connectionStatus !== 'open') {
      const storedGroups = Object.values(session.groupsStore).map((g: any) => ({
        id: g.id,
        name: g.subject || g.name || g.id.split('@')[0],
        participantsCount: g.participants?.length || 0
      }));
      if (storedGroups.length > 0) return res.json(storedGroups);
      return res.status(400).json({ error: 'WhatsApp is not connected' });
    }
    
    const now = Date.now();
    if (session.groupsCache && (now - session.lastGroupFetch < GROUP_CACHE_TTL)) {
      return res.json(session.groupsCache);
    }

    try {
      const groups = await session.sock.groupFetchAllParticipating();
      Object.values(groups).forEach((g: any) => {
        session.groupsStore[g.id] = { ...session.groupsStore[g.id], ...g };
      });
      saveSessionData(sessionId);

      const groupList = Object.values(groups).map((g: any) => ({
        id: g.id,
        name: g.subject || g.name || g.id.split('@')[0],
        participantsCount: g.participants?.length || 0
      }));
      
      session.groupsCache = groupList;
      session.lastGroupFetch = now;
      res.json(groupList);
    } catch (error: any) {
      const storedGroups = Object.values(session.groupsStore).map((g: any) => ({
        id: g.id,
        name: g.subject || g.name || g.id.split('@')[0],
        participantsCount: g.participants?.length || 0
      }));
      if (storedGroups.length > 0) return res.json(storedGroups);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/whatsapp/contacts', async (req, res) => {
    const sessionId = getSessionId(req);
    const session = getOrCreateSession(sessionId);

    if (session.connectionStatus !== 'open') {
      return res.status(400).json({ error: 'WhatsApp is not connected' });
    }
    try {
      const now = Date.now();
      if (Object.keys(session.contactsStore).length < 20 && (now - session.lastGroupFetch > GROUP_CACHE_TTL)) {
        try {
          const groups = await session.sock.groupFetchAllParticipating();
          session.lastGroupFetch = now;
          Object.values(groups).forEach((g: any) => {
            if (g.participants) {
              g.participants.forEach((p: any) => {
                const jid = typeof p === 'string' ? p : p.id;
                if (jid && jid.endsWith('@s.whatsapp.net') && !session.contactsStore[jid]) {
                  session.contactsStore[jid] = { id: jid };
                }
              });
            }
          });
          saveSessionData(sessionId);
        } catch (e) { session.lastGroupFetch = now; }
      }

      const contactList = Object.values(session.contactsStore)
        .filter((c: any) => c.id.endsWith('@s.whatsapp.net'))
        .map((c: any) => ({
          id: c.id,
          name: c.name || c.verifiedName || c.notify || c.id.split('@')[0],
          phone: c.id.split('@')[0]
        }));
      res.json(contactList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    const sessionId = getSessionId(req);
    const session = getOrCreateSession(sessionId);
    const { phone, message, image, isGroup } = req.body;
    
    if (session.connectionStatus !== 'open') {
      return res.status(400).json({ error: 'WhatsApp is not connected' });
    }

    try {
      const jid = isGroup ? phone : `${phone}@s.whatsapp.net`;
      if (image) {
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        await session.sock.sendMessage(jid, { image: buffer, caption: message });
      } else {
        await session.sock.sendMessage(jid, { text: message });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/whatsapp/logout', async (req, res) => {
    const sessionId = getSessionId(req);
    const session = getOrCreateSession(sessionId);

    if (session.sock) {
      try { await session.sock.logout(); } catch (e) {}
      const authPath = `auth_info_${sessionId}`;
      if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
      if (fs.existsSync(`contacts_${sessionId}.json`)) fs.unlinkSync(`contacts_${sessionId}.json`);
      if (fs.existsSync(`groups_${sessionId}.json`)) fs.unlinkSync(`groups_${sessionId}.json`);
      
      sessions.delete(sessionId);
      res.json({ success: true });
      connectToWhatsApp(sessionId);
    } else {
      res.status(400).json({ error: 'Not connected' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
