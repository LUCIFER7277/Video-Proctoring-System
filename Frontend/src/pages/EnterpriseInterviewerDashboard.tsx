import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeProvider, useTheme } from 'next-themes';
import { Command } from 'cmdk';
import { Toaster, toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import {
  MicrophoneIcon,
  VideoCameraIcon,
  ComputerDesktopIcon,
  StopIcon,
  UsersIcon,
  FaceSmileIcon,
  PhoneXMarkIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  MinusIcon,
  PlusIcon,
  SunIcon,
  MoonIcon,
  Bars3Icon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/solid';
import { create } from 'zustand';

// Enhanced Zustand store
interface AppState {
  timer: string;
  isEndModalOpen: boolean;
  isLoggedOut: boolean;
  isMonitoringMinimized: boolean;
  violations: Violation[];
  monitorPosition: { x: number; y: number };
  isDarkMode: boolean;
  isCommandPaletteOpen: boolean;
  violationCount: number;
  integrityScore: number[];
  focusScore: number[];
  setTimer: (time: string) => void;
  setEndModalOpen: (open: boolean) => void;
  setLoggedOut: (out: boolean) => void;
  setMonitoringMinimized: (minimized: boolean) => void;
  addViolation: (violation: Violation) => void;
  setMonitorPosition: (position: { x: number; y: number }) => void;
  setDarkMode: (dark: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  incrementViolationCount: () => void;
  updateScores: (integrity: number, focus: number) => void;
}

interface Violation {
  id: number;
  type: string;
  message: string;
  time: string;
  severity: 'warning' | 'critical';
  acknowledged: boolean;
}

const useAppStore = create<AppState>((set) => ({
  timer: '24:01:45',
  isEndModalOpen: false,
  isLoggedOut: false,
  isMonitoringMinimized: false,
  violations: [
    { id: 1, type: 'focus_loss', message: 'Candidate looking away from screen', time: '4:01:56 pm', severity: 'warning', acknowledged: false },
    { id: 2, type: 'unauthorized_object', message: 'Mobile phone detected', time: '4:00:32 pm', severity: 'critical', acknowledged: false },
    { id: 3, type: 'multiple_faces', message: 'Multiple faces detected', time: '3:58:45 pm', severity: 'warning', acknowledged: false },
  ],
  monitorPosition: { x: window.innerWidth - 400, y: 20 },
  isDarkMode: true,
  isCommandPaletteOpen: false,
  violationCount: 3,
  integrityScore: [85, 87, 84, 89, 91, 88, 86, 90, 92, 89],
  focusScore: [78, 82, 79, 85, 88, 84, 81, 87, 89, 86],
  setTimer: (time) => set({ timer: time }),
  setEndModalOpen: (open) => set({ isEndModalOpen: open }),
  setLoggedOut: (out) => set({ isLoggedOut: out }),
  setMonitoringMinimized: (minimized) => set({ isMonitoringMinimized: minimized }),
  addViolation: (violation) => set((state) => ({
    violations: [...state.violations, violation],
    violationCount: state.violationCount + 1
  })),
  setMonitorPosition: (position) => set({ monitorPosition: position }),
  setDarkMode: (dark) => set({ isDarkMode: dark }),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  incrementViolationCount: () => set((state) => ({ violationCount: state.violationCount + 1 })),
  updateScores: (integrity, focus) => set((state) => ({
    integrityScore: [...state.integrityScore.slice(1), integrity],
    focusScore: [...state.focusScore.slice(1), focus]
  })),
}));

// Sound utility
const playViolationSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
};

// Timer component with tabular nums
const Timer: React.FC = () => {
  const { timer, setTimer } = useAppStore();

  useEffect(() => {
    const interval = setInterval(() => {
      const [hours, minutes, seconds] = timer.split(':').map(Number);
      let newSeconds = seconds + 1;
      let newMinutes = minutes;
      let newHours = hours;

      if (newSeconds >= 60) {
        newSeconds = 0;
        newMinutes += 1;
      }
      if (newMinutes >= 60) {
        newMinutes = 0;
        newHours += 1;
      }

      const newTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}:${String(newSeconds).padStart(2, '0')}`;
      setTimer(newTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [timer, setTimer]);

  return (
    <span className="font-mono font-bold tracking-wider" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {timer}
    </span>
  );
};

// Dark mode toggle
const DarkModeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600
                 flex items-center justify-center text-slate-300 hover:text-white transition-all duration-200"
      aria-label="Toggle dark mode"
    >
      {theme === 'dark' ? (
        <SunIcon className="w-5 h-5" />
      ) : (
        <MoonIcon className="w-5 h-5" />
      )}
    </button>
  );
};

// Skeleton loader component
const SkeletonLoader: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// Badge component with pulse animation
const ViolationBadge: React.FC<{ count: number }> = ({ count }) => {
  if (count === 0) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white"
    >
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {count}
      </motion.div>
    </motion.div>
  );
};

// Enhanced chat bubble
const ChatBubble: React.FC<{ message: any }> = ({ message }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="mb-3 last:mb-0"
  >
    <div className="bg-slate-700 dark:bg-slate-800 text-white rounded-2xl px-4 py-3 border border-slate-600 dark:border-slate-700">
      <div className="text-xs text-slate-300 mb-1 tracking-wide">
        <span className="font-semibold">{message.name}</span>
        {message.role && <span className="text-indigo-300 ml-1">{message.role}</span>}
        <span className="text-slate-400"> · {message.time}</span>
      </div>
      <div className="text-sm leading-relaxed">{message.text}</div>
    </div>
  </motion.div>
);

// Sidebar section with improved typography
const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-8">
    <h3 className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-4 letter-spacing-wide">
      {title}
    </h3>
    <div>{children}</div>
  </div>
);

// Draggable floating monitor with glass morphism
const FloatingMonitor: React.FC = () => {
  const {
    isMonitoringMinimized,
    setMonitoringMinimized,
    monitorPosition,
    setMonitorPosition,
    violations,
    violationCount,
    integrityScore,
    focusScore
  } = useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const monitorRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setMonitoringMinimized(!isMonitoringMinimized);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMonitoringMinimized, setMonitoringMinimized]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;

    setIsDragging(true);
    const rect = monitorRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || isMobile) return;

    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;

    // Snap to edge behavior
    const snapThreshold = 24;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const monitorWidth = isMonitoringMinimized ? 320 : 384;
    const monitorHeight = isMonitoringMinimized ? 120 : 500;

    if (newX < snapThreshold) newX = 0;
    if (newX > windowWidth - monitorWidth - snapThreshold) newX = windowWidth - monitorWidth;
    if (newY < snapThreshold) newY = 0;
    if (newY > windowHeight - monitorHeight - snapThreshold) newY = windowHeight - monitorHeight;

    setMonitorPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset, isMonitoringMinimized, setMonitorPosition, isMobile]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const unacknowledgedViolations = violations.filter(v => !v.acknowledged);

  if (isMobile) {
    return (
      <AnimatePresence>
        {!isMonitoringMinimized && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl
                       border-t-2 border-slate-200 dark:border-slate-700 rounded-t-3xl"
          >
            <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto my-3" />
            <div className="p-6 max-h-96 overflow-y-auto">
              <MonitorContent />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      ref={monitorRef}
      style={{
        left: monitorPosition.x,
        top: monitorPosition.y,
      }}
      className={`fixed z-50 transition-all duration-300 ease-out cursor-move
                 ${isMonitoringMinimized ? 'w-80' : 'w-96'}
                 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl
                 border-2 border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl`}
      onMouseDown={handleMouseDown}
      drag={!isMobile}
      dragMomentum={false}
    >
      {/* Header with glass morphism */}
      <div className="bg-red-500/90 backdrop-blur-sm text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="w-5 h-5" />
          <span className="font-semibold tracking-wide">Live Monitoring</span>
          <motion.span
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="bg-red-600 px-2 py-1 rounded-full text-xs font-bold"
          >
            ACTIVE
          </motion.span>
          <ViolationBadge count={violationCount} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonitoringMinimized(!isMonitoringMinimized)}
            className="p-1 hover:bg-red-600 rounded-lg transition-colors duration-200"
            aria-label={isMonitoringMinimized ? "Maximize monitor" : "Minimize monitor"}
          >
            {isMonitoringMinimized ? <PlusIcon className="w-4 h-4" /> : <MinusIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isMonitoringMinimized && (
        <div className="p-6">
          <MonitorContent />
        </div>
      )}
    </motion.div>
  );
};

// Monitor content component
const MonitorContent: React.FC = () => {
  const { integrityScore, focusScore, violations } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const acknowledgeViolation = (id: number) => {
    // Update violation in store
    toast.success('Violation acknowledged', {
      duration: 2000,
      position: 'top-right',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <SkeletonLoader className="h-20" />
          <SkeletonLoader className="h-20" />
        </div>
        <SkeletonLoader className="h-16" />
        <div className="space-y-2">
          <SkeletonLoader className="h-12" />
          <SkeletonLoader className="h-12" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* System Status with improved styling */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-700
                     rounded-xl p-4 text-center transition-colors duration-200"
        >
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">98%</div>
          <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium tracking-wide">System Health</div>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-700
                     rounded-xl p-4 text-center transition-colors duration-200"
        >
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">3</div>
          <div className="text-xs text-orange-700 dark:text-orange-300 font-medium tracking-wide">Violations</div>
        </motion.div>
      </div>

      {/* Sparkline Charts */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 tracking-wide">
            Integrity Score
          </div>
          <div className="h-8">
            <Sparklines data={integrityScore} width={100} height={32}>
              <SparklinesLine color="#4f46e5" style={{ strokeWidth: 2, fill: 'none' }} />
            </Sparklines>
          </div>
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-1">
            {integrityScore[integrityScore.length - 1]}%
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 tracking-wide">
            Focus Score
          </div>
          <div className="h-8">
            <Sparklines data={focusScore} width={100} height={32}>
              <SparklinesLine color="#059669" style={{ strokeWidth: 2, fill: 'none' }} />
            </Sparklines>
          </div>
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-1">
            {focusScore[focusScore.length - 1]}%
          </div>
        </div>
      </div>

      {/* Threat Level */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-700
                   rounded-xl p-4 text-center mb-6 transition-colors duration-200"
      >
        <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400 tracking-wide">MEDIUM</div>
        <div className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">Threat Level</div>
      </motion.div>

      {/* Active Alerts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-200 tracking-wide">Active Alerts</h4>
          <button className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300
                           font-medium transition-colors duration-200">
            Clear All
          </button>
        </div>

        <div className="space-y-3 max-h-40 overflow-y-auto">
          <AnimatePresence>
            {violations.filter(v => !v.acknowledged).map((violation) => (
              <motion.div
                key={violation.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`border-l-4 ${violation.severity === 'critical' ? 'border-red-500' : 'border-yellow-500'}
                           bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-2
                           ${violation.severity === 'critical' ? 'border-red-200 dark:border-red-700' : 'border-yellow-200 dark:border-yellow-700'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-lg">
                    {violation.severity === 'critical' ? '🚨' : '⚠️'}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                      {violation.message}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {violation.time} • {violation.severity.toUpperCase()}
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => acknowledgeViolation(violation.id)}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5
                               rounded-full mt-2 transition-colors duration-200 font-medium"
                    >
                      ✓ Acknowledge
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

// Command Palette
const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setCommandPaletteOpen, setEndModalOpen } = useAppStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-32 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg mx-4"
      >
        <Command className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-700 shadow-2xl">
          <div className="flex items-center border-b border-slate-200 dark:border-slate-700 px-4">
            <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 mr-3" />
            <Command.Input
              placeholder="Type a command or search..."
              className="flex-1 py-4 text-lg bg-transparent border-0 outline-none text-slate-700 dark:text-slate-200
                         placeholder:text-slate-400"
            />
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-slate-500">No results found.</Command.Empty>

            <Command.Group heading="Actions" className="text-xs text-slate-500 font-semibold tracking-wider mb-2">
              <Command.Item
                onSelect={() => {
                  setOpen(false);
                  // Mute functionality
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MicrophoneIcon className="w-5 h-5" />
                <span>Toggle Mute</span>
                <kbd className="ml-auto text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">M</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setOpen(false);
                  setEndModalOpen(true);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <PhoneXMarkIcon className="w-5 h-5" />
                <span>End Interview</span>
                <kbd className="ml-auto text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">E</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setOpen(false);
                  // Export functionality
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChartBarIcon className="w-5 h-5" />
                <span>Export Report</span>
                <kbd className="ml-auto text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">⌘ E</kbd>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </motion.div>
    </div>
  );
};

// Enhanced sidebar component
const Sidebar: React.FC<{ isMobileMenuOpen: boolean }> = ({ isMobileMenuOpen }) => {
  const { setEndModalOpen } = useAppStore();

  const mockMessages = [
    { name: 'Darlene Robertson', role: 'Organizer', time: '2 minutes ago', text: 'Ok' },
    { name: 'Arlene McCoy', role: '', time: '3 minutes ago', text: 'sounds amazing!' },
    { name: 'Leslie Alexander', role: '', time: '07:38 am', text: 'Have you spoken to the host? He is more than an hour late' },
    { name: 'Kathryn Murphy', role: '', time: '9:55 pm', text: 'Ok' },
    { name: 'Cameron Williamson', role: 'Moderator', time: '11:49 pm', text: 'Great session.' },
    { name: 'Eleanor Pena', role: '', time: '05:02 am', text: 'sounds amazing!' },
  ];

  return (
    <div className={`${isMobileMenuOpen ? 'w-80' : 'w-64 md:w-80'}
                     bg-slate-900 dark:bg-slate-950 flex flex-col transition-all duration-300
                     border-r-2 border-slate-800 dark:border-slate-700`}>
      {/* Header */}
      <div className="p-6 border-b-2 border-slate-800 dark:border-slate-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl
                          flex items-center justify-center text-white font-bold text-sm shadow-lg">
            IV
          </div>
          <span className="text-white font-semibold text-lg tracking-wide">Interviewer</span>
          <DarkModeToggle />
        </div>
        <div className="text-emerald-400 text-sm font-medium tracking-wide">
          Running · <Timer />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 p-6 overflow-y-auto">
        <SidebarSection title="Events">
          {mockMessages.slice(0, 2).map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}
        </SidebarSection>

        <SidebarSection title="Stage">
          {mockMessages.slice(2, 4).map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}
        </SidebarSection>

        <SidebarSection title="Sessions">
          {mockMessages.slice(4, 6).map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}
        </SidebarSection>
      </div>

      {/* Bottom bar with improved styling */}
      <div className="p-4 border-t-2 border-slate-800 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {[
              { icon: MicrophoneIcon, label: 'Microphone' },
              { icon: ComputerDesktopIcon, label: 'Screen share' },
              { icon: StopIcon, label: 'Stop recording' },
              { icon: UsersIcon, label: 'Participants' },
              { icon: FaceSmileIcon, label: 'Reactions' },
            ].map(({ icon: Icon, label }, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-xl flex items-center justify-center
                           text-slate-300 hover:text-white transition-all duration-200 shadow-lg"
                aria-label={label}
              >
                <Icon className="w-4 h-4" />
              </motion.button>
            ))}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setEndModalOpen(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium
                       transition-colors duration-200 shadow-lg"
          >
            End
          </motion.button>
        </div>
      </div>
    </div>
  );
};

// Main stage component with enhanced styling
const MainStage: React.FC = () => {
  const { setLoggedOut } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Top bar */}
      <div className="p-6 border-b-2 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Write a reply"
            className="flex-1 px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-2xl
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                       bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200
                       placeholder:text-slate-400 transition-all duration-200"
          />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex items-center justify-center relative p-8">
        {isLoading ? (
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-16 text-center shadow-2xl border-2 border-slate-200 dark:border-slate-700">
            <SkeletonLoader className="w-32 h-32 mx-auto mb-6 rounded-2xl" />
            <SkeletonLoader className="w-48 h-6 mx-auto" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-3xl p-16 text-center shadow-2xl
                       border-2 border-slate-200 dark:border-slate-700"
          >
            <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-indigo-100 to-purple-100
                           dark:from-indigo-900/30 dark:to-purple-900/30 rounded-2xl flex items-center justify-center">
              <VideoCameraIcon className="w-16 h-16 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div className="text-slate-600 dark:text-slate-300 text-xl font-medium tracking-wide">
              Waiting for candidate...
            </div>
          </motion.div>
        )}

        {/* Log out button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setLoggedOut(true)}
          className="absolute bottom-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300
                     flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50
                     transition-all duration-200"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          Log Out
        </motion.button>
      </div>
    </div>
  );
};

// Enhanced modals
const EndModal: React.FC = () => {
  const { isEndModalOpen, setEndModalOpen } = useAppStore();
  const navigate = useNavigate();

  if (!isEndModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full mx-4
                   border-2 border-slate-200 dark:border-slate-700 shadow-2xl"
      >
        <h3 className="text-xl font-semibold mb-3 text-slate-700 dark:text-slate-200 tracking-wide">
          End interview?
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
          This will stop recording and disconnect everyone.
        </p>
        <div className="flex gap-3 justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setEndModalOpen(false)}
            className="px-6 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-2xl
                       hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200
                       font-medium transition-all duration-200"
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setEndModalOpen(false);
              navigate('/');
            }}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-medium
                       transition-all duration-200 shadow-lg"
          >
            End Interview
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

const LogOutOverlay: React.FC = () => {
  const { isLoggedOut, setLoggedOut } = useAppStore();
  const navigate = useNavigate();

  if (!isLoggedOut) return null;

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-800 rounded-3xl p-10 max-w-md w-full mx-4 text-center
                   border-2 border-slate-200 dark:border-slate-700 shadow-2xl"
      >
        <h3 className="text-2xl font-semibold mb-6 text-slate-700 dark:text-slate-200 tracking-wide">
          You have been logged out.
        </h3>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setLoggedOut(false);
            navigate('/');
          }}
          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-medium
                     transition-all duration-200 shadow-lg"
        >
          Sign In
        </motion.button>
      </motion.div>
    </div>
  );
};

// Main dashboard component
const InterviewerDashboard: React.FC = () => {
  const { sessionId } = useParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { incrementViolationCount, updateScores } = useAppStore();

  // Simulate periodic score updates and violations
  useEffect(() => {
    const scoreInterval = setInterval(() => {
      const newIntegrity = Math.floor(Math.random() * 10) + 85;
      const newFocus = Math.floor(Math.random() * 15) + 80;
      updateScores(newIntegrity, newFocus);
    }, 5000);

    const violationInterval = setInterval(() => {
      if (Math.random() < 0.1) { // 10% chance every 10 seconds
        incrementViolationCount();
        playViolationSound();
        toast.error('New violation detected!', {
          duration: 4000,
          position: 'top-right',
          style: {
            background: '#dc2626',
            color: 'white',
          },
        });
      }
    }, 10000);

    return () => {
      clearInterval(scoreInterval);
      clearInterval(violationInterval);
    };
  }, [incrementViolationCount, updateScores]);

  return (
    <ThemeProvider attribute="class">
      <div className="h-screen flex bg-white dark:bg-slate-900 font-sans">
        <Sidebar isMobileMenuOpen={isMobileMenuOpen} />
        <MainStage />
        <FloatingMonitor />
        <CommandPalette />
        <EndModal />
        <LogOutOverlay />
        <Toaster />
      </div>
    </ThemeProvider>
  );
};

export default InterviewerDashboard;