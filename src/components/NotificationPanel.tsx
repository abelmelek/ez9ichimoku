import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Info, AlertTriangle, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationPanelProps {
  notifications: AppNotification[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: (filter: 'ALL' | 'GOLD' | 'BTC') => void;
  onMarkAsRead: (id: string) => void;
}

import { useState } from 'react';

export function NotificationPanel({ 
  notifications, 
  isOpen, 
  onToggle, 
  onClear, 
  onMarkAsRead 
}: NotificationPanelProps) {
  const [activeTab, setActiveTab] = useState<'ALL' | 'GOLD' | 'BTC'>('ALL');

  // Filter local notifications display list based on active tab
  const filteredNotifications = notifications.filter(notif => {
    if (activeTab === 'GOLD') return notif.asset === 'GOLD';
    if (activeTab === 'BTC') return notif.asset === 'BTC';
    return true; // ALL
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const filteredUnreadCount = filteredNotifications.filter(n => !n.isRead).length;

  const getTypeIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'info': return <Info className="w-4 h-4 text-blue-400" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-gold" />;
      case 'danger': return <AlertCircle className="w-4 h-4 text-rose-500" />;
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onToggle}
        className="fixed bottom-32 right-6 z-[100] w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] text-white border-2 border-gray-800 transition-all hover:border-gold/50"
      >
        <Bell className={`w-6 h-6 ${unreadCount > 0 ? 'text-gold animate-bounce' : 'text-gray-400'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-gray-900 shadow-lg">
            {unreadCount}
          </span>
        )}
      </motion.button>

      {/* Notification Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]"
            />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 z-[100] w-full sm:w-[380px] h-full bg-gray-950 border-l border-gray-800 shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-gold" />
                  <h3 className="text-sm font-black text-white italic uppercase tracking-widest">የዕለቱ ማሳሰቢያዎች</h3>
                </div>
                <div className="flex items-center gap-2">
                  {filteredNotifications.length > 0 && (
                    <button 
                      onClick={() => onClear(activeTab)}
                      className="text-[9px] font-black text-rose-500/80 hover:text-rose-500 uppercase tracking-tighter transition-colors mr-2 cursor-pointer"
                    >
                      {activeTab === 'ALL' ? 'Clear All' : activeTab === 'GOLD' ? 'Clear GOLD' : 'Clear BTC'}
                    </button>
                  )}
                  <button 
                    onClick={onToggle}
                    className="p-1.5 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Asset Filter Tabs */}
              <div className="p-3 bg-gray-900/25 border-b border-gray-800 flex items-center justify-between gap-2 shrink-0">
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">ማጣሪያ (FILTER) :</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setActiveTab('ALL')}
                    className={`text-[9px] font-black px-2.5 py-1.5 rounded-lg border transition-all duration-150 uppercase tracking-wider cursor-pointer ${
                      activeTab === 'ALL'
                        ? 'bg-white/10 text-white border-white/20 shadow-md'
                        : 'bg-transparent text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    ሁሉም
                  </button>
                  <button
                    onClick={() => setActiveTab('GOLD')}
                    className={`text-[9px] font-black px-2.5 py-1.5 rounded-lg border transition-all duration-150 uppercase tracking-wider cursor-pointer flex items-center gap-1 ${
                      activeTab === 'GOLD'
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-md'
                        : 'bg-transparent text-gray-400 border-transparent hover:text-amber-400'
                    }`}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                    GOLD
                  </button>
                  <button
                    onClick={() => setActiveTab('BTC')}
                    className={`text-[9px] font-black px-2.5 py-1.5 rounded-lg border transition-all duration-150 uppercase tracking-wider cursor-pointer flex items-center gap-1 ${
                      activeTab === 'BTC'
                        ? 'bg-orange-500/15 text-orange-400 border-orange-500/30 shadow-md'
                        : 'bg-transparent text-gray-400 border-transparent hover:text-orange-400'
                    }`}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
                    BTC
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {filteredNotifications.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
                    <Bell className="w-12 h-12" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                      {activeTab === 'ALL' ? 'No Notifications' : `No ${activeTab} Alerts`}
                    </p>
                  </div>
                ) : (
                  filteredNotifications.map((notif) => (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={notif.id}
                      onClick={() => onMarkAsRead(notif.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${
                        notif.isRead 
                          ? 'bg-gray-900/30 border-gray-800/50 opacity-60' 
                          : 'bg-gray-900 border-gray-700 hover:border-gold/30 shadow-lg'
                      }`}
                    >
                      {!notif.isRead && (
                        <div className="absolute top-0 left-0 w-1 h-full bg-gold" />
                      )}
                      
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-1.5 rounded-lg bg-black/40 border border-gray-800`}>
                          {getTypeIcon(notif.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${
                              notif.type === 'danger' ? 'text-rose-500' : 
                              notif.type === 'warning' ? 'text-gold' : 
                              notif.type === 'success' ? 'text-emerald-500' : 'text-blue-400'
                            }`}>
                              {notif.title}
                            </span>
                            {notif.asset && (
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded leading-none border uppercase tracking-widest ${
                                notif.asset === 'GOLD' 
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
                                  : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                              }`}>
                                {notif.asset}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-gray-300 leading-snug font-medium mb-3 whitespace-pre-wrap">
                            {notif.message}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-[9px] text-gray-500 font-bold">
                              <Clock className="w-3 h-3" />
                              {notif.timestamp}
                            </div>
                            <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest px-2 py-0.5 bg-black/40 rounded border border-gray-800 group-hover:border-gray-700 transition-colors">
                              {notif.category}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-black/40 border-t border-gray-800 text-center">
                <p className="text-[8px] text-gray-600 font-black uppercase tracking-[0.2em]">
                  ENQO-NOTIFICATION ENGINE ACTIVE
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
