import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  History,
  LogOut,
  MessageSquare,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Trash2,
  Users2,
  User,
  X,
} from 'lucide-react';
import { io } from 'socket.io-client';

type Tab = 'dashboard' | 'groups' | 'contacts' | 'templates' | 'scheduler' | 'history' | 'whatsapp' | 'settings';

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
  const [tab, setTab] = useState<Tab>('dashboard');
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
  const [history, setHistory] = useState<HistoryItem[]>(() => readStorage(`wa_history_${createClientId()}`, []));

  const [notification, setNotification] = useState<Notification | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('wa_admin_token'));
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(Boolean(localStorage.getItem('wa_admin_token')));
  const [adminSessions, setAdminSessions] = useState<any[]>([]);

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
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

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
    }, 60000);

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

  const handleLogout = async () => {
    await fetch('/api/whatsapp/logout', { method: 'POST', headers: { 'x-client-id': clientId } });
    setWaStatus('close');
    setWaQR(null);
    setGroups([]);
    setContacts([]);
    setSelectedGroups([]);
    setSelectedContacts([]);
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
    setIsAdminModalOpen(false);
  };

  const refreshAdminSessions = async () => {
    const res = await adminFetch('/api/admin/sessions');
    if (res.ok) setAdminSessions(await res.json());
  };

  useEffect(() => {
    if (isAdminLoggedIn) refreshAdminSessions();
  }, [isAdminLoggedIn]);

  const nav = [
    { id: 'dashboard' as Tab, label: 'Panel', icon: Activity },
    { id: 'groups' as Tab, label: 'Gruplar', icon: Users2 },
    { id: 'contacts' as Tab, label: 'Rehber', icon: User },
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
          <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-4 text-emerald-400">
            <Activity size={24} />
            <span className="text-xl font-bold">Nexus</span>
          </div>
          <nav className="space-y-2">
            {nav.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${tab === item.id ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 font-semibold text-white' : 'text-slate-300 hover:bg-white/10'}`}
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
              <h1 className="text-2xl font-bold">Nexus Professional Console</h1>
              <p className="text-sm text-slate-400">Son kullanıcı için optimize edilmiş yeni kontrol deneyimi.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={fetchContactsAndGroups} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"><RefreshCw size={14} /> Yenile</button>
              <button onClick={() => setIsAdminModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-purple-400/30 bg-purple-400/10 px-3 py-2 text-sm text-purple-300 hover:bg-purple-400/20"><Shield size={14} /> Admin</button>
              <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300 hover:bg-red-400/20"><LogOut size={14} /> Çıkış</button>
            </div>
          </header>

          {tab === 'dashboard' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[['WhatsApp', waStatus], ['Rehber', String(contacts.length)], ['Gruplar', String(groups.length)], ['Planlanan', String(scheduled.filter(s => s.status === 'pending').length)]].map(([title, value]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">{title}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                </div>
              ))}
              <div className="md:col-span-2 xl:col-span-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-slate-300">
                Mesaj alanına <code>{'{{name}}'}</code> veya <code>{'{{phone}}'}</code> yazarak kişiselleştirme yapabilirsiniz.
              </div>
            </div>
          )}

          {tab === 'groups' && (
            <div className="space-y-4">
              <textarea value={currentMessage} onChange={e => setCurrentMessage(e.target.value)} className="h-24 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" placeholder="Gruplara gönderilecek mesaj" />
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
              <div className="flex flex-wrap gap-2">
                <button disabled={isSending || selectedGroupRows.length === 0} onClick={() => bulkSend(selectedGroupRows)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send size={14} /> Seçili Gruplara Gönder</button>
                <button disabled={selectedGroupRows.length === 0} onClick={() => createSchedule(selectedGroupRows[0])} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">İlk seçiliyi planla</button>
              </div>
            </div>
          )}

          {tab === 'contacts' && (
            <div className="space-y-4">
              <textarea value={currentMessage} onChange={e => setCurrentMessage(e.target.value)} className="h-24 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" placeholder="Kişilere gönderilecek mesaj" />
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
              <div className="flex flex-wrap gap-2">
                <button disabled={isSending || selectedContactRows.length === 0} onClick={() => bulkSend(selectedContactRows)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send size={14} /> Seçili Kişilere Gönder</button>
                <button disabled={selectedContactRows.length === 0} onClick={() => createSchedule(selectedContactRows[0])} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">İlk seçiliyi planla</button>
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
                  <div key={item.id} className="flex items-center justify-between border-b border-white/5 px-3 py-2 text-sm">
                    <div>
                      <p>{item.targetName}</p>
                      <p className="text-xs text-slate-400">{new Date(item.scheduledTime).toLocaleString('tr-TR')}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs ${item.status === 'pending' ? 'bg-amber-400/20 text-amber-300' : item.status === 'sent' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>{item.status}</span>
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
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-semibold">Mesaj Ayarları</h2>
              <label className="block text-sm text-slate-300">Mesajlar arası gecikme: {delayMs} ms</label>
              <input type="range" min={1000} max={10000} step={500} value={delayMs} onChange={e => setDelayMs(Number(e.target.value))} className="w-full" />
              <p className="text-xs text-slate-400">Toplu gönderimde anti-spam için ek rastgele gecikme uygulanır.</p>
            </div>
          )}

          {isFetching && <p className="mt-4 text-xs text-slate-500">Veriler yenileniyor...</p>}
        </main>
      </div>

      {isAdminModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-5">
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
              <div className="space-y-3">
                <button onClick={refreshAdminSessions} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">Oturumları yenile</button>
                <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
                  {adminSessions.map(session => (
                    <div key={session.id} className="border-b border-white/10 px-3 py-2 text-xs">
                      <p>{session.id}</p>
                      <p className="text-slate-400">Durum: {session.status} · Kişi: {session.contactsCount} · Grup: {session.groupsCount}</p>
                    </div>
                  ))}
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
