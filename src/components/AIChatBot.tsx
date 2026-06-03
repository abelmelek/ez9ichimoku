import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Bot, User, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AIChatBotProps {
  symbol: string;
  timeframe: string;
  data: any[];
  ichiData: any;
  waveTargets: any;
  isBacktestMode?: boolean;
  backtestDate?: string;
  backtestTime?: string;
}

export function AIChatBot({ 
  symbol, 
  timeframe, 
  data, 
  ichiData, 
  waveTargets,
  isBacktestMode = false,
  backtestDate = '',
  backtestTime = ''
}: AIChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{ 
      role: 'bot', 
      content: `ሰላም የሐበሻ ነጋዴ! እንደገና መረጃዎችን በማጤን ላይ ነኝ። **${symbol}**ን በ**${timeframe}** ሰዓት መተንተኛ እያየሁ ነው። 
      
የIchimoku Equilibrium እና Wave patternsን እያጣራሁ ነው...
የአራቱንም (የገበያ ሁኔታ፣ የመግቢያ ቀጠና፣ የዋቭ እና የሲስተሙ ትስስር) የተሟላ ጥምር መግለጫ በአንድነት ለማግኘት **5** ይጻፉ ወይም ከታች ***5. ሙሉ ጥምር ሪፖርት*** የሚለውን ቁልፍ ይጫኑ።` 
    }]);
  }, [symbol, timeframe]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(true);

  const handleSend = async (customMsg?: string) => {
    const userMessage = customMsg || input.trim();
    if (!userMessage || isLoading) return;

    if (!customMsg) setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          data: data.slice(-100),
          ichiData,
          waveTargets,
          message: userMessage,
          isBacktestMode,
          backtestDate,
          backtestTime
        }),
      });

      const result = await response.json();
      if (response.ok && result.analysis) {
        setMessages(prev => [...prev, { role: 'bot', content: result.analysis }]);
      } else {
        let errorMsg = result.details || result.error || 'ግንኙነት ተቋርጧል።';
        const isQuota = result.isQuotaError || errorMsg.includes('429') || errorMsg.includes('quota');
        const isUnavailable = result.isUnavailable || errorMsg.includes('503') || errorMsg.includes('overloaded');
        
        if (isQuota) {
          errorMsg = `### ⚠️ API Quota Exceeded / የኤፒአይ አቅም ተሟጧል
          
የGemini API ቁልፍ የነፃ ገደብ ላይ ደርሷል። 

1. እባክዎ **60 ሰከንድ** ጠብቀው እንደገና ይሞክሩ።
2. ወይም ተጨማሪ አቅም ካስፈለገዎት በGoogle AI Studio ወደ ክፍያ ፕላን ማሳደግ ይችላሉ።

የኤፒአይ አቅም ስላለቀ እባክዎ ከ60 ሰከንድ በኋላ እንደገና ይሞክሩ።`;
        } else if (isUnavailable) {
          errorMsg = `### 🚧 AI Service Overloaded / ሲስተሙ ተጨናንቋል
          
የአይቲ ሞዴሉ በአሁኑ ጊዜ ብዙ ጥያቄዎች እየተስተናገዱበት ነው። 

1. እባክዎ **5-10 ሰከንድ** ጠብቀው "Generate New Insight" የሚለውን እንደገና ይጫኑ።
2. ይህ ብዙውን ጊዜ ለጥቂት ጊዜ የሚከሰት የትራፊክ መብዛት ነው።

ሞዴሉ በአሁኑ ሰዓት ስለተጨናነቀ እባክዎ ከጥቂት ሰከንዶች በኋላ እንደገና ይሞክሩ።`;
        } else if (errorMsg.includes('No API Key') || errorMsg.includes('configured')) {
          errorMsg = `### ⚠️ GEMINI_API_KEY Setup Required / የኤፒአይ ቁልፍ መግባት አለበት
          
ቁልፉን በትክክል እንዲሰራ በ Settings በኩል ማስገባት አለብዎት። ከላይ የ Settings ምልክቱን ተጭነው በ Secrets በኩል \`GEMINI_API_KEY\` ብለው ያስገቡት።`;
        } else {
          errorMsg = `የእኛ AI አገልጋይ በአሁኑ ጊዜ ስራ ላይ ነው። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።
          
Details: ${errorMsg}`;
        }
        setMessages(prev => [...prev, { role: 'bot', content: errorMsg }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', content: 'ከአገልጋዩ ጋር መገናኘት አልተቻለም። እባክዎ ትንሽ ቆይተው ይሞክሩ።' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-12 right-6 z-[100] w-14 h-14 bg-gold rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(255,215,0,0.5)] text-black border-2 border-black"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>

      {/* Chat Window - Expandable Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for focus */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]"
            />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 z-[100] w-full sm:w-[450px] h-full bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gold/10 rounded-2xl flex items-center justify-center border border-gold/30 shadow-inner">
                    <Bot className="w-7 h-7 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white italic tracking-tight uppercase">ኢንቆ-ትንበያ (PRO)</h3>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                      <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest leading-none">የገበያ መረጃ ዝግጁ ነው</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              {/* Scrollable Content Container */}
              <div className="flex-1 flex flex-col overflow-hidden relative">
                
                {/* Messages Area */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.03)_0%,transparent_100%)]"
                >
                  {messages.map((msg, i) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={i} 
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[90%] p-4 rounded-2xl text-[13px] leading-relaxed relative shadow-lg ${
                        msg.role === 'user' 
                          ? 'bg-gold text-black font-bold rounded-tr-none border border-gold/50' 
                          : 'bg-gray-800/80 backdrop-blur-md text-gray-100 border border-gray-700/50 rounded-tl-none'
                      }`}>
                        {msg.role === 'bot' && <div className="absolute -top-5 left-0 text-[9px] font-black text-gold uppercase opacity-80">ENQO-BOT</div>}
                        {msg.role === 'user' && <div className="absolute -top-5 right-0 text-[9px] font-black text-gray-500 uppercase opacity-80">TRADER</div>}
                        <div className="markdown-body prose prose-invert prose-xs max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-800/50 text-gold p-4 rounded-2xl font-black text-[10px] border border-gold/20 animate-pulse flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        መረጃዎችን በማቀናጀት ላይ... (SYNCING)
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggestions Section - Collapsible */}
                <div className="px-6 py-3 bg-black/40 border-t border-gray-800/50 backdrop-blur-md shrink-0">
                  <button 
                    onClick={() => setIsSuggestionsOpen(!isSuggestionsOpen)}
                    className="w-full flex items-center justify-between mb-2 group"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-gold" />
                      <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest group-hover:text-gold transition-colors">ተመራጭ ጥያቄዎች</p>
                    </div>
                    {isSuggestionsOpen ? (
                      <ChevronDown className="w-3 h-3 text-gray-500 group-hover:text-gold transition-colors" />
                    ) : (
                      <ChevronUp className="w-3 h-3 text-gray-500 group-hover:text-gold transition-colors" />
                    )}
                  </button>
                  
                  <AnimatePresence>
                    {isSuggestionsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-2 pb-2">
                          {[
                            { id: 1, label: "የገበያ ሁኔታ", q: "1", fullWidth: false },
                            { id: 2, label: "መግቢያ ቀጠና", q: "2", fullWidth: false },
                            { id: 3, label: "የዋቭ ትንበያ", q: "3", fullWidth: false },
                            { id: 4, label: "የሲስተም ጤና", q: "4", fullWidth: false },
                            { id: 5, label: "★ ሙሉ ጥምር ሪፖርት (1,2,3,4 በአንድ ላይ)", q: "5", fullWidth: true }
                          ].map(btn => (
                            <motion.button
                              whileHover={{ scale: 1.02, backgroundColor: btn.fullWidth ? 'rgba(212,175,55,0.15)' : 'rgba(255,215,0,0.1)' }}
                              whileTap={{ scale: 0.98 }}
                              key={btn.id}
                              onClick={() => handleSend(btn.q)}
                              className={`px-3 py-3 border rounded-xl text-left text-[10px] font-black uppercase tracking-tight transition-all flex items-center justify-between group overflow-hidden relative ${
                                btn.fullWidth 
                                  ? 'col-span-2 border-gold/60 bg-gold/10 text-gold shadow-[0_0_12px_rgba(255,215,0,0.15)] hover:bg-gold/20' 
                                  : 'bg-gray-800/40 hover:border-gold/50 border-gray-700/50 text-gray-300'
                              }`}
                            >
                              <div className="absolute inset-0 bg-gold/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              <span className="relative z-10">{btn.id}. {btn.label}</span>
                              <Send className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity relative z-10" />
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Input Area */}
              <div className="p-6 bg-gray-900 border-t border-gray-800">
                <div className="relative group">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="ጥያቄዎን እዚህ ይጻፉ (ለምሳሌ፦ ገበያው ወዴት ይሄዳል?)"
                    className="w-full bg-black border border-gray-800 group-focus-within:border-gold/50 rounded-2xl py-4 pl-5 pr-14 text-[13px] text-white focus:outline-none transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={isLoading || !input.trim()}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 bg-gold text-black rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-2 mt-4 opacity-40">
                  <span className="h-[1px] w-8 bg-gray-600" />
                  <p className="text-[8px] text-center text-gray-500 font-black uppercase tracking-[0.2em]">
                    ENQOPAZYON INTELLIGENCE
                  </p>
                  <span className="h-[1px] w-8 bg-gray-600" />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
