import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Link2,
  ListChecks,
  LogOut,
  MessageSquare,
  Pencil,
  QrCode,
  RefreshCw,
  Save,
  Send,
  Settings,
  Shield,
  Trash2,
  Users2,
  User,
  X,
} from 'lucide-react';
import { io } from 'socket.io-client';
import nexusMark from './assets/nexus-mark.svg';

type Tab = 'dashboard' | 'groups' | 'contacts' | 'lists' | 'templates' | 'scheduler' | 'history' | 'whatsapp' | 'settings';

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface Group {
  id: string;
  name: string;
  participantsCount: number;
}

interface Template {
  id: string;
  name: string;
  content: string;
}

interface ScheduledMessage {
  id: string;
  targetId: string;
  targetName: string;
  targetPhone: string;
  isGroup: boolean;
  scheduledTime: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
}

interface HistoryItem {
  id: string;
  to: string;
  phone: string;
  message: string;
  isGroup: boolean;
  status: 'sent' | 'failed';
  createdAt: string;
}

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface TargetList {
  id: string;
  name: string;
  items: Array<{ id: string; name: string; phone: string; isGroup: boolean }>;
}

interface AdminLink {
  id: string;
  label: string;
  url: string;
}

function NexusLogo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      <img src={nexusMark} alt="Nexus logo" className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
      <span className={`font-semibold tracking-wide ${compact ? 'text-lg' : 'text-xl'} ${dark ? 'text-white' : 'text-slate-200'}`}>
        nexus
      </span>
    </div>
  );
}

