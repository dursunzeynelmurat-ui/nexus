/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  Send, 
  FileSpreadsheet, 
  MessageSquare, 
  User, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  ExternalLink,
  Info,
  Plus,
  Save,
  Clock,
  Image as ImageIcon,
  X,
  Calendar,
  Search,
  ChevronRight,
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  QrCode,
  LogOut,
  RefreshCw,
  Users2,
  CheckSquare,
  Square,
  Zap,
  PlayCircle,
  ArrowRight,
  Activity,
  Shield,
  Tag,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';

// --- Types ---

interface Contact {
  id: string;
  name: string;
  phone: string;
  tags?: string[];
  [key: string]: any;
}

interface Template {
  id: string;
  name: string;
  content: string;
}

interface ScheduledMessage {
  id: string;
  contactId: string;
  templateId?: string;
  customMessage?: string;
  scheduledTime: string; // ISO string
  status: 'pending' | 'sent' | 'missed';
  image?: string; // base64
  isGroup?: boolean;
}

interface Group {
  id: string;
  name: string;
  participantsCount: number;
  tags?: string[];
}

interface GroupList {
  id: string;
  name: string;
  groupIds: string[];
}

// --- App Component ---

export default function App() {
  // WhatsApp State: Client ID (Must be first for prefixing)
  const [clientId, setClientId] = useState<string>(() => {
    let id = localStorage.getItem('wa_client_id');
    if (!id) {
      id = 'c_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('wa_client_id', id);
    }
    return id;
  });

  // State: Templates
  const [templates, setTemplates] = useState<Template[]>(() => {
    const saved = localStorage.getItem(`wa_templates_${clientId}`);
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Hoş Geldiniz', content: 'Merhaba {{Name}}, aramıza hoş geldiniz!' },
      { id: '2', name: 'Randevu Hatırlatma', content: 'Sayın {{Name}}, yarın saat {{Saat}} randevunuzu hatırlatmak isteriz.' }
    ];
  });

  // State: Scheduled Messages
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>(() => {
    const saved = localStorage.getItem(`wa_scheduled_${clientId}`);
    return saved ? JSON.parse(saved) : [];
  });

  // State: Group Lists
  const [groupLists, setGroupLists] = useState<GroupList[]>(() => {
    const saved = localStorage.getItem(`wa_group_lists_${clientId}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [waContactLists, setWaContactLists] = useState<GroupList[]>(() => {
    const saved = localStorage.getItem(`wa_contact_lists_${clientId}`);
    return saved ? JSON.parse(saved) : [];
  });

  // State: Sent Messages History
  const [sentMessages, setSentMessages] = useState<any[]>(() => {
    const saved = localStorage.getItem(`wa_history_${clientId}`);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(`wa_history_${clientId}`, JSON.stringify(sentMessages));
  }, [sentMessages, clientId]);

  // UI State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'templates' | 'scheduler' | 'whatsapp' | 'groups' | 'wa-contacts' | 'settings' | 'history'>('dashboard');
  const [currentTemplate, setCurrentTemplate] = useState("");
  
  // Settings State
  const [messageDelay, setMessageDelay] = useState(3000); // ms
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showSessionId, setShowSessionId] = useState(false);
  
  // WhatsApp State
  const [waStatus, setWaStatus] = useState<'connecting' | 'open' | 'close' | 'qr'>('close');
  const [waQR, setWaQR] = useState<string | null>(null);
  const [waSessionId, setWaSessionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [waContacts, setWaContacts] = useState<Contact[]>([]);
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem(`wa_tags_${clientId}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedWaContacts, setSelectedWaContacts] = useState<string[]>([]);
  const [isFetchingGroups, setIsFetchingGroups] = useState(false);
  const [isFetchingWaContacts, setIsFetchingWaContacts] = useState(false);
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  const [waContactSearchTerm, setWaContactSearchTerm] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{ current: number, total: number } | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newWaListName, setNewWaListName] = useState("");
  const [selectedGroupListId, setSelectedGroupListId] = useState<string>("");
  const [selectedWaListId, setSelectedWaListId] = useState<string>("");
  const [editingGroupListId, setEditingGroupListId] = useState<string | null>(null);
  const [editingWaListId, setEditingWaListId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  // Admin State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('wa_admin_token'));
  const [isAdminConfigured, setIsAdminConfigured] = useState(true);
  const [adminSessions, setAdminSessions] = useState<any[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);

  // Tutorial Logic
  useEffect(() => {
    if (waStatus === 'open') {
      const hasSeen = localStorage.getItem(`velo_tutorial_${clientId}`);
      if (!hasSeen) {
        setShowTutorial(true);
      }
    }
  }, [waStatus, clientId]);

  useEffect(() => {
    fetch('/api/admin/configured')
      .then(res => res.json())
      .then(data => setIsAdminConfigured(Boolean(data.configured)))
      .catch(() => setIsAdminConfigured(false));
  }, []);

  useEffect(() => {
    if (adminToken && !isAdminLoggedIn) {
      setIsAdminLoggedIn(true);
      fetchAdminSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const closeTutorial = () => {
    localStorage.setItem(`velo_tutorial_${clientId}`, 'true');
    setShowTutorial(false);
  };

  const tutorialSteps = [
    {
      title: "Nexus'a Hoş Geldiniz!",
      description: "Profesyonel WhatsApp yönetim aracınız artık hazır. Hadi neler yapabileceğinize hızlıca bakalım.",
      icon: <Activity size={48} className="text-[#10B981]" />
    },
    {
      title: "Panel ve İstatistikler",
      description: "Dashboard üzerinden gönderilen mesajları, rehber durumunuzu ve planlanmış görevlerinizi takip edebilirsiniz.",
      icon: <LayoutDashboard size={48} className="text-[#10B981]" />
    },
    {
      title: "Şablon Yönetimi",
      description: "Sık kullandığınız mesajları şablon olarak kaydedin. {{Name}} gibi değişkenlerle mesajlarınızı kişiselleştirin.",
      icon: <FileText size={48} className="text-[#10B981]" />
    },
    {
      title: "Grup ve Rehber Mesajlaşma",
      description: "Gruplara veya rehberinizdeki kişilere toplu mesajlar gönderin. Excel dosyalarınızı içe aktararak listeler oluşturun.",
      icon: <Users2 size={48} className="text-[#10B981]" />
    },
    {
      title: "Mesaj Planlayıcı",
      description: "Mesajlarınızı ileri bir tarihe planlayın. Nexus, zamanı geldiğinde mesajlarınızı otomatik olarak iletir.",
      icon: <Clock size={48} className="text-[#10B981]" />
    }
  ];

  // Persistence
  useEffect(() => {
    localStorage.setItem(`wa_templates_${clientId}`, JSON.stringify(templates));
  }, [templates, clientId]);

  useEffect(() => {
    localStorage.setItem(`wa_scheduled_${clientId}`, JSON.stringify(scheduledMessages));
  }, [scheduledMessages, clientId]);

  useEffect(() => {
    localStorage.setItem(`wa_group_lists_${clientId}`, JSON.stringify(groupLists));
  }, [groupLists, clientId]);

  useEffect(() => {
    localStorage.setItem(`wa_contact_lists_${clientId}`, JSON.stringify(waContactLists));
  }, [waContactLists, clientId]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // WhatsApp Socket Connection
  useEffect(() => {
    const socket = io({
      auth: {
        clientId: clientId
      },
      extraHeaders: {
        'x-client-id': clientId
      }
    });
    
    socket.on('whatsapp-status', (data: { status: any, qr?: string, sessionId?: string }) => {
      setWaStatus(data.status);
      if (data.qr) setWaQR(data.qr);
      if (data.sessionId) setWaSessionId(data.sessionId);
    });

    // Initial status fetch
    fetch('/api/whatsapp/status', {
      headers: { 'x-client-id': clientId }
    })
      .then(res => res.json())
      .then(data => {
        setWaStatus(data.status);
        if (data.qr) setWaQR(data.qr);
        if (data.sessionId) setWaSessionId(data.sessionId);
        if (data.status === 'open') {
          fetchGroups();
          fetchWaContacts();
        }
      });

    return () => {
      socket.disconnect();
    };
  }, [clientId]);

  useEffect(() => {
    if (waStatus === 'open') {
      fetchGroups();
      fetchWaContacts();
    } else {
      setGroups([]);
      setWaContacts([]);
    }
  }, [waStatus, clientId]);

  useEffect(() => {
    if (!autoRefresh || waStatus !== 'open') return;
    const interval = setInterval(() => {
      fetchGroups();
      fetchWaContacts();
    }, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, waStatus, clientId]);

  useEffect(() => {
    localStorage.setItem(`wa_tags_${clientId}`, JSON.stringify(tagsMap));
  }, [tagsMap, clientId]);

  const handleAddTag = (id: string, tag: string) => {
    if (!tag.trim()) return;
    setTagsMap(prev => {
      const currentTags = prev[id] || [];
      if (currentTags.includes(tag.trim())) return prev;
      return { ...prev, [id]: [...currentTags, tag.trim()] };
    });
  };

  const handleRemoveTag = (id: string, tag: string) => {
    setTagsMap(prev => {
      const currentTags = prev[id] || [];
      return { ...prev, [id]: currentTags.filter(t => t !== tag) };
    });
  };

  const fetchGroups = async () => {
    setIsFetchingGroups(true);
    try {
      const res = await fetch('/api/whatsapp/groups', {
        headers: { 'x-client-id': clientId }
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setNotification({ message: data.error || "Gruplar alınamadı.", type: 'error' });
      }
    } catch (error) {
      console.error("Gruplar alınamadı:", error);
    } finally {
      setIsFetchingGroups(false);
    }
  };

  const fetchWaContacts = async (force = false) => {
    setIsFetchingWaContacts(true);
    try {
      const res = await fetch('/api/whatsapp/contacts', {
        headers: { 'x-client-id': clientId }
      });
      if (res.ok) {
        const data = await res.json();
        setWaContacts(data);
        if (data.length === 0 && waStatus === 'open') {
          setNotification({ message: "Rehber henüz senkronize edilmemiş olabilir. Lütfen birkaç saniye sonra tekrar deneyin.", type: 'info' });
        } else if (data.length > 0 && force) {
          setNotification({ message: `Rehber güncellendi: ${data.length} kişi bulundu.`, type: 'success' });
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setNotification({ message: data.error || "WhatsApp rehberi alınamadı.", type: 'error' });
      }
    } catch (error) {
      console.error("WhatsApp rehberi alınamadı:", error);
    } finally {
      setIsFetchingWaContacts(false);
    }
  };

  // Scheduler Check (every minute)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      scheduledMessages.forEach(msg => {
        if (msg.status === 'pending' && new Date(msg.scheduledTime) <= now) {
          const contact = msg.isGroup 
            ? groups.find(g => g.id === msg.contactId) 
            : waContacts.find(c => c.id === msg.contactId);
            
          if (contact) {
            handleSendNow(msg.isGroup ? { id: contact.id, name: contact.name, phone: contact.id } : contact as Contact, msg.customMessage || "", msg.image, !!msg.isGroup, true);
            setScheduledMessages(prev => prev.map(m => m.id === msg.id ? {...m, status: 'sent'} : m));
          }
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [scheduledMessages, waContacts, waStatus, groups]);

  // --- Handlers ---

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.name || !newTemplate.content) return;
    setTemplates(prev => [{
      id: `t-${Date.now()}`,
      name: newTemplate.name,
      content: newTemplate.content
    }, ...prev]);
    setNewTemplate({ name: '', content: '' });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const formatMessage = (contact: any, text: string) => {
    let msg = text;
    Object.keys(contact).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'gi');
      msg = msg.replace(regex, contact[key]);
    });
    return msg;
  };

  const handleSendNow = async (contact: Contact | { id: string, name: string, phone: string }, text: string, image?: string, isGroup: boolean = false, silent: boolean = false, skipState: boolean = false) => {
    if (waStatus !== 'open') {
      if (!silent) {
        setNotification({ message: "Lütfen önce WhatsApp bağlantısını kurun.", type: 'error' });
        setActiveTab('whatsapp');
      }
      return false;
    }

    if (!text && !image && !selectedImage) {
      if (!silent) setNotification({ message: "Lütfen bir mesaj yazın veya fotoğraf seçin.", type: 'error' });
      return false;
    }

    if (!skipState) setIsSending(true);
    const msg = formatMessage(contact, text);
    
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-client-id': clientId
        },
        body: JSON.stringify({
          phone: contact.phone,
          message: msg,
          image: image || selectedImage,
          isGroup
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gönderim hatası');
      }

      if (!silent) {
        setSentMessages(prev => [
          {
            id: `h-${Date.now()}`,
            to: contact.name,
            phone: contact.phone,
            message: msg,
            timestamp: new Date().toISOString(),
            status: 'sent',
            isGroup
          },
          ...prev.slice(0, 99)
        ]);
      }

      return true;
    } catch (error: any) {
      if (!silent) setNotification({ message: `Hata: ${error.message}`, type: 'error' });
      console.error("Gönderim hatası:", error);
      return false;
    } finally {
      if (!skipState) setIsSending(false);
    }
  };

  const getBulkDelayMs = () => {
    const baseDelay = Math.max(1000, messageDelay);
    const jitter = Math.floor(Math.random() * 2000); // +0-2 seconds
    return baseDelay + jitter;
  };

  const handleBulkSendGroups = async () => {
    if (waStatus !== 'open') {
      setNotification({ message: "Lütfen önce WhatsApp bağlantısını kurun.", type: 'error' });
      setActiveTab('whatsapp');
      return;
    }

    if (selectedGroups.length === 0) {
      setNotification({ message: "Lütfen en az bir grup seçin veya bir liste seçin.", type: 'error' });
      return;
    }
    if (!currentTemplate && !selectedImage) {
      setNotification({ message: "Lütfen bir mesaj metni veya görsel seçin.", type: 'error' });
      return;
    }

    setIsSending(true);
    setBulkProgress({ current: 0, total: selectedGroups.length });
    
    try {
      let successCount = 0;
      for (let i = 0; i < selectedGroups.length; i++) {
        const groupId = selectedGroups[i];
        const group = groups.find(g => g.id === groupId);
        
        setBulkProgress({ current: i + 1, total: selectedGroups.length });
        
        const success = await handleSendNow(
          { id: groupId, name: group?.name || groupId, phone: groupId }, 
          currentTemplate, 
          undefined, 
          true, 
          true, 
          true
        );
        
        if (success) {
          successCount++;
        } else {
          console.error(`Başarısız:`, group?.name || groupId);
        }
        
        if (i < selectedGroups.length - 1) {
          await new Promise(resolve => setTimeout(resolve, getBulkDelayMs()));
        }
      }
      
      setNotification({ message: `Toplu gönderim tamamlandı! Başarılı: ${successCount}, Başarısız: ${selectedGroups.length - successCount}`, type: 'success' });
    } catch (error: any) {
      console.error("Toplu gönderim hatası:", error);
      setNotification({ message: `Toplu gönderim hatası: ${error.message}`, type: 'error' });
    } finally {
      setBulkProgress(null);
      setSelectedGroups([]);
      setSelectedGroupListId("");
      setIsSending(false);
    }
  };

  const handleBulkSendWaContacts = async () => {
    if (waStatus !== 'open') {
      setNotification({ message: "Lütfen önce WhatsApp bağlantısını kurun.", type: 'error' });
      setActiveTab('whatsapp');
      return;
    }

    if (selectedWaContacts.length === 0) {
      setNotification({ message: "Lütfen en az bir kişi seçin veya bir liste seçin.", type: 'error' });
      return;
    }
    if (!currentTemplate && !selectedImage) {
      setNotification({ message: "Lütfen bir mesaj metni veya görsel seçin.", type: 'error' });
      return;
    }

    setIsSending(true);
    setBulkProgress({ current: 0, total: selectedWaContacts.length });
    
    try {
      let successCount = 0;
      for (let i = 0; i < selectedWaContacts.length; i++) {
        const contactId = selectedWaContacts[i];
        const contact = waContacts.find(c => c.id === contactId);
        
        setBulkProgress({ current: i + 1, total: selectedWaContacts.length });
        
        const success = await handleSendNow(
          { id: contactId, name: contact?.name || contactId, phone: contact?.phone || contactId.split('@')[0] }, 
          currentTemplate, 
          undefined, 
          false, 
          true, 
          true
        );
        
        if (success) successCount++;
        
        if (i < selectedWaContacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, getBulkDelayMs()));
        }
      }
      
      setNotification({ message: `Toplu gönderim tamamlandı! Başarılı: ${successCount}, Başarısız: ${selectedWaContacts.length - successCount}`, type: 'success' });
    } catch (error: any) {
      console.error("Toplu gönderim hatası:", error);
      setNotification({ message: `Toplu gönderim hatası: ${error.message}`, type: 'error' });
    } finally {
      setBulkProgress(null);
      setSelectedWaContacts([]);
      setSelectedWaListId("");
      setIsSending(false);
    }
  };

  const handleSaveGroupList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName || selectedGroups.length === 0) {
      setNotification({ message: "Lütfen bir liste adı girin ve en az bir grup seçin.", type: 'error' });
      return;
    }

    if (editingGroupListId) {
      setGroupLists(prev => prev.map(l => l.id === editingGroupListId ? { ...l, name: newGroupName, groupIds: [...selectedGroups] } : l));
      setNotification({ message: "Grup listesi güncellendi!", type: 'success' });
      setEditingGroupListId(null);
    } else {
      const newList: GroupList = {
        id: `gl-${Date.now()}`,
        name: newGroupName,
        groupIds: [...selectedGroups]
      };
      setGroupLists(prev => [newList, ...prev]);
      setNotification({ message: "Grup listesi kaydedildi!", type: 'success' });
    }
    setNewGroupName("");
    setSelectedGroups([]);
  };

  const handleSaveWaContactList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWaListName || selectedWaContacts.length === 0) {
      setNotification({ message: "Lütfen bir liste adı girin ve en az bir kişi seçin.", type: 'error' });
      return;
    }

    if (editingWaListId) {
      setWaContactLists(prev => prev.map(l => l.id === editingWaListId ? { ...l, name: newWaListName, groupIds: [...selectedWaContacts] } : l));
      setNotification({ message: "WhatsApp rehber listesi güncellendi!", type: 'success' });
      setEditingWaListId(null);
    } else {
      const newList: GroupList = {
        id: `wcl-${Date.now()}`,
        name: newWaListName,
        groupIds: [...selectedWaContacts]
      };
      setWaContactLists(prev => [newList, ...prev]);
      setNotification({ message: "WhatsApp rehber listesi kaydedildi!", type: 'success' });
    }
    setNewWaListName("");
    setSelectedWaContacts([]);
  };

  const handleEditGroupList = (list: GroupList) => {
    setEditingGroupListId(list.id);
    setNewGroupName(list.name);
    setSelectedGroups(list.groupIds);
    setActiveTab('groups');
  };

  const handleDeleteGroupList = (id: string) => {
    setGroupLists(prev => prev.filter(l => l.id !== id));
    setNotification({ message: "Grup listesi silindi.", type: 'info' });
  };

  const handleEditWaList = (list: GroupList) => {
    setEditingWaListId(list.id);
    setNewWaListName(list.name);
    setSelectedWaContacts(list.groupIds);
    setActiveTab('wa-contacts');
  };

  const handleDeleteWaList = (id: string) => {
    setWaContactLists(prev => prev.filter(l => l.id !== id));
    setNotification({ message: "Rehber listesi silindi.", type: 'info' });
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/whatsapp/logout', { 
        method: 'POST',
        headers: { 'x-client-id': clientId }
      });
      setNotification({ message: "WhatsApp bağlantısı kesildi.", type: 'info' });
    } catch (error) {
      console.error(error);
      setNotification({ message: "WhatsApp çıkış hatası oluştu.", type: 'error' });
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Tüm geçmiş oturumları ve verileri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
    try {
      await fetch('/api/whatsapp/clear-all', { 
        method: 'POST',
        headers: { 
          'x-client-id': clientId,
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
        }
      });
      
      // Clear local storage
      localStorage.removeItem('wa_client_id');
      localStorage.removeItem(`wa_templates_${clientId}`);
      localStorage.removeItem(`wa_scheduled_${clientId}`);
      localStorage.removeItem(`wa_group_lists_${clientId}`);
      localStorage.removeItem(`wa_contact_lists_${clientId}`);
      
      setNotification({ message: "Tüm oturumlar temizlendi. Sayfa yenileniyor...", type: 'success' });
      if (isAdminLoggedIn) fetchAdminSessions();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error(error);
      setNotification({ message: "Sıfırlama hatası oluştu.", type: 'error' });
    }
  };

  const adminFetch = (url: string, init: RequestInit = {}, tokenOverride?: string | null) => {
    const headers = new Headers(init.headers || {});
    const tokenToUse = tokenOverride ?? adminToken;
    if (tokenToUse) {
      headers.set('Authorization', `Bearer ${tokenToUse}`);
    }
    return fetch(url, { ...init, headers });
  };

  const handleAdminLogin = async () => {
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
      });

      if (!response.ok) {
        setNotification({ message: 'Hatalı kullanıcı adı veya şifre.', type: 'error' });
        return;
      }

      const data = await response.json();
      if (!data.token) {
        setNotification({ message: 'Geçersiz admin yanıtı alındı.', type: 'error' });
        return;
      }

      localStorage.setItem('wa_admin_token', data.token);
      setAdminToken(data.token);
      const sessionFetchSuccess = await fetchAdminSessions(data.token);
      if (!sessionFetchSuccess) {
        return;
      }

      setIsAdminLoggedIn(true);
      setShowAdminLogin(false);
      setNotification({ message: 'Admin girişi başarılı.', type: 'success' });
    } catch (error) {
      console.error(error);
      setNotification({ message: 'Admin girişi sırasında bir hata oluştu.', type: 'error' });
    }
  };

  const fetchAdminSessions = async (tokenOverride?: string | null) => {
    setIsAdminLoading(true);
    try {
      const response = await adminFetch('/api/admin/sessions', {}, tokenOverride);
      if (response.ok) {
        const data = await response.json();
        setAdminSessions(data);
        return true;
      } else if (response.status === 401) {
        localStorage.removeItem('wa_admin_token');
        setAdminToken(null);
        setIsAdminLoggedIn(false);
        setNotification({ message: 'Admin oturumu sona erdi. Lütfen tekrar giriş yapın.', type: 'error' });
      }
      return false;
    } catch (error) {
      console.error('Failed to fetch admin sessions:', error);
      return false;
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm(`Oturumu silmek istediğinize emin misiniz? (${sessionId})`)) return;
    try {
      const response = await adminFetch('/api/admin/delete-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      if (response.ok) {
        setNotification({ message: 'Oturum silindi.', type: 'success' });
        fetchAdminSessions();
      }
    } catch (error) {
      setNotification({ message: 'Oturum silinemedi.', type: 'error' });
    }
  };

  const handleLogoutSession = async (sessionId: string) => {
    if (!window.confirm(`Oturumu kapatmak (çıkış yaptırmak) istediğinize emin misiniz? (${sessionId})`)) return;
    try {
      const response = await adminFetch('/api/admin/logout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      if (response.ok) {
        setNotification({ message: 'Oturum kapatıldı.', type: 'success' });
        fetchAdminSessions();
      }
    } catch (error) {
      setNotification({ message: 'Oturum kapatılamadı.', type: 'error' });
    }
  };

  const handleSchedule = (contact: Contact | Group, isGroup: boolean = false) => {
    if (!scheduleTime) {
      setNotification({ message: "Lütfen bir zaman seçin.", type: 'error' });
      return;
    }
    const newScheduled: ScheduledMessage = {
      id: `s-${Date.now()}`,
      contactId: contact.id,
      customMessage: currentTemplate,
      scheduledTime: scheduleTime,
      status: 'pending',
      image: selectedImage || undefined,
      isGroup
    };
    setScheduledMessages(prev => [...prev, newScheduled]);
    setNotification({ message: "Mesaj planlandı!", type: 'success' });
  };

  // --- Helpers ---

  const filteredContacts = waContacts
    .filter(c => {
      const tags = tagsMap[c.id] || [];
      const search = searchTerm.toLowerCase();
      return c.name.toLowerCase().includes(search) || 
             c.phone.includes(search) ||
             tags.some(t => t.toLowerCase().includes(search));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredGroups = groups
    .filter(g => {
      const tags = tagsMap[g.id] || [];
      const search = groupSearchTerm.toLowerCase();
      return g.name.toLowerCase().includes(search) || 
             tags.some(t => t.toLowerCase().includes(search));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const availableVariables = useMemo(() => {
    if (waContacts.length === 0) return ['Ad', 'Telefon'];
    return Object.keys(waContacts[0]).filter(k => k !== 'id' && k !== 'isGroup');
  }, [waContacts]);

  // --- Render ---

  return (
    <div className="flex min-h-screen bg-[#0F172A] text-slate-200 font-sans">
      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 right-8 z-50 px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 ${
              notification.type === 'success' ? 'bg-[#1E293B] border-[#10B981] text-[#10B981]' :
              notification.type === 'error' ? 'bg-[#1E293B] border-red-500/50 text-red-400' :
              'bg-[#1E293B] border-[#334155] text-slate-400'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 size={20} />}
            {notification.type === 'error' && <AlertCircle size={20} />}
            {notification.type === 'info' && <Info size={20} />}
            <span className="font-bold text-sm">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Sidebar Navigation */}
      {waStatus === 'open' && !isAdminLoggedIn && (
        <aside className="w-64 bg-[#1E293B] border-r border-[#334155] flex flex-col sticky top-0 h-screen">
          <div className="p-6 border-b border-[#334155]">
            <div className="flex items-center gap-2 text-[#10B981] font-bold text-2xl">
              <Activity size={32} fill="currentColor" />
              <span className="tracking-tighter">Nexus</span>
            </div>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            {[
              { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
              { id: 'templates', label: 'Şablonlar', icon: FileText },
              { id: 'scheduler', label: 'Planlayıcı', icon: Clock },
              { id: 'groups', label: 'Gruplar', icon: Users2 },
              { id: 'wa-contacts', label: 'WA Rehberi', icon: User },
              { id: 'whatsapp', label: 'WhatsApp', icon: QrCode },
              { id: 'history', label: 'Geçmiş', icon: History },
              { id: 'settings', label: 'Ayarlar', icon: Settings },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === item.id 
                    ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20' 
                    : 'text-slate-400 hover:bg-[#334155] hover:text-white'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-[#334155] space-y-4">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut size={18} />
              Oturumu Kapat
            </button>
            
            <div className="bg-[#334155] p-4 rounded-xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Kullanım</p>
              <div className="flex justify-between text-xs mb-1">
                <span>WA Rehberi</span>
                <span className="font-bold text-white">{waContacts.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Planlanan</span>
                <span className="font-bold text-white">{scheduledMessages.filter(m => m.status === 'pending').length}</span>
              </div>
            </div>
            <footer className="text-center">
              <p className="text-[10px] text-[#94A3B8] font-medium">created by ZMD 2026</p>
            </footer>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-auto relative">
        {isAdminLoggedIn ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <header className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Admin Paneli</h1>
                <p className="text-slate-400 mt-1">Sistemdeki tüm oturumları yönetin.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={fetchAdminSessions}
                  disabled={isAdminLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-[#1E293B] border border-[#334155] rounded-xl text-sm font-bold text-slate-200 hover:bg-[#334155] transition-all disabled:opacity-50"
                >
                  <RefreshCw size={18} className={isAdminLoading ? 'animate-spin' : ''} />
                  Yenile
                </button>
                <button 
                  onClick={handleClearAll}
                  className="px-6 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm hover:bg-red-500/20 transition-all flex items-center gap-2"
                >
                  <Trash2 size={18} />
                  Sıfırla
                </button>
                <button 
                  onClick={() => {
                    localStorage.removeItem('wa_admin_token');
                    setAdminToken(null);
                    setIsAdminLoggedIn(false);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-[#334155] border border-[#475569] rounded-xl text-sm font-bold text-slate-200 hover:bg-[#475569] transition-all"
                >
                  <LogOut size={18} />
                  Çıkış
                </button>
              </div>
            </header>

            <div className="bg-[#1E293B] rounded-3xl border border-[#334155] shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0F172A] border-b border-[#334155]">
                    <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Kullanıcı / Oturum ID</th>
                    <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Durum</th>
                    <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Kişiler / Gruplar</th>
                    <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {isAdminLoading ? (
                    <tr>
                      <td colSpan={4} className="p-20 text-center">
                        <div className="animate-spin text-[#10B981] flex justify-center mb-4">
                          <RefreshCw size={32} />
                        </div>
                        <p className="text-slate-400 text-sm">Oturumlar yükleniyor...</p>
                      </td>
                    </tr>
                  ) : adminSessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-20 text-center text-slate-500 text-sm italic">
                        Aktif oturum bulunamadı.
                      </td>
                    </tr>
                  ) : adminSessions.map(session => (
                    <tr key={session.id} className="border-b border-[#334155] hover:bg-[#0F172A] transition-colors">
                      <td className="p-6">
                        <div className="font-bold text-sm text-slate-200">{session.userName || 'Bilinmiyor'}</div>
                        <div className="font-mono text-[10px] text-slate-500">{session.id}</div>
                      </td>
                      <td className="p-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          session.status === 'open' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {session.status === 'open' ? 'Aktif' : 'Kapalı'}
                        </span>
                      </td>
                      <td className="p-6 text-sm text-slate-400">
                        {session.contactsCount} Kişi / {session.groupsCount} Grup
                      </td>
                      <td className="p-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleLogoutSession(session.id)}
                            title="Oturumu Kapat"
                            className="p-2 text-amber-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                          >
                            <LogOut size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteSession(session.id)}
                            title="Oturumu Sil"
                            className="p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : waStatus !== 'open' ? (
          <div className="h-full flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl w-full space-y-8"
            >
              <div className="bg-[#1E293B] p-12 rounded-[40px] shadow-2xl border border-[#334155] text-center space-y-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="inline-flex p-6 bg-[#10B981]/10 text-[#10B981] rounded-3xl">
                    <Activity size={48} fill="currentColor" />
                  </div>
                  <h1 className="text-4xl font-extrabold tracking-tighter text-[#10B981]">Nexus</h1>
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">WhatsApp Bağlantısı</h2>
                  <p className="text-slate-400 mt-2">Uygulamayı kullanmak için lütfen telefonunuzu bağlayın.</p>
                </div>

                <div className="flex justify-center">
                  {waStatus === 'qr' && waQR ? (
                    <div className="p-4 bg-white border-4 border-[#10B981] rounded-3xl shadow-lg">
                      <img src={waQR} alt="WhatsApp QR Code" className="w-64 h-64" referrerPolicy="no-referrer" />
                      <p className="text-xs font-bold text-[#10B981] mt-4 uppercase tracking-widest">QR Kodu Tara</p>
                    </div>
                  ) : (
                    <div className="p-12 space-y-4">
                      <div className="animate-spin text-[#10B981] flex justify-center">
                        <RefreshCw size={48} />
                      </div>
                      <p className="text-sm text-slate-400">Bağlantı kuruluyor, lütfen bekleyin...</p>
                    </div>
                  )}
                </div>

                <div className="bg-[#334155] p-6 rounded-2xl text-left space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Nasıl Bağlanır?</h4>
                  <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
                    <li>Telefonunuzda WhatsApp'ı açın.</li>
                    <li>Ayarlar {'>'} Bağlı Cihazlar'a gidin.</li>
                    <li>Cihaz Bağla'ya dokunun.</li>
                    <li>Ekrandaki QR kodu taratın.</li>
                  </ol>
                </div>

                <div className="pt-4 border-t border-[#334155] flex flex-col gap-4">
                  {isAdminConfigured ? (
                    <button 
                      onClick={() => setShowAdminLogin(true)}
                      className="text-xs text-slate-500 hover:text-slate-300 font-medium transition-colors flex items-center gap-1 mx-auto"
                    >
                      <Settings size={12} />
                      Yönetici Girişi
                    </button>
                  ) : (
                    <p className="text-[11px] text-amber-400 text-center">
                      Yönetici girişi sunucuda yapılandırılmamış.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Admin Login Modal */}
            <AnimatePresence>
              {showAdminLogin && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="bg-[#1E293B] max-w-md w-full rounded-[40px] shadow-2xl border border-[#334155] p-12 space-y-8"
                  >
                    <div className="text-center space-y-2">
                      <div className="inline-flex p-4 bg-blue-500/10 text-blue-400 rounded-2xl mb-4">
                        <Settings size={32} />
                      </div>
                      <h2 className="text-2xl font-bold text-white">Yönetici Girişi</h2>
                      <p className="text-sm text-slate-400">Lütfen yönetici kimlik bilgilerinizi girin.</p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kullanıcı Adı</label>
                        <input 
                          type="text"
                          value={adminUsername}
                          onChange={(e) => setAdminUsername(e.target.value)}
                          className="w-full bg-[#0F172A] border border-[#334155] rounded-2xl p-4 text-white focus:outline-none focus:border-[#10B981] transition-all"
                          placeholder="Kullanıcı adı"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Şifre</label>
                        <input 
                          type="password"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="w-full bg-[#0F172A] border border-[#334155] rounded-2xl p-4 text-white focus:outline-none focus:border-[#10B981] transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button 
                        onClick={() => setShowAdminLogin(false)}
                        className="flex-1 py-4 bg-[#334155] text-white rounded-2xl font-bold hover:bg-[#475569] transition-all"
                      >
                        İptal
                      </button>
                      <button 
                        onClick={handleAdminLogin}
                        className="flex-1 py-4 bg-[#10B981] text-white rounded-2xl font-bold hover:bg-[#059669] transition-all shadow-lg shadow-[#10B981]/20"
                      >
                        Giriş Yap
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Subtle Session ID */}
            <div className="fixed bottom-4 right-4 text-[10px] text-[#94A3B8] font-mono opacity-30 hover:opacity-100 transition-opacity">
              ID: {waSessionId || clientId}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {showTutorial && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  className="bg-[#1E293B] max-w-lg w-full rounded-[40px] shadow-2xl overflow-hidden border border-[#334155]"
                >
                  <div className="p-12 text-center space-y-8">
                    <div className="flex justify-center">
                      <div className="p-6 bg-[#10B981]/10 rounded-3xl">
                        {tutorialSteps[tutorialStep].icon}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h2 className="text-3xl font-bold tracking-tight text-white">
                        {tutorialSteps[tutorialStep].title}
                      </h2>
                      <p className="text-slate-400 leading-relaxed">
                        {tutorialSteps[tutorialStep].description}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      {tutorialSteps.map((_, idx) => (
                        <div 
                          key={idx}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            idx === tutorialStep ? 'w-8 bg-[#10B981]' : 'w-2 bg-[#334155]'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="flex gap-4">
                      {tutorialStep > 0 ? (
                        <button
                          onClick={() => setTutorialStep(prev => prev - 1)}
                          className="flex-1 py-4 bg-[#334155] text-slate-300 rounded-2xl font-bold hover:bg-[#475569] transition-all"
                        >
                          Geri
                        </button>
                      ) : (
                        <button
                          onClick={closeTutorial}
                          className="flex-1 py-4 bg-[#334155] text-slate-300 rounded-2xl font-bold hover:bg-[#475569] transition-all"
                        >
                          Atla
                        </button>
                      )}
                      
                      {tutorialStep < tutorialSteps.length - 1 ? (
                        <button
                          onClick={() => setTutorialStep(prev => prev + 1)}
                          className="flex-1 py-4 bg-[#10B981] text-white rounded-2xl font-bold shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] transition-all flex items-center justify-center gap-2"
                        >
                          İleri <ArrowRight size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={closeTutorial}
                          className="flex-1 py-4 bg-[#10B981] text-white rounded-2xl font-bold shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] transition-all flex items-center justify-center gap-2"
                        >
                          Hadi Başlayalım! <PlayCircle size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          
          {/* DASHBOARD */}
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">Panel</h1>
                  <p className="text-slate-400 mt-1">Hoş geldiniz, Nexus ile mesajlarınızı yönetin.</p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-[#1E293B] p-4 rounded-2xl shadow-sm border border-[#334155] flex items-center gap-4">
                    <div className="p-3 bg-[#10B981]/20 text-[#10B981] rounded-xl border border-[#10B981]/30">
                      <User size={24} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">WA Kişileri</p>
                      <p className="text-xl font-bold text-white">{waContacts.length}</p>
                    </div>
                  </div>
                  <div className="bg-[#1E293B] p-4 rounded-2xl shadow-sm border border-[#334155] flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-500/30">
                      <Clock size={24} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Bekleyen Mesaj</p>
                      <p className="text-xl font-bold text-white">{scheduledMessages.filter(m => m.status === 'pending').length}</p>
                    </div>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Quick Compose */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-[#1E293B] p-8 rounded-3xl shadow-sm border border-[#334155] space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                        <MessageSquare className="text-[#10B981]" />
                        Mesaj Oluştur
                      </h2>
                      <select 
                        className="text-xs bg-[#334155] border-none rounded-lg px-3 py-2 font-medium text-slate-200"
                        onChange={(e) => {
                          const t = templates.find(x => x.id === e.target.value);
                          if (t) setCurrentTemplate(t.content);
                        }}
                      >
                        <option value="">Şablon Seçin...</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-4">
                      <textarea 
                        value={currentTemplate}
                        onChange={(e) => setCurrentTemplate(e.target.value)}
                        placeholder="Mesajınızı buraya yazın..."
                        className="w-full h-48 p-4 bg-[#0F172A] rounded-2xl border border-[#334155] focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all resize-none text-sm text-slate-200"
                      />
                      
                      <div className="flex flex-wrap gap-2">
                        {availableVariables.map(v => (
                          <button 
                            key={v}
                            onClick={() => setCurrentTemplate(p => p + ` {{${v}}}`)}
                            className="px-3 py-1.5 bg-[#334155] hover:bg-[#475569] rounded-lg text-[10px] font-bold text-slate-300 transition-colors"
                          >
                            + {v}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fotoğraf Ekle</label>
                          <div 
                            onClick={() => imageInputRef.current?.click()}
                            className="flex items-center gap-3 p-3 bg-[#0F172A] border border-dashed border-[#334155] rounded-xl cursor-pointer hover:bg-[#334155] transition-all"
                          >
                            <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                            {selectedImage ? (
                              <img src={selectedImage} alt="Seçilen Görsel" className="w-10 h-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <ImageIcon size={20} className="text-[#94A3B8]" />
                            )}
                            <span className="text-xs text-[#64748B]">{selectedImage ? 'Fotoğraf Seçildi' : 'Fotoğraf Seç...'}</span>
                            {selectedImage && (
                              <button onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }} className="ml-auto text-red-500">
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="w-64">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Planla (Tarih & Saat)</label>
                            {scheduleTime && (
                              <button 
                                onClick={() => setScheduleTime("")}
                                className="text-[10px] text-red-400 hover:underline"
                              >
                                Temizle
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <input 
                              type="datetime-local" 
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                              className="w-full p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-xs text-slate-200 focus:border-[#10B981] transition-all"
                            />
                          </div>
                          <div className="flex gap-1 mt-2">
                            {[
                              { label: '+1s', value: 1 },
                              { label: '+3s', value: 3 },
                              { label: '+6s', value: 6 },
                              { label: 'Yarın', value: 24 },
                            ].map(preset => (
                              <button
                                key={preset.label}
                                onClick={() => {
                                  const now = new Date();
                                  now.setHours(now.getHours() + preset.value);
                                  // Format to YYYY-MM-DDTHH:mm
                                  const formatted = now.toISOString().slice(0, 16);
                                  setScheduleTime(formatted);
                                }}
                                className="flex-1 py-1 bg-[#334155] hover:bg-[#475569] rounded-lg text-[9px] font-bold text-slate-400 transition-colors"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats / Tips */}
                <div className="space-y-6">
                  <div className="bg-[#10B981]/10 p-8 rounded-3xl text-white shadow-xl border border-[#10B981]/20">
                    <h3 className="font-bold text-lg mb-2 text-[#10B981]">Hızlı Gönderim</h3>
                    <p className="text-sm text-slate-400 mb-6">WhatsApp rehberinizdeki kişilere veya kayıtlı gruplara tek tıkla mesaj gönderin.</p>
                    
                    <div className="space-y-4">
                      <button 
                        onClick={() => setActiveTab('wa-contacts')}
                        className="w-full py-3 bg-[#10B981] text-white rounded-xl font-bold text-sm hover:bg-opacity-90 transition-all shadow-lg shadow-[#10B981]/20"
                      >
                        WA Rehberini Görüntüle
                      </button>

                      <div className="pt-4 border-t border-[#334155]">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Grup Listesi Seç</label>
                        <select 
                          value={selectedGroupListId}
                          onChange={(e) => {
                            const listId = e.target.value;
                            setSelectedGroupListId(listId);
                            if (listId === "") {
                              setSelectedGroups([]);
                            } else {
                              const list = groupLists.find(l => l.id === listId);
                              if (list) setSelectedGroups(list.groupIds);
                            }
                          }}
                          className="w-full p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-xs text-slate-200 focus:outline-none focus:bg-[#1E293B]"
                        >
                          <option value="" className="text-slate-400">Grup Listesi Seçin...</option>
                          {groupLists.map(list => (
                            <option key={list.id} value={list.id} className="text-white">{list.name} ({list.groupIds.length} Grup)</option>
                          ))}
                        </select>
                        
                        <button 
                          onClick={() => {
                            if (!selectedGroupListId) {
                              setNotification({ message: "Lütfen önce bir grup listesi seçin.", type: 'error' });
                              return;
                            }
                            handleBulkSendGroups();
                          }}
                          disabled={!selectedGroupListId || isSending}
                          className="w-full mt-3 py-3 bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 rounded-xl font-bold text-sm hover:bg-[#10B981]/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSending && bulkProgress ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              Gönderiliyor... ({bulkProgress.current}/{bulkProgress.total})
                            </>
                          ) : (
                            'Seçili Grup Listesine Gönder'
                          )}
                        </button>
                      </div>

                      <div className="pt-4 border-t border-[#334155]">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">WhatsApp Rehber Listesi Seç</label>
                        <select 
                          value={selectedWaListId}
                          onChange={(e) => {
                            const listId = e.target.value;
                            setSelectedWaListId(listId);
                            if (listId === "") {
                              setSelectedWaContacts([]);
                            } else {
                              const list = waContactLists.find(l => l.id === listId);
                              if (list) setSelectedWaContacts(list.groupIds);
                            }
                          }}
                          className="w-full p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-xs text-slate-200 focus:outline-none focus:bg-[#1E293B]"
                        >
                          <option value="" className="text-slate-400">Rehber Listesi Seçin...</option>
                          {waContactLists.map(list => (
                            <option key={list.id} value={list.id} className="text-white">{list.name} ({list.groupIds.length} Kişi)</option>
                          ))}
                        </select>
                        
                        <button 
                          onClick={() => {
                            if (!selectedWaListId) {
                              setNotification({ message: "Lütfen önce bir rehber listesi seçin.", type: 'error' });
                              return;
                            }
                            handleBulkSendWaContacts();
                          }}
                          disabled={!selectedWaListId || isSending}
                          className="w-full mt-3 py-3 bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 rounded-xl font-bold text-sm hover:bg-[#10B981]/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSending && bulkProgress ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              Gönderiliyor... ({bulkProgress.current}/{bulkProgress.total})
                            </>
                          ) : (
                            'Seçili Rehber Listesine Gönder'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm">
                    <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-white">
                      <Send size={16} className="text-[#10B981]" />
                      Test Mesajı
                    </h3>
                    <div className="space-y-3">
                      <input 
                        type="tel" 
                        placeholder="Telefon (Örn: 905...)"
                        id="test-phone"
                        className="w-full p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-xs text-slate-200"
                      />
                      <button 
                        onClick={() => {
                          const phone = (document.getElementById('test-phone') as HTMLInputElement).value;
                          if (!phone) {
                            setNotification({ message: "Lütfen bir telefon numarası girin.", type: 'error' });
                            return;
                          }
                          handleSendNow({ id: 'test', name: 'Test', phone: phone.replace(/\D/g, '') }, "Bu bir test mesajıdır.");
                        }}
                        disabled={isSending || waStatus !== 'open'}
                        className="w-full py-2 bg-[#334155] text-slate-200 rounded-xl font-bold text-xs hover:bg-[#475569] transition-all disabled:opacity-50"
                      >
                        Test Gönder
                      </button>
                    </div>
                  </div>

                  </div>
                </div>

            </motion.div>
          )}

          {/* TEMPLATES */}
          {activeTab === 'templates' && (
            <motion.div 
              key="templates"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="space-y-8"
            >
              <header>
                <h1 className="text-3xl font-bold tracking-tight text-white">Mesaj Şablonlar</h1>
                <p className="text-slate-400 mt-1">Sık kullandığınız mesajları kaydedin.</p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                  <form onSubmit={handleSaveTemplate} className="bg-[#1E293B] p-8 rounded-3xl border border-[#334155] shadow-sm space-y-6">
                    <h3 className="font-bold text-lg text-white">Yeni Şablon</h3>
                    <div className="space-y-4">
                      <input 
                        type="text" 
                        placeholder="Şablon Adı"
                        value={newTemplate.name}
                        onChange={e => setNewTemplate({...newTemplate, name: e.target.value})}
                        className="w-full p-4 bg-[#0F172A] border border-[#334155] rounded-2xl text-sm text-slate-200"
                      />
                      <textarea 
                        placeholder="Mesaj İçeriği..."
                        value={newTemplate.content}
                        onChange={e => setNewTemplate({...newTemplate, content: e.target.value})}
                        className="w-full h-48 p-4 bg-[#0F172A] border border-[#334155] rounded-2xl text-sm resize-none text-slate-200"
                      />
                      <button className="w-full py-4 bg-[#10B981] text-white rounded-2xl font-bold shadow-lg shadow-[#10B981]/20 hover:translate-y-[-2px] transition-all active:translate-y-0">
                        Şablonu Kaydet
                      </button>
                    </div>
                  </form>
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {templates.map(template => (
                    <div key={template.id} className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm hover:border-[#10B981] transition-all group relative">
                      <button 
                        onClick={() => setTemplates(prev => prev.filter(t => t.id !== template.id))}
                        className="absolute top-4 right-4 p-2 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={16} />
                      </button>
                      <h4 className="font-bold text-white mb-3">{template.name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-4 leading-relaxed italic">"{template.content}"</p>
                      <div className="mt-6 pt-4 border-t border-[#334155] flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Şablon</span>
                        <button 
                          onClick={() => {
                            setCurrentTemplate(template.content);
                            setActiveTab('dashboard');
                          }}
                          className="text-xs font-bold text-[#10B981] flex items-center gap-1 hover:gap-2 transition-all"
                        >
                          Kullan <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* SCHEDULER */}
          {activeTab === 'scheduler' && (
            <motion.div 
              key="scheduler"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header>
                <h1 className="text-3xl font-bold tracking-tight text-white">Mesaj Planlayıcı</h1>
                <p className="text-slate-400 mt-1">Zamanı gelen mesajları buradan takip edin.</p>
              </header>

              <div className="bg-[#1E293B] rounded-3xl border border-[#334155] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0F172A] border-b border-[#334155]">
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Alıcı</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Planlanan Zaman</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Mesaj</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Durum</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledMessages.map(msg => {
                      const contact = waContacts.find(c => c.id === msg.contactId);
                      const isReady = new Date(msg.scheduledTime) <= new Date();
                      
                      return (
                        <tr key={msg.id} className="border-b border-[#334155] hover:bg-[#0F172A] transition-colors">
                          <td className="p-6">
                            <div className="font-bold text-sm text-slate-200">{contact?.name || 'Bilinmiyor'}</div>
                            <div className="text-xs text-slate-400">{msg.isGroup ? 'Grup' : `+${(contact as Contact)?.phone}`}</div>
                          </td>
                          <td className="p-6">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                              <Calendar size={14} className="text-blue-400" />
                              {new Date(msg.scheduledTime).toLocaleString('tr-TR')}
                            </div>
                          </td>
                          <td className="p-6">
                            <p className="text-xs text-slate-400 line-clamp-1 italic">"{msg.customMessage}"</p>
                          </td>
                          <td className="p-6">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              msg.status === 'sent' 
                                ? 'bg-[#10B981]/10 text-[#10B981]' 
                                : isReady 
                                  ? 'bg-amber-500/10 text-amber-400 animate-pulse' 
                                  : 'bg-slate-700 text-slate-400'
                            }`}>
                              {msg.status === 'sent' ? 'Gönderildi' : isReady ? 'Zamanı Geldi' : 'Bekliyor'}
                            </span>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => {
                                  const contact = msg.isGroup 
                                    ? groups.find(g => g.id === msg.contactId) 
                                    : waContacts.find(c => c.id === msg.contactId);
                                    
                                  if (contact) {
                                    handleSendNow(msg.isGroup ? { id: contact.id, name: contact.name, phone: contact.id } : contact as Contact, msg.customMessage || "", msg.image, !!msg.isGroup);
                                    setScheduledMessages(prev => prev.map(m => m.id === msg.id ? {...m, status: 'sent'} : m));
                                  }
                                }}
                                className={`p-2 rounded-lg transition-all ${
                                  isReady ? 'text-[#10B981] bg-[#10B981]/10 hover:scale-110' : 'text-slate-600 cursor-not-allowed'
                                }`}
                                disabled={!isReady || isSending}
                              >
                                <Send size={18} />
                              </button>
                              <button 
                                onClick={() => setScheduledMessages(prev => prev.filter(m => m.id !== msg.id))}
                                className="p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {scheduledMessages.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-20 text-center text-slate-500 text-sm italic">
                          Planlanmış mesaj bulunmuyor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* GROUPS */}
          {activeTab === 'groups' && (
            <motion.div 
              key="groups"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">Grup Yönetimi</h1>
                  <p className="text-slate-400 mt-1">Katıldığınız grupları görün ve toplu mesaj gönderin.</p>
                </div>
                <button 
                  onClick={fetchGroups}
                  disabled={isFetchingGroups || waStatus !== 'open'}
                  className="flex items-center gap-2 px-6 py-3 bg-[#1E293B] border border-[#334155] rounded-xl text-sm font-bold text-slate-200 hover:bg-[#334155] transition-all disabled:opacity-50"
                >
                  <RefreshCw size={18} className={isFetchingGroups ? 'animate-spin' : ''} />
                  Grupları Yenile
                </button>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm space-y-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                      <MessageSquare size={16} className="text-[#10B981]" />
                      Toplu Grup Mesajı
                    </h3>
                    <p className="text-xs text-slate-400">Seçili gruplara mevcut şablonu veya yazdığınız mesajı gönderin.</p>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Mesaj Önizleme</label>
                      <div className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-xs text-slate-400 italic line-clamp-3">
                        {currentTemplate || "Henüz mesaj yazılmadı..."}
                      </div>
                    </div>

                    {bulkProgress && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-slate-400">
                          <span>GÖNDERİLİYOR...</span>
                          <span>{bulkProgress.current} / {bulkProgress.total}</span>
                        </div>
                        <div className="w-full bg-[#334155] h-2 rounded-full overflow-hidden">
                          <motion.div 
                            className="bg-[#10B981] h-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-2">
                      <button 
                        onClick={handleBulkSendGroups}
                        disabled={selectedGroups.length === 0 || isSending || waStatus !== 'open' || bulkProgress !== null}
                        className="w-full py-3 bg-[#10B981] text-white rounded-xl font-bold text-sm hover:bg-[#059669] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Send size={16} />
                        {bulkProgress ? 'Gönderiliyor...' : `${selectedGroups.length} Gruba Gönder`}
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm space-y-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                      <Save size={16} className="text-[#10B981]" />
                      {editingGroupListId ? 'Grup Listesini Güncelle' : 'Seçili Grupları Kaydet'}
                    </h3>
                    <form onSubmit={handleSaveGroupList} className="space-y-3">
                      <input 
                        type="text" 
                        placeholder="Liste Adı (Örn: Müşteriler)"
                        value={newGroupName}
                        onChange={e => setNewGroupName(e.target.value)}
                        className="w-full p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-sm text-white placeholder:text-slate-500"
                      />
                      <p className="text-[10px] text-slate-400">{selectedGroups.length} grup seçildi.</p>
                      <div className="flex gap-2">
                        <button 
                          type="submit"
                          disabled={selectedGroups.length === 0 || !newGroupName}
                          className="flex-1 py-3 bg-[#334155] text-slate-200 rounded-xl font-bold text-sm hover:bg-[#475569] transition-all disabled:opacity-50"
                        >
                          {editingGroupListId ? 'Güncelle' : 'Listeyi Kaydet'}
                        </button>
                        {editingGroupListId && (
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingGroupListId(null);
                              setNewGroupName("");
                              setSelectedGroups([]);
                            }}
                            className="px-4 py-3 bg-red-500/10 text-red-400 rounded-xl font-bold text-sm hover:bg-red-500/20 transition-all"
                          >
                            İptal
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  {groupLists.length > 0 && (
                    <div className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm space-y-4">
                      <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                        <Users2 size={16} className="text-[#10B981]" />
                        Kayıtlı Listeler
                      </h3>
                      <div className="space-y-2">
                        {groupLists.map(list => (
                          <div key={list.id} className={`flex items-center justify-between p-3 rounded-xl group transition-all ${selectedGroupListId === list.id ? 'bg-[#10B981]/10 border border-[#10B981]' : 'bg-[#0F172A] border border-transparent'}`}>
                            <button 
                              onClick={() => {
                                if (selectedGroupListId === list.id) {
                                  setSelectedGroupListId("");
                                  setSelectedGroups([]);
                                } else {
                                  setSelectedGroups(list.groupIds);
                                  setSelectedGroupListId(list.id);
                                }
                              }}
                              className="flex-1 text-left"
                            >
                              <p className="text-xs font-bold text-white">{list.name}</p>
                              <p className="text-[10px] text-slate-500">{list.groupIds.length} Grup</p>
                            </button>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleEditGroupList(list)}
                                className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg"
                                title="Düzenle"
                              >
                                <Settings size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteGroupList(list.id)}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"
                                title="Sil"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text" 
                      placeholder="Gruplarda veya etiketlerde ara..."
                      value={groupSearchTerm}
                      onChange={e => setGroupSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-[#1E293B] border border-[#334155] rounded-2xl shadow-sm focus:ring-2 focus:ring-[#10B981] border-transparent transition-all text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="bg-[#1E293B] rounded-3xl border border-[#334155] shadow-sm overflow-hidden">
                    <div className="p-4 bg-[#334155] border-b border-[#334155] flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Grup Listesi ({filteredGroups.length})</span>
                      <button 
                        onClick={() => {
                          if (selectedGroups.length === filteredGroups.length) setSelectedGroups([]);
                          else setSelectedGroups(filteredGroups.map(g => g.id));
                        }}
                        className="text-[10px] font-bold text-[#10B981] uppercase hover:underline"
                      >
                        {selectedGroups.length === filteredGroups.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                      </button>
                    </div>
                    <div className="max-h-[600px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <tbody className="divide-y divide-[#334155]">
                          {filteredGroups.map(group => (
                            <tr 
                              key={group.id} 
                              className={`border-b border-[#334155] hover:bg-[#334155]/50 transition-colors cursor-pointer ${selectedGroups.includes(group.id) ? 'bg-[#10B981]/10' : ''}`}
                              onClick={() => {
                                setSelectedGroups(prev => 
                                  prev.includes(group.id) ? prev.filter(id => id !== group.id) : [...prev, group.id]
                                );
                              }}
                            >
                              <td className="p-4 w-12">
                                {selectedGroups.includes(group.id) ? (
                                  <CheckSquare className="text-[#10B981]" size={20} />
                                ) : (
                                  <Square className="text-slate-600" size={20} />
                                )}
                              </td>
                              <td className="p-4">
                                <div className="font-bold text-sm text-white">{group.name}</div>
                                <div className="text-[10px] text-slate-500">{group.participantsCount} Katılımcı</div>
                                
                                {/* Tags UI */}
                                <div className="flex flex-wrap gap-1 mt-2" onClick={e => e.stopPropagation()}>
                                  {(tagsMap[group.id] || []).map(tag => (
                                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-[#10B981]/10 text-[#10B981] text-[9px] font-bold rounded-full border border-[#10B981]/20">
                                      {tag}
                                      <button onClick={() => handleRemoveTag(group.id, tag)} className="hover:text-red-400">
                                        <X size={8} />
                                      </button>
                                    </span>
                                  ))}
                                  <button 
                                    onClick={() => {
                                      const tag = prompt("Yeni etiket girin:");
                                      if (tag) handleAddTag(group.id, tag);
                                    }}
                                    className="px-2 py-0.5 bg-[#334155] text-slate-400 text-[9px] font-bold rounded-full hover:bg-[#475569] flex items-center gap-1"
                                  >
                                    <Tag size={8} />
                                    Ekle
                                  </button>
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendNow({ id: group.id, name: group.name, phone: group.id }, currentTemplate, undefined, true);
                                  }}
                                  className="p-2 text-[#10B981] hover:bg-[#334155] rounded-lg transition-colors"
                                  title="Sadece Bu Gruba Gönder"
                                >
                                  <Send size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {groups.length === 0 && !isFetchingGroups && (
                            <tr>
                              <td className="p-12 text-center text-slate-500 text-sm italic">
                                {waStatus === 'open' ? 'Grup bulunamadı.' : 'Lütfen önce WhatsApp bağlantısını kurun.'}
                              </td>
                            </tr>
                          )}
                          {isFetchingGroups && (
                            <tr>
                              <td className="p-12 text-center text-slate-500 text-sm italic">
                                Gruplar yükleniyor...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* WA CONTACTS */}
          {activeTab === 'wa-contacts' && (
            <motion.div 
              key="wa-contacts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">WhatsApp Rehberi</h1>
                  <p className="text-slate-400 mt-1">
                    {waContacts.length} kişi bulundu. {waStatus === 'open' ? 'Bağlantı aktif.' : 'Bağlantı bekleniyor.'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => fetchWaContacts(true)}
                    disabled={isFetchingWaContacts || waStatus !== 'open'}
                    className="flex items-center gap-2 px-6 py-3 bg-[#1E293B] border border-[#334155] rounded-xl text-sm font-bold text-slate-200 hover:bg-[#334155] transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={isFetchingWaContacts ? 'animate-spin' : ''} />
                    {isFetchingWaContacts ? 'Senkronize Ediliyor...' : 'Rehberi Yenile'}
                  </button>
                  <button 
                    onClick={() => {
                      setNotification({ message: "Derin senkronizasyon başlatıldı. Bu işlem birkaç dakika sürebilir.", type: 'info' });
                      fetchWaContacts(true);
                    }}
                    disabled={isFetchingWaContacts || waStatus !== 'open'}
                    className="flex items-center gap-2 px-6 py-3 bg-[#10B981] text-white rounded-xl text-sm font-bold hover:bg-[#059669] transition-all shadow-lg shadow-[#10B981]/20 disabled:opacity-50"
                  >
                    <Users size={18} />
                    Derin Senkronizasyon
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm space-y-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                      <MessageSquare size={16} className="text-[#10B981]" />
                      Toplu Rehber Mesajı
                    </h3>
                    <p className="text-xs text-slate-400">Seçili kişilere mevcut şablonu veya yazdığınız mesajı gönderin.</p>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Mesaj Önizleme</label>
                      <div className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-xs text-slate-400 italic line-clamp-3">
                        {currentTemplate || "Henüz mesaj yazılmadı..."}
                      </div>
                    </div>

                    {bulkProgress && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-slate-400">
                          <span>GÖNDERİLİYOR...</span>
                          <span>{bulkProgress.current} / {bulkProgress.total}</span>
                        </div>
                        <div className="w-full bg-[#334155] h-2 rounded-full overflow-hidden">
                          <motion.div 
                            className="bg-[#10B981] h-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-2">
                      <button 
                        onClick={handleBulkSendWaContacts}
                        disabled={selectedWaContacts.length === 0 || isSending || waStatus !== 'open' || bulkProgress !== null}
                        className="w-full py-3 bg-[#10B981] text-white rounded-xl font-bold text-sm hover:bg-[#059669] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Send size={16} />
                        {bulkProgress ? 'Gönderiliyor...' : `${selectedWaContacts.length} Kişiye Gönder`}
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm space-y-4">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                      <Save size={16} className="text-[#10B981]" />
                      {editingWaListId ? 'Rehber Listesini Güncelle' : 'Seçili Kişileri Kaydet'}
                    </h3>
                    <form onSubmit={handleSaveWaContactList} className="space-y-3">
                      <input 
                        type="text" 
                        placeholder="Liste Adı (Örn: VIP Müşteriler)"
                        value={newWaListName}
                        onChange={e => setNewWaListName(e.target.value)}
                        className="w-full p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-sm text-white placeholder:text-slate-500"
                      />
                      <p className="text-[10px] text-slate-400">{selectedWaContacts.length} kişi seçildi.</p>
                      <div className="flex gap-2">
                        <button 
                          type="submit"
                          disabled={selectedWaContacts.length === 0 || !newWaListName}
                          className="flex-1 py-3 bg-[#334155] text-slate-200 rounded-xl font-bold text-sm hover:bg-[#475569] transition-all disabled:opacity-50"
                        >
                          {editingWaListId ? 'Güncelle' : 'Listeyi Kaydet'}
                        </button>
                        {editingWaListId && (
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingWaListId(null);
                              setNewWaListName("");
                              setSelectedWaContacts([]);
                            }}
                            className="px-4 py-3 bg-red-500/10 text-red-400 rounded-xl font-bold text-sm hover:bg-red-500/20 transition-all"
                          >
                            İptal
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  {waContactLists.length > 0 && (
                    <div className="bg-[#1E293B] p-6 rounded-3xl border border-[#334155] shadow-sm space-y-4">
                      <h3 className="font-bold text-sm flex items-center gap-2 text-white">
                        <User size={16} className="text-[#10B981]" />
                        Kayıtlı Rehber Listeleri
                      </h3>
                      <div className="space-y-2">
                        {waContactLists.map(list => (
                          <div key={list.id} className={`flex items-center justify-between p-3 rounded-xl group transition-all ${selectedWaListId === list.id ? 'bg-[#10B981]/10 border border-[#10B981]' : 'bg-[#0F172A] border border-transparent'}`}>
                            <button 
                              onClick={() => {
                                if (selectedWaListId === list.id) {
                                  setSelectedWaListId("");
                                  setSelectedWaContacts([]);
                                } else {
                                  setSelectedWaContacts(list.groupIds);
                                  setSelectedWaListId(list.id);
                                }
                              }}
                              className="flex-1 text-left"
                            >
                              <p className="text-xs font-bold text-white">{list.name}</p>
                              <p className="text-[10px] text-slate-500">{list.groupIds.length} Kişi</p>
                            </button>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleEditWaList(list)}
                                className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg"
                                title="Düzenle"
                              >
                                <Settings size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteWaList(list.id)}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"
                                title="Sil"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text" 
                      placeholder="Rehberde veya etiketlerde ara..."
                      value={waContactSearchTerm}
                      onChange={e => setWaContactSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-[#1E293B] border border-[#334155] rounded-2xl shadow-sm focus:ring-2 focus:ring-[#10B981] border-transparent transition-all text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="bg-[#1E293B] rounded-3xl border border-[#334155] shadow-sm overflow-hidden">
                    <div className="p-4 bg-[#334155] border-b border-[#334155] flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                        Kişi Listesi ({
                          waContacts
                            .filter(c => {
                              const tags = tagsMap[c.id] || [];
                              const search = waContactSearchTerm.toLowerCase();
                              return c.name.toLowerCase().includes(search) || tags.some(t => t.toLowerCase().includes(search));
                            })
                            .length
                        })
                      </span>
                      <button 
                        onClick={() => {
                          const filtered = waContacts
                            .filter(c => {
                              const tags = tagsMap[c.id] || [];
                              const search = waContactSearchTerm.toLowerCase();
                              return c.name.toLowerCase().includes(search) || tags.some(t => t.toLowerCase().includes(search));
                            });
                          if (selectedWaContacts.length === filtered.length) setSelectedWaContacts([]);
                          else setSelectedWaContacts(filtered.map(c => c.id));
                        }}
                        className="text-[10px] font-bold text-[#10B981] uppercase hover:underline"
                      >
                        {selectedWaContacts.length === waContacts.filter(c => {
                          const tags = tagsMap[c.id] || [];
                          const search = waContactSearchTerm.toLowerCase();
                          return c.name.toLowerCase().includes(search) || tags.some(t => t.toLowerCase().includes(search));
                        }).length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                      </button>
                    </div>
                    <div className="max-h-[600px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <tbody className="divide-y divide-[#334155]">
                          {waContacts
                            .filter(c => {
                              const tags = tagsMap[c.id] || [];
                              const search = waContactSearchTerm.toLowerCase();
                              return c.name.toLowerCase().includes(search) || tags.some(t => t.toLowerCase().includes(search));
                            })
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(contact => (
                            <tr 
                              key={contact.id} 
                              className={`border-b border-[#334155] hover:bg-[#334155]/50 transition-colors cursor-pointer ${selectedWaContacts.includes(contact.id) ? 'bg-[#10B981]/10' : ''}`}
                              onClick={() => {
                                setSelectedWaContacts(prev => 
                                  prev.includes(contact.id) ? prev.filter(id => id !== contact.id) : [...prev, contact.id]
                                );
                              }}
                            >
                              <td className="p-4 w-12">
                                {selectedWaContacts.includes(contact.id) ? (
                                  <CheckSquare className="text-[#10B981]" size={20} />
                                ) : (
                                  <Square className="text-slate-600" size={20} />
                                )}
                              </td>
                              <td className="p-4">
                                <div className="font-bold text-sm text-white">{contact.name}</div>
                                <div className="text-[10px] text-slate-500">+{contact.phone}</div>
                                
                                {/* Tags UI */}
                                <div className="flex flex-wrap gap-1 mt-2" onClick={e => e.stopPropagation()}>
                                  {(tagsMap[contact.id] || []).map(tag => (
                                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-[#10B981]/10 text-[#10B981] text-[9px] font-bold rounded-full border border-[#10B981]/20">
                                      {tag}
                                      <button onClick={() => handleRemoveTag(contact.id, tag)} className="hover:text-red-400">
                                        <X size={8} />
                                      </button>
                                    </span>
                                  ))}
                                  <button 
                                    onClick={() => {
                                      const tag = prompt("Yeni etiket girin:");
                                      if (tag) handleAddTag(contact.id, tag);
                                    }}
                                    className="px-2 py-0.5 bg-[#334155] text-slate-400 text-[9px] font-bold rounded-full hover:bg-[#475569] flex items-center gap-1"
                                  >
                                    <Tag size={8} />
                                    Ekle
                                  </button>
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendNow({ id: contact.id, name: contact.name, phone: contact.phone }, currentTemplate, undefined, false);
                                  }}
                                  disabled={isSending || waStatus !== 'open'}
                                  className="p-2 text-[#10B981] hover:bg-[#334155] rounded-lg transition-colors disabled:opacity-30"
                                >
                                  <Send size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {waContacts.length === 0 && !isFetchingWaContacts && (
                            <tr>
                              <td colSpan={3} className="p-12 text-center text-slate-500 text-sm italic">
                                {waStatus === 'open' 
                                  ? 'Rehberde kişi bulunamadı. WhatsApp senkronizasyonu devam ediyor olabilir, lütfen "Rehberi Yenile" butonuna basın.' 
                                  : 'Lütfen önce WhatsApp bağlantısını kurun.'}
                              </td>
                            </tr>
                          )}
                          {isFetchingWaContacts && (
                            <tr>
                              <td colSpan={3} className="p-12 text-center text-slate-500 text-sm italic">
                                Rehber yükleniyor...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 max-w-4xl mx-auto"
            >
              <header>
                <h1 className="text-3xl font-bold tracking-tight text-white">Ayarlar</h1>
                <p className="text-slate-400 mt-1">Uygulama tercihlerini ve güvenlik ayarlarını yönetin.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Message Settings */}
                <div className="bg-[#1E293B] p-8 rounded-3xl border border-[#334155] shadow-sm space-y-6">
                  <div className="flex items-center gap-3 text-[#10B981]">
                    <MessageSquare size={24} />
                    <h3 className="font-bold text-lg text-white">Mesajlaşma Ayarları</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-slate-300">Mesaj Gönderim Gecikmesi</label>
                        <span className="text-xs font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-1 rounded-lg">
                          {messageDelay / 1000} Saniye
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="1000" 
                        max="10000" 
                        step="500"
                        value={messageDelay}
                        onChange={(e) => setMessageDelay(parseInt(e.target.value))}
                        className="w-full h-2 bg-[#0F172A] rounded-lg appearance-none cursor-pointer accent-[#10B981]"
                      />
                      <p className="text-[10px] text-slate-500 italic">
                        * WhatsApp engeline takılmamak için her mesaj arasına konulan rastgele değişken sürenin taban değeridir.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#0F172A] rounded-2xl border border-[#334155]">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-300">Otomatik Yenileme</label>
                        <p className="text-[10px] text-slate-500">Oturum durumunu arka planda kontrol et.</p>
                      </div>
                      <button 
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`w-12 h-6 rounded-full transition-all relative ${autoRefresh ? 'bg-[#10B981]' : 'bg-slate-700'}`}
                      >
                        <motion.div 
                          animate={{ x: autoRefresh ? 26 : 4 }}
                          className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Privacy & Security */}
                <div className="bg-[#1E293B] p-8 rounded-3xl border border-[#334155] shadow-sm space-y-6">
                  <div className="flex items-center gap-3 text-amber-400">
                    <Shield size={24} />
                    <h3 className="font-bold text-lg text-white">Gizlilik & Görünüm</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[#0F172A] rounded-2xl border border-[#334155]">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-300">Oturum ID'lerini Göster</label>
                        <p className="text-[10px] text-slate-500">Teknik destek için oturum kimliklerini açar.</p>
                      </div>
                      <button 
                        onClick={() => setShowSessionId(!showSessionId)}
                        className={`w-12 h-6 rounded-full transition-all relative ${showSessionId ? 'bg-[#10B981]' : 'bg-slate-700'}`}
                      >
                        <motion.div 
                          animate={{ x: showSessionId ? 26 : 4 }}
                          className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>

                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                        <AlertCircle size={14} />
                        GÜVENLİK NOTU
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Nexus App, mesajlarınızı doğrudan WhatsApp Web protokolü üzerinden gönderir. 
                        Toplu gönderimlerde spam şikayeti almamak için şablonlarınızı kişiselleştirin.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Admin Access from Settings */}
                <div className="bg-[#1E293B] p-8 rounded-3xl border border-[#334155] shadow-sm space-y-6">
                  <div className="flex items-center gap-3 text-purple-400">
                    <Shield size={24} />
                    <h3 className="font-bold text-lg text-white">Yönetici Erişimi</h3>
                  </div>
                  <p className="text-sm text-slate-400">
                    Sistem genelindeki tüm oturumları yönetmek ve istatistikleri görmek için yönetici paneline giriş yapın.
                  </p>
                  <button 
                    onClick={() => setShowAdminLogin(true)}
                    disabled={!isAdminConfigured}
                    className="w-full py-3 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl font-bold text-sm hover:bg-purple-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Shield size={18} />
                    {isAdminConfigured ? 'Yönetici Paneline Git' : 'Yönetici Yapılandırılmadı'}
                  </button>
                </div>

                {/* About Nexus */}
                <div className="md:col-span-2 bg-[#1E293B] p-8 rounded-3xl border border-[#334155] shadow-sm flex flex-col md:flex-row items-center gap-8">
                  <div className="w-24 h-24 bg-[#10B981]/10 rounded-3xl flex items-center justify-center text-[#10B981]">
                    <Activity size={48} fill="currentColor" />
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-2">
                    <h3 className="font-bold text-xl text-white">Nexus App v2.1.0</h3>
                    <p className="text-sm text-slate-400">
                      Profesyonel WhatsApp yönetim ve toplu mesajlaşma platformu. 
                      İşletmeniz için güvenli ve inovatif çözümler sunar.
                    </p>
                    <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">DEVELOPED BY ZMD</div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">© 2026 ALL RIGHTS RESERVED</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setNotification({ message: "Uygulama güncel sürümde.", type: 'info' })}
                    className="px-6 py-3 bg-[#334155] hover:bg-[#475569] text-white rounded-xl text-sm font-bold transition-all"
                  >
                    Güncellemeleri Denetle
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* HISTORY */}
          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">Mesaj Geçmişi</h1>
                  <p className="text-slate-400 mt-1">Son gönderilen 100 mesajın özeti.</p>
                </div>
                <button 
                  onClick={() => {
                    if (window.confirm("Tüm geçmişi silmek istediğinize emin misiniz?")) {
                      setSentMessages([]);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all"
                >
                  <Trash2 size={14} />
                  Geçmişi Temizle
                </button>
              </header>

              <div className="bg-[#1E293B] rounded-3xl border border-[#334155] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0F172A] border-b border-[#334155]">
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Alıcı</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Zaman</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Mesaj</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Tür</th>
                      <th className="p-6 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentMessages.map(msg => (
                      <tr key={msg.id} className="border-b border-[#334155] hover:bg-[#0F172A] transition-colors">
                        <td className="p-6">
                          <div className="font-bold text-sm text-slate-200">{msg.to}</div>
                          <div className="text-xs text-slate-400">+{msg.phone}</div>
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                            <Clock size={14} className="text-blue-400" />
                            {new Date(msg.timestamp).toLocaleString('tr-TR')}
                          </div>
                        </td>
                        <td className="p-6">
                          <p className="text-xs text-slate-400 line-clamp-1 italic">"{msg.message}"</p>
                        </td>
                        <td className="p-6">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{msg.isGroup ? 'Grup' : 'Kişi'}</span>
                        </td>
                        <td className="p-6 text-right">
                          <span className="px-3 py-1 bg-[#10B981]/10 text-[#10B981] rounded-full text-[10px] font-bold uppercase tracking-wider">
                            Gönderildi
                          </span>
                        </td>
                      </tr>
                    ))}
                    {sentMessages.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-20 text-center text-slate-500 text-sm italic">
                          Henüz gönderilmiş mesaj bulunmuyor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* WHATSAPP CONNECTION */}
          {activeTab === 'whatsapp' && (
            <motion.div 
              key="whatsapp"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="bg-[#1E293B] p-12 rounded-[40px] shadow-2xl border border-[#334155] text-center space-y-8">
                <div className="inline-flex p-6 bg-[#10B981]/10 text-[#10B981] rounded-3xl">
                  <QrCode size={48} />
                </div>
                
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">WhatsApp Bağlantısı</h1>
                  <p className="text-slate-400 mt-2">Mesajların otomatik gönderilmesi için telefonunuzu bağlayın.</p>
                  {waSessionId && (
                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-[#0F172A] text-slate-500 rounded-full text-xs font-mono">
                      <div className="w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
                      Oturum ID: {waSessionId}
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  {waStatus === 'qr' && waQR ? (
                    <div className="p-4 bg-white border-4 border-[#10B981] rounded-3xl shadow-lg">
                      <img src={waQR} alt="WhatsApp QR Code" className="w-64 h-64" referrerPolicy="no-referrer" />
                      <p className="text-xs font-bold text-[#10B981] mt-4 uppercase tracking-widest">QR Kodu Tara</p>
                    </div>
                  ) : waStatus === 'open' ? (
                    <div className="p-8 bg-[#10B981]/10 border border-[#10B981] rounded-3xl space-y-4 w-full max-w-sm">
                      <div className="flex justify-center text-[#10B981]">
                        <CheckCircle2 size={64} />
                      </div>
                      <h3 className="text-xl font-bold text-[#10B981]">Bağlantı Başarılı!</h3>
                      <p className="text-sm text-[#10B981]/70">Artık mesajlarınız otomatik olarak gönderilecek.</p>
                      <button 
                        onClick={handleLogout}
                        className="w-full py-3 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-all flex items-center justify-center gap-2"
                      >
                        <LogOut size={18} />
                        Bağlantıyı Kes
                      </button>
                    </div>
                  ) : (
                    <div className="p-12 space-y-4">
                      <div className="animate-spin text-[#10B981] flex justify-center">
                        <RefreshCw size={48} />
                      </div>
                      <p className="text-sm text-slate-400">Bağlantı kuruluyor, lütfen bekleyin...</p>
                    </div>
                  )}
                </div>

                <div className="bg-[#0F172A] p-6 rounded-2xl text-left space-y-3 border border-[#334155]">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Nasıl Bağlanır?</h4>
                  <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
                    <li>Telefonunuzda WhatsApp'ı açın.</li>
                    <li>Ayarlar {'>'} Bağlı Cihazlar'a gidin.</li>
                    <li>Cihaz Bağla'ya dokunun.</li>
                    <li>Ekrandaki QR kodu taratın.</li>
                  </ol>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      )}
      </main>

    </div>
  );
}