const readStorage = <T,>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const createClientId = () => {
  const current = localStorage.getItem('wa_client_id');
  if (current) return current;
  const generated = `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  localStorage.setItem('wa_client_id', generated);
  return generated;
};

export default function App() {
  const [clientId] = useState(createClientId);
  const [tab, setTab] = useState<Tab>('whatsapp');
  const [waStatus, setWaStatus] = useState<'connecting' | 'open' | 'close' | 'qr'>('close');
  const [waQR, setWaQR] = useState<string | null>(null);
  const [waSessionId, setWaSessionId] = useState<string | null>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  const [templates, setTemplates] = useState<Template[]>(() =>
    readStorage<Template[]>(`wa_templates_${createClientId()}`, [
      { id: 't1', name: 'Hoş Geldiniz', content: 'Merhaba {{name}}, Nexus’a hoş geldiniz.' },
      { id: 't2', name: 'Hatırlatma', content: 'Merhaba {{name}}, randevunuzu hatırlatırız.' },
    ]),
  );
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [currentMessage, setCurrentMessage] = useState('');
  const [delayMs, setDelayMs] = useState(2500);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>(() => readStorage(`wa_scheduled_${createClientId()}`, []));
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingScheduleDate, setEditingScheduleDate] = useState('');
  const [editingScheduleMessage, setEditingScheduleMessage] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>(() => readStorage(`wa_history_${createClientId()}`, []));

  const [targetLists, setTargetLists] = useState<TargetList[]>(() => readStorage(`wa_target_lists_${createClientId()}`, []));
  const [listName, setListName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');

  const [notification, setNotification] = useState<Notification | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('wa_admin_token'));
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(Boolean(localStorage.getItem('wa_admin_token')));
  const [adminSessions, setAdminSessions] = useState<any[]>([]);
  const [adminLinks, setAdminLinks] = useState<AdminLink[]>([]);
  const [consentFullName, setConsentFullName] = useState('');
  const [consentPhone, setConsentPhone] = useState('');
  const [consentText, setConsentText] = useState(
    'Ticari elektronik ileti ve kampanya bilgilendirmeleri için WhatsApp üzerinden tarafıma mesaj gönderilmesini kabul ediyorum.',
  );
  const [consentAccepted, setConsentAccepted] = useState(false);

  const isWhatsappReady = waStatus === 'open';

  useEffect(() => {
    localStorage.setItem(`wa_templates_${clientId}`, JSON.stringify(templates));
  }, [templates, clientId]);

  useEffect(() => {
    localStorage.setItem(`wa_scheduled_${clientId}`, JSON.stringify(scheduled));
  }, [scheduled, clientId]);

  useEffect(() => {
    localStorage.setItem(`wa_history_${clientId}`, JSON.stringify(history));
  }, [history, clientId]);

  useEffect(() => {
    localStorage.setItem(`wa_target_lists_${clientId}`, JSON.stringify(targetLists));
  }, [targetLists, clientId]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    if (!isWhatsappReady && tab !== 'whatsapp') {
      setTab('whatsapp');
      setNotification({ message: 'Ana panel özellikleri için önce QR ile WhatsApp bağlantısı açılmalıdır.', type: 'info' });
    }
  }, [isWhatsappReady, tab]);

  useEffect(() => {
    const socket = io({
      auth: { clientId },
      extraHeaders: { 'x-client-id': clientId },
    });

    socket.on('whatsapp-status', (payload: { status: 'connecting' | 'open' | 'close' | 'qr'; qr?: string; sessionId?: string }) => {
      setWaStatus(payload.status);
      setWaQR(payload.qr || null);
      setWaSessionId(payload.sessionId || null);
    });

    return () => socket.disconnect();
  }, [clientId]);

  const fetchStatus = async () => {
    const res = await fetch('/api/whatsapp/status', { headers: { 'x-client-id': clientId } });
    if (!res.ok) return;
    const data = await res.json();
    setWaStatus(data.status);
    setWaQR(data.qr || null);
    setWaSessionId(data.sessionId || null);
  };

  const fetchContactsAndGroups = async () => {
    setIsFetching(true);
    try {
      const [gRes, cRes] = await Promise.all([
        fetch('/api/whatsapp/groups', { headers: { 'x-client-id': clientId } }),
        fetch('/api/whatsapp/contacts', { headers: { 'x-client-id': clientId } }),
      ]);
      if (gRes.ok) setGroups(await gRes.json());
      if (cRes.ok) setContacts(await cRes.json());
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (waStatus === 'open') fetchContactsAndGroups();
  }, [waStatus]);

  const adminFetch = (url: string, options?: RequestInit) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options?.headers || {}),
        Authorization: adminToken ? `Bearer ${adminToken}` : '',
      },
    });

  const sendMessage = async (targetPhone: string, text: string, isGroup = false) => {
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-id': clientId },
      body: JSON.stringify({ phone: targetPhone, message: text, isGroup }),
    });
    return res.ok;
  };

  const processTemplate = (text: string, target: { name: string; phone: string }) =>
    text.replaceAll('{{name}}', target.name).replaceAll('{{phone}}', target.phone);

  const bulkSend = async (targets: Array<{ id: string; name: string; phone: string; isGroup: boolean }>) => {
    if (waStatus !== 'open') {
      setNotification({ message: 'Önce WhatsApp bağlantısını açın.', type: 'error' });
      setTab('whatsapp');
      return;
    }
    if (!currentMessage.trim()) {
      setNotification({ message: 'Gönderilecek mesaj boş olamaz.', type: 'error' });
      return;
    }

    setIsSending(true);
    let success = 0;

    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      const message = processTemplate(currentMessage, { name: target.name, phone: target.phone });
      const ok = await sendMessage(target.phone, message, target.isGroup);
      if (ok) {
        success += 1;
        setHistory(prev => [{
          id: `${Date.now()}_${target.id}`,
          to: target.name,
          phone: target.phone,
          message,
          isGroup: target.isGroup,
          status: 'sent',
          createdAt: new Date().toISOString(),
        }, ...prev].slice(0, 200));
      }
      if (i < targets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs + Math.floor(Math.random() * 1000)));
      }
    }

    setNotification({ message: `Gönderim tamamlandı. Başarılı: ${success}/${targets.length}`, type: 'success' });
    setIsSending(false);
  };

  useEffect(() => {
    const timer = setInterval(async () => {
      const now = Date.now();
      const pending = scheduled.filter(item => item.status === 'pending' && new Date(item.scheduledTime).getTime() <= now);
      if (pending.length === 0) return;

      for (const item of pending) {
        const ok = await sendMessage(item.targetPhone, item.message, item.isGroup);
        setScheduled(prev => prev.map(s => (s.id === item.id ? { ...s, status: ok ? 'sent' : 'failed' } : s)));
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [scheduled]);

  const selectedContactRows = useMemo(
    () => contacts.filter(c => selectedContacts.includes(c.id)).map(c => ({ id: c.id, name: c.name, phone: c.phone, isGroup: false })),
    [contacts, selectedContacts],
  );

  const selectedGroupRows = useMemo(
    () => groups.filter(g => selectedGroups.includes(g.id)).map(g => ({ id: g.id, name: g.name, phone: g.id, isGroup: true })),
    [groups, selectedGroups],
  );

  const selectedRows = useMemo(() => [...selectedContactRows, ...selectedGroupRows], [selectedContactRows, selectedGroupRows]);

  const createSchedule = (target: { id: string; name: string; phone: string; isGroup: boolean }) => {
    if (!scheduleAt || !currentMessage.trim()) {
      setNotification({ message: 'Planlama için tarih ve mesaj zorunludur.', type: 'error' });
      return;
    }
    setScheduled(prev => [{
      id: `s_${Date.now()}_${target.id}`,
      targetId: target.id,
      targetName: target.name,
      targetPhone: target.phone,
      isGroup: target.isGroup,
      scheduledTime: scheduleAt,
      message: processTemplate(currentMessage, { name: target.name, phone: target.phone }),
      status: 'pending',
    }, ...prev]);
    setNotification({ message: `${target.name} için planlama oluşturuldu.`, type: 'success' });
  };

  const startEditingSchedule = (item: ScheduledMessage) => {
    setEditingScheduleId(item.id);
    setEditingScheduleDate(item.scheduledTime.slice(0, 16));
    setEditingScheduleMessage(item.message);
  };

  const saveScheduleEdit = (id: string) => {
    if (!editingScheduleDate || !editingScheduleMessage.trim()) {
      setNotification({ message: 'Düzenleme için tarih ve mesaj gereklidir.', type: 'error' });
      return;
    }
    setScheduled(prev => prev.map(item => (item.id === id ? { ...item, scheduledTime: editingScheduleDate, message: editingScheduleMessage, status: 'pending' } : item)));
    setEditingScheduleId(null);
    setNotification({ message: 'Planlanan işlem güncellendi.', type: 'success' });
  };

  const deleteSchedule = (id: string) => {
    setScheduled(prev => prev.filter(item => item.id !== id));
    if (editingScheduleId === id) setEditingScheduleId(null);
    setNotification({ message: 'Planlanan işlem silindi.', type: 'info' });
  };

  const createListFromSelection = () => {
    if (!listName.trim()) {
      setNotification({ message: 'Liste adı zorunlu.', type: 'error' });
      return;
    }
    if (selectedRows.length === 0) {
      setNotification({ message: 'Liste oluşturmak için en az bir grup/kişi seçin.', type: 'error' });
      return;
    }
    setTargetLists(prev => [{ id: `l_${Date.now()}`, name: listName.trim(), items: selectedRows }, ...prev]);
    setListName('');
    setNotification({ message: 'Liste oluşturuldu.', type: 'success' });
  };

  const sendToList = async () => {
    const list = targetLists.find(item => item.id === selectedListId);
    if (!list) {
      setNotification({ message: 'Önce bir liste seçin.', type: 'error' });
      return;
    }
    await bulkSend(list.items);
  };

  const startEditList = (list: TargetList) => {
    setEditingListId(list.id);
    setEditingListName(list.name);
  };

  const saveListEdit = (id: string) => {
    if (!editingListName.trim()) {
      setNotification({ message: 'Liste adı boş olamaz.', type: 'error' });
      return;
    }
    setTargetLists(prev => prev.map(item => (item.id === id ? { ...item, name: editingListName.trim() } : item)));
    setEditingListId(null);
    setEditingListName('');
    setNotification({ message: 'Liste güncellendi.', type: 'success' });
  };

  const removeItemFromList = (listId: string, itemId: string) => {
    setTargetLists(prev => prev.map(list => (list.id === listId ? { ...list, items: list.items.filter(item => item.id !== itemId) } : list)));
  };

  const handleLogout = async () => {
    await fetch('/api/whatsapp/logout', { method: 'POST', headers: { 'x-client-id': clientId } });
    setWaStatus('close');
    setWaQR(null);
    setGroups([]);
    setContacts([]);
    setSelectedGroups([]);
    setSelectedContacts([]);
    setTab('whatsapp');
  };

  const handleAdminLogin = async () => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPassword }),
    });
    if (!res.ok) {
      setNotification({ message: 'Admin girişi başarısız.', type: 'error' });
      return;
    }
    const data = await res.json();
    localStorage.setItem('wa_admin_token', data.token);
    setAdminToken(data.token);
    setIsAdminLoggedIn(true);
  };

  const submitConsentLog = async () => {
    if (!consentAccepted) {
      setNotification({ message: 'Log kaydı için açık rıza onayı zorunludur.', type: 'error' });
      return;
    }

    const res = await fetch('/api/privacy/consent-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-id': clientId },
      body: JSON.stringify({
        fullName: consentFullName,
        phone: consentPhone,
        consentText,
        consentAccepted: true,
        consentVersion: 'v1',
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotification({ message: data.error || 'Açık rıza log kaydı başarısız.', type: 'error' });
      return;
    }

    setNotification({ message: 'Açık rıza kaydı güvenli sunucu alanına yazıldı.', type: 'success' });
    setConsentFullName('');
    setConsentPhone('');
    setConsentAccepted(false);
  };

  const refreshAdminSessions = async () => {
    const res = await adminFetch('/api/admin/sessions');
    if (res.ok) setAdminSessions(await res.json());
  };

  const refreshAdminLinks = async () => {
    const res = await adminFetch('/api/admin/links');
    if (res.ok) setAdminLinks(await res.json());
  };

  const saveAdminLinks = async () => {
    const normalized = adminLinks
      .map(item => ({ ...item, label: item.label.trim(), url: item.url.trim() }))
      .filter(item => item.label && item.url);
    const res = await adminFetch('/api/admin/links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: normalized }),
    });
    if (!res.ok) {
      setNotification({ message: 'Bağlantılar kaydedilemedi.', type: 'error' });
      return;
    }
    setAdminLinks(normalized);
    setNotification({ message: 'Admin bağlantıları kaydedildi.', type: 'success' });
  };

  useEffect(() => {
    if (isAdminLoggedIn) {
      refreshAdminSessions();
      refreshAdminLinks();
    }
  }, [isAdminLoggedIn]);

  const nav = [
    { id: 'dashboard' as Tab, label: 'Panel', icon: Activity },
    { id: 'groups' as Tab, label: 'Gruplar', icon: Users2 },
    { id: 'contacts' as Tab, label: 'Rehber', icon: User },
    { id: 'lists' as Tab, label: 'Listeler', icon: ListChecks },
    { id: 'templates' as Tab, label: 'Şablonlar', icon: FileText },
    { id: 'scheduler' as Tab, label: 'Planlayıcı', icon: Clock },
    { id: 'history' as Tab, label: 'Geçmiş', icon: History },
    { id: 'whatsapp' as Tab, label: 'WhatsApp', icon: QrCode },
    { id: 'settings' as Tab, label: 'Ayarlar', icon: Settings },
  ];

  return (
    <div className="relative min-h-screen bg-[#020617] text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-6rem] top-[-8rem] h-72 w-72 rounded-full bg-emerald-500/25 blur-[100px]" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-cyan-500/20 blur-[120px]" />
      </div>

      {notification && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-2 rounded-xl border border-white/20 bg-slate-900/90 px-4 py-3 text-sm shadow-2xl backdrop-blur">
          {notification.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
          {notification.type === 'error' && <AlertCircle size={16} className="text-red-400" />}
          {notification.type === 'info' && <MessageSquare size={16} className="text-cyan-400" />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1500px] gap-4 p-4 md:p-6">
        <aside className="hidden w-64 shrink-0 rounded-3xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur lg:block">
          <div className="mb-4 border-b border-white/10 pb-4">
            <NexusLogo dark compact />
          </div>
          <nav className="space-y-2">
            {nav.map(item => {
              const Icon = item.icon;
              const isLocked = !isWhatsappReady && item.id !== 'whatsapp';
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  disabled={isLocked}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${tab === item.id ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 font-semibold text-white' : 'text-slate-300 hover:bg-white/10'} ${isLocked ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-xs text-slate-400">
            <p>Durum: <span className={waStatus === 'open' ? 'text-emerald-400' : 'text-amber-400'}>{waStatus}</span></p>
            <p>Rehber: {contacts.length}</p>
            <p>Gruplar: {groups.length}</p>
            <p>Planlanan: {scheduled.filter(s => s.status === 'pending').length}</p>
          </div>
        </aside>

        <main className="flex-1 rounded-3xl border border-white/10 bg-slate-950/70 p-4 md:p-6 backdrop-blur-xl">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <NexusLogo dark />
              <h1 className="text-2xl font-bold">Nexus Professional Console</h1>
              <p className="text-sm text-slate-400">Son kullanıcı için optimize edilmiş yeni kontrol deneyimi.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={fetchContactsAndGroups} disabled={!isWhatsappReady} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={14} /> Yenile</button>
              <button onClick={() => setIsAdminModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-purple-400/30 bg-purple-400/10 px-3 py-2 text-sm text-purple-300 hover:bg-purple-400/20"><Shield size={14} /> Admin</button>
              <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300 hover:bg-red-400/20"><LogOut size={14} /> Çıkış</button>
            </div>
          </header>

          {tab === 'dashboard' && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[['WhatsApp', waStatus], ['Rehber', String(contacts.length)], ['Gruplar', String(groups.length)], ['Planlanan', String(scheduled.filter(s => s.status === 'pending').length)]].map(([title, value]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-400">{title}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-slate-300">
                Mesaj alanına <code>{'{{name}}'}</code> veya <code>{'{{phone}}'}</code> yazarak kişiselleştirme yapabilirsiniz.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <h2 className="font-semibold">Panelden Direkt Mesaj Gönder</h2>
                <textarea value={currentMessage} onChange={e => setCurrentMessage(e.target.value)} className="h-24 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" placeholder="Seçili listeye gönderilecek mesaj taslağı" />
                <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                  <option value="">Liste seçin</option>
                  {targetLists.map(list => (
                    <option key={list.id} value={list.id}>{list.name} ({list.items.length})</option>
                  ))}
                </select>
                <button disabled={!selectedListId || isSending} onClick={sendToList} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send size={14} /> Seçili Listeye Gönder</button>
              </div>
            </div>
          )}

          {tab === 'groups' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                <h2 className="font-semibold">Gruplardan Liste Oluştur</h2>
                <p className="text-xs text-slate-400">Bu sekme yalnızca seçim yapıp yeni liste oluşturmak içindir.</p>
                <div className="flex flex-wrap gap-2">
                  <input value={listName} onChange={e => setListName(e.target.value)} placeholder="Yeni liste adı" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
                  <button onClick={createListFromSelection} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white">Seçimden Liste Oluştur</button>
                </div>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-xl border border-white/10">
                {groups.map(group => (
                  <label key={group.id} className="flex cursor-pointer items-center justify-between border-b border-white/5 px-3 py-2 text-sm hover:bg-white/5">
                    <div>
                      <p className="font-medium">{group.name}</p>
                      <p className="text-xs text-slate-400">Katılımcı: {group.participantsCount}</p>
                    </div>
                    <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => setSelectedGroups(prev => (prev.includes(group.id) ? prev.filter(id => id !== group.id) : [...prev, group.id]))} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'contacts' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                <h2 className="font-semibold">Rehberden Liste Oluştur</h2>
                <p className="text-xs text-slate-400">Bu sekme yalnızca seçim yapıp yeni liste oluşturmak içindir.</p>
                <div className="flex flex-wrap gap-2">
                  <input value={listName} onChange={e => setListName(e.target.value)} placeholder="Yeni liste adı" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
                  <button onClick={createListFromSelection} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white">Seçimden Liste Oluştur</button>
                </div>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-xl border border-white/10">
                {contacts.map(contact => (
                  <label key={contact.id} className="flex cursor-pointer items-center justify-between border-b border-white/5 px-3 py-2 text-sm hover:bg-white/5">
                    <div>
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-xs text-slate-400">+{contact.phone}</p>
                    </div>
                    <input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => setSelectedContacts(prev => (prev.includes(contact.id) ? prev.filter(id => id !== contact.id) : [...prev, contact.id]))} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'lists' && (
            <div className="space-y-4">
              <h2 className="font-semibold">Mevcut Listeleri Yönet</h2>
              <div className="max-h-[320px] overflow-auto rounded-xl border border-white/10">
                {targetLists.map(list => (
                  <div key={list.id} className="border-b border-white/10 px-3 py-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      {editingListId === list.id ? (
                        <div className="flex w-full items-center gap-2">
                          <input value={editingListName} onChange={e => setEditingListName(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1 text-xs" />
                          <button onClick={() => saveListEdit(list.id)} className="text-emerald-300"><Save size={14} /></button>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium">{list.name}</p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => startEditList(list)} className="text-cyan-300"><Pencil size={14} /></button>
                            <button onClick={() => setTargetLists(prev => prev.filter(item => item.id !== list.id))} className="text-red-300"><Trash2 size={14} /></button>
                          </div>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{list.items.length} kayıt</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {list.items.slice(0, 12).map(item => (
                        <span key={`${list.id}_${item.id}`} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-xs">
                          {item.name}
                          <button onClick={() => removeItemFromList(list.id, item.id)} className="text-red-300"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'lists' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="mb-2 font-semibold">Liste Oluştur</h2>
                <p className="mb-3 text-xs text-slate-400">Gruplar ve Rehber sekmelerinde seçtiğiniz kayıtlar bu listeye eklenir.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={listName} onChange={e => setListName(e.target.value)} placeholder="Liste adı" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
                  <button onClick={createListFromSelection} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white">Seçililerle Listeyi Kaydet</button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <h2 className="font-semibold">Listeye Mesaj Gönder</h2>
                <textarea value={currentMessage} onChange={e => setCurrentMessage(e.target.value)} className="h-24 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" placeholder="Listeye gönderilecek mesaj taslağı" />
                <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                  <option value="">Liste seçin</option>
                  {targetLists.map(list => (
                    <option key={list.id} value={list.id}>{list.name} ({list.items.length})</option>
                  ))}
                </select>
                <button disabled={!selectedListId || isSending} onClick={sendToList} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send size={14} /> Seçili Listeye Gönder</button>
              </div>

              <div className="max-h-[320px] overflow-auto rounded-xl border border-white/10">
                {targetLists.map(list => (
                  <div key={list.id} className="border-b border-white/10 px-3 py-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium">{list.name}</p>
                      <button onClick={() => setTargetLists(prev => prev.filter(item => item.id !== list.id))} className="text-red-300"><Trash2 size={14} /></button>
                    </div>
                    <p className="text-xs text-slate-400">{list.items.length} kayıt</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <form onSubmit={e => { e.preventDefault(); if (!newTemplate.name || !newTemplate.content) return; setTemplates(prev => [{ id: `t_${Date.now()}`, name: newTemplate.name, content: newTemplate.content }, ...prev]); setNewTemplate({ name: '', content: '' }); }} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="font-semibold">Yeni Şablon</h2>
                <input value={newTemplate.name} onChange={e => setNewTemplate(prev => ({ ...prev, name: e.target.value }))} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" placeholder="Şablon adı" />
                <textarea value={newTemplate.content} onChange={e => setNewTemplate(prev => ({ ...prev, content: e.target.value }))} className="h-28 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" placeholder="Şablon içeriği" />
                <button className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white">Kaydet</button>
              </form>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="mb-3 font-semibold">Kayıtlı Şablonlar</h2>
                <div className="space-y-2">
                  {templates.map(template => (
                    <div key={template.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{template.name}</p>
                        <button onClick={() => setTemplates(prev => prev.filter(t => t.id !== template.id))} className="text-red-300"><Trash2 size={14} /></button>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{template.content}</p>
                      <button onClick={() => setCurrentMessage(template.content)} className="mt-2 text-xs text-emerald-300">Mesaj alanına uygula</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'scheduler' && (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-semibold">Planlayıcı</h2>
              <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
              <div className="max-h-[360px] overflow-auto rounded-xl border border-white/10">
                {scheduled.map(item => (
                  <div key={item.id} className="border-b border-white/5 px-3 py-2 text-sm space-y-2">
                    {editingScheduleId === item.id ? (
                      <>
                        <input type="datetime-local" value={editingScheduleDate} onChange={e => setEditingScheduleDate(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs" />
                        <textarea value={editingScheduleMessage} onChange={e => setEditingScheduleMessage(e.target.value)} className="h-20 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs" />
                        <div className="flex gap-2">
                          <button onClick={() => saveScheduleEdit(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold"><Save size={12} /> Kaydet</button>
                          <button onClick={() => setEditingScheduleId(null)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs">Vazgeç</button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p>{item.targetName}</p>
                          <p className="text-xs text-slate-400">{new Date(item.scheduledTime).toLocaleString('tr-TR')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-xs ${item.status === 'pending' ? 'bg-amber-400/20 text-amber-300' : item.status === 'sent' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>{item.status}</span>
                          <button onClick={() => startEditingSchedule(item)} className="text-cyan-300"><Pencil size={14} /></button>
                          <button onClick={() => deleteSchedule(item.id)} className="text-red-300"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <button onClick={() => setHistory([])} className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">Geçmişi temizle</button>
              <div className="max-h-[420px] overflow-auto rounded-xl border border-white/10">
                {history.map(item => (
                  <div key={item.id} className="border-b border-white/5 px-3 py-2 text-sm">
                    <p className="font-medium">{item.to} ({item.isGroup ? 'Grup' : 'Kişi'})</p>
                    <p className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString('tr-TR')} · +{item.phone}</p>
                    <p className="mt-1 text-xs text-slate-300">{item.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'whatsapp' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <h2 className="mb-3 text-xl font-semibold">WhatsApp Bağlantısı</h2>
              <p className="mb-4 text-sm text-slate-400">Durum: {waStatus}</p>
              {waSessionId && <p className="mb-4 text-xs text-slate-500">Oturum ID: {waSessionId}</p>}
              {waStatus === 'qr' && waQR ? <img src={waQR} alt="QR" className="mx-auto w-64 rounded-xl border border-emerald-400 bg-white p-2" /> : <p className="text-sm text-slate-400">QR hazır olduğunda burada görünür.</p>}
              {!isWhatsappReady && <p className="mt-4 text-xs text-amber-300">QR ile giriş tamamlanmadan panel sekmeleri kilitlidir.</p>}
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-semibold">Mesaj Ayarları</h2>
              <label className="block text-sm text-slate-300">Mesajlar arası gecikme: {delayMs} ms</label>
              <input type="range" min={1000} max={10000} step={500} value={delayMs} onChange={e => setDelayMs(Number(e.target.value))} className="w-full" />
              <p className="text-xs text-slate-400">Toplu gönderimde anti-spam için ek rastgele gecikme uygulanır.</p>

              <div className="space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                <h3 className="text-sm font-semibold text-emerald-300">Reklam İzni (Açık Rıza) Log Kaydı</h3>
                <p className="text-xs text-slate-300">
                  Yalnızca formu dolduran kişinin verisini kaydedin. Üçüncü kişilerin rehber verilerini içe aktarmayın.
                </p>
                <input
                  value={consentFullName}
                  onChange={e => setConsentFullName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
                />
                <input
                  value={consentPhone}
                  onChange={e => setConsentPhone(e.target.value)}
                  placeholder="Telefon (+905xxxxxxxxx)"
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
                />
                <textarea
                  value={consentText}
                  onChange={e => setConsentText(e.target.value)}
                  className="h-24 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs"
                />
                <label className="flex items-start gap-2 text-xs text-slate-200">
                  <input type="checkbox" checked={consentAccepted} onChange={e => setConsentAccepted(e.target.checked)} className="mt-0.5" />
                  Bu kişiden reklam/iletişim amacıyla açık rıza alındığını onaylıyorum.
                </label>
                <button onClick={submitConsentLog} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950">
                  Açık Rıza Kaydını Logla
                </button>
              </div>
            </div>
          )}

          {isFetching && <p className="mt-4 text-xs text-slate-500">Veriler yenileniyor...</p>}
        </main>
      </div>

      {isAdminModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Yönetici Girişi</h2>
              <button onClick={() => setIsAdminModalOpen(false)}><X size={18} /></button>
            </div>
            {!isAdminLoggedIn ? (
              <div className="space-y-3">
                <input value={adminUsername} onChange={e => setAdminUsername(e.target.value)} placeholder="Kullanıcı adı" className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm" />
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Şifre" className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm" />
                <button onClick={handleAdminLogin} className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold">Giriş Yap</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2 rounded-lg border border-white/10 p-3">
                  <h3 className="font-medium inline-flex items-center gap-2"><Link2 size={14} /> Admin Bağlantı Yönetimi</h3>
                  {adminLinks.map((link, idx) => (
                    <div key={link.id} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                      <input value={link.label} onChange={e => setAdminLinks(prev => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, label: e.target.value } : item))} placeholder="Başlık" className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs" />
                      <input value={link.url} onChange={e => setAdminLinks(prev => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, url: e.target.value } : item))} placeholder="https://..." className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs" />
                      <button onClick={() => setAdminLinks(prev => prev.filter(item => item.id !== link.id))} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">Sil</button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={() => setAdminLinks(prev => [...prev, { id: `a_${Date.now()}`, label: '', url: '' }])} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">Satır Ekle</button>
                    <button onClick={saveAdminLinks} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold">Kaydet</button>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-white/10 p-3">
                  <button onClick={refreshAdminSessions} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">Oturumları yenile</button>
                  <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
                    {adminSessions.map(session => (
                      <div key={session.id} className="border-b border-white/10 px-3 py-2 text-xs">
                        <p>{session.id}</p>
                        <p className="text-slate-400">Durum: {session.status} · Kişi: {session.contactsCount} · Grup: {session.groupsCount}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => { localStorage.removeItem('wa_admin_token'); setAdminToken(null); setIsAdminLoggedIn(false); }} className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">Admin çıkışı</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
