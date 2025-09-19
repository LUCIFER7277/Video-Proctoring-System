import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, Video, VideoOff, Monitor, Square, Users,
  Smile, PhoneOff, LogOut, X, Eye, AlertTriangle,
  Shield, Activity, Minimize2, Maximize2
} from 'lucide-react';
import { create } from 'zustand';

// Zustand store
interface AppState {
  timer: string;
  isEndModalOpen: boolean;
  isLoggedOut: boolean;
  isMonitoringMinimized: boolean;
  setTimer: (time: string) => void;
  setEndModalOpen: (open: boolean) => void;
  setLoggedOut: (out: boolean) => void;
  setMonitoringMinimized: (minimized: boolean) => void;
}

const useAppStore = create<AppState>((set) => ({
  timer: '24:01:45',
  isEndModalOpen: false,
  isLoggedOut: false,
  isMonitoringMinimized: false,
  setTimer: (time) => set({ timer: time }),
  setEndModalOpen: (open) => set({ isEndModalOpen: open }),
  setLoggedOut: (out) => set({ isLoggedOut: out }),
  setMonitoringMinimized: (minimized) => set({ isMonitoringMinimized: minimized }),
}));

// Mock data
const mockMessages = [
  { name: 'Darlene Robertson', role: 'Organizer', time: '2 minutes ago', text: 'Ok' },
  { name: 'Arlene McCoy', role: '', time: '3 minutes ago', text: 'sounds amazing!' },
  { name: 'Leslie Alexander', role: '', time: '07:38 am', text: 'Have you spoken to the host? He is more than an hour late' },
  { name: 'Kathryn Murphy', role: '', time: '9:55 pm', text: 'Ok' },
  { name: 'Cameron Williamson', role: 'Moderator', time: '11:49 pm', text: 'Great session.' },
  { name: 'Eleanor Pena', role: '', time: '05:02 am', text: 'sounds amazing!' },
  { name: 'Bessie Cooper', role: '', time: '05:48 pm', text: 'when will it be ready?' },
  { name: 'Darlene Robertson', role: '', time: '9:41 pm', text: 'may be within 15 min?' },
  { name: 'Savannah Nguyen', role: 'Organizer', time: '06:36 pm', text: 'Got it.' },
  { name: 'Albert Flores', role: '', time: '07:40 am', text: 'Yeah can hear you clearly.' },
  { name: 'Eleanor Pena', role: '', time: '09:02 am', text: 'Cool!' },
];

const mockViolations = [
  { id: 1, type: 'focus_loss', message: 'Candidate looking away from screen', time: '4:01:56 pm', severity: 'warning' },
  { id: 2, type: 'unauthorized_object', message: 'Mobile phone detected', time: '4:00:32 pm', severity: 'critical' },
  { id: 3, type: 'multiple_faces', message: 'Multiple faces detected', time: '3:58:45 pm', severity: 'warning' },
];

// Timer component
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

  return <span className="font-mono font-bold">{timer}</span>;
};

// Chat bubble component
const ChatBubble: React.FC<{ message: typeof mockMessages[0] }> = ({ message }) => (
  <div className="mb-3 last:mb-0">
    <div className="bg-slate-700 text-white rounded-2xl px-4 py-2 max-w-full">
      <div className="text-xs text-slate-300 mb-1">
        <span className="font-semibold">{message.name}</span>
        {message.role && <span className="text-blue-300 ml-1">{message.role}</span>}
        <span> · {message.time}</span>
      </div>
      <div className="text-sm">{message.text}</div>
    </div>
  </div>
);

// Sidebar section component
const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6">
    <h3 className="text-white text-xs font-bold uppercase tracking-wider mb-3">{title}</h3>
    <div>{children}</div>
  </div>
);

// Live monitoring component
const LiveMonitoring: React.FC = () => {
  const { isMonitoringMinimized, setMonitoringMinimized } = useAppStore();

  return (
    <div className={`fixed ${isMonitoringMinimized ? 'bottom-4 right-4' : 'top-4 right-4'}
                   ${isMonitoringMinimized ? 'w-80' : 'w-96'}
                   bg-white border border-slate-200 rounded-xl shadow-2xl z-50
                   transition-all duration-300 ease-in-out`}>
      {/* Header */}
      <div className="bg-red-500 text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <span className="font-semibold">Live Monitoring</span>
          <span className="bg-red-600 px-2 py-1 rounded text-xs">ACTIVE</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonitoringMinimized(!isMonitoringMinimized)}
            className="p-1 hover:bg-red-600 rounded"
          >
            {isMonitoringMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isMonitoringMinimized && (
        <div className="p-4">
          {/* System Status */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">98%</div>
              <div className="text-xs text-green-700">System Health</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">3</div>
              <div className="text-xs text-orange-700">Violations</div>
            </div>
          </div>

          {/* Threat Level */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center mb-4">
            <div className="text-lg font-bold text-yellow-600">MEDIUM</div>
            <div className="text-xs text-yellow-700">Threat Level</div>
          </div>

          {/* Active Alerts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm">Active Alerts</h4>
              <button className="text-xs text-blue-600 hover:text-blue-800">Clear All</button>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {mockViolations.map((violation) => (
                <div key={violation.id}
                     className={`border-l-4 ${violation.severity === 'critical' ? 'border-red-500' : 'border-yellow-500'}
                               bg-slate-50 p-3 rounded`}>
                  <div className="flex items-start gap-2">
                    <div className="text-lg">
                      {violation.severity === 'critical' ? '🚨' : '⚠️'}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{violation.message}</div>
                      <div className="text-xs text-slate-500">
                        {violation.time} • {violation.severity.toUpperCase()}
                      </div>
                      <button className="text-xs bg-green-600 text-white px-2 py-1 rounded mt-1 hover:bg-green-700">
                        ✓ Acknowledge
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Modal components
const EndModal: React.FC = () => {
  const { isEndModalOpen, setEndModalOpen } = useAppStore();
  const navigate = useNavigate();

  if (!isEndModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-2">End interview?</h3>
        <p className="text-slate-600 mb-6">This will stop recording and disconnect everyone.</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setEndModalOpen(false)}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setEndModalOpen(false);
              navigate('/');
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            End Interview
          </button>
        </div>
      </div>
    </div>
  );
};

const LogOutOverlay: React.FC = () => {
  const { isLoggedOut, setLoggedOut } = useAppStore();
  const navigate = useNavigate();

  if (!isLoggedOut) return null;

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 text-center">
        <h3 className="text-xl font-semibold mb-4">You have been logged out.</h3>
        <button
          onClick={() => {
            setLoggedOut(false);
            navigate('/');
          }}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Sign In
        </button>
      </div>
    </div>
  );
};

// Main component
const InterviewerDashboard: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { setEndModalOpen, setLoggedOut } = useAppStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <div className={`${isMobileMenuOpen ? 'w-320' : 'w-64 md:w-320'} bg-slate-900 flex flex-col transition-all duration-300`}>
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              IV
            </div>
            <span className="text-white font-semibold">Interviewer</span>
          </div>
          <div className="text-green-400 text-sm">
            Running · <Timer />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-6 overflow-y-auto">
          <SidebarSection title="Events">
            {mockMessages.slice(0, 3).map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
          </SidebarSection>

          <SidebarSection title="Stage">
            {mockMessages.slice(3, 5).map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
          </SidebarSection>

          <SidebarSection title="Sessions">
            {mockMessages.slice(5, 7).map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
          </SidebarSection>

          <SidebarSection title="Create">
            {mockMessages.slice(7, 9).map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
          </SidebarSection>

          <SidebarSection title="Settings">
            {mockMessages.slice(9, 11).map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
          </SidebarSection>

          <SidebarSection title="Help">
            {mockMessages.slice(0, 2).map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
          </SidebarSection>
        </div>

        {/* Bottom bar */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button className="w-10 h-10 bg-slate-600 hover:bg-slate-500 rounded-lg flex items-center justify-center text-white">
                <Mic className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 bg-slate-600 hover:bg-slate-500 rounded-lg flex items-center justify-center text-white">
                <Monitor className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 bg-slate-600 hover:bg-slate-500 rounded-lg flex items-center justify-center text-white">
                <Square className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 bg-slate-600 hover:bg-slate-500 rounded-lg flex items-center justify-center text-white">
                <Users className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 bg-slate-600 hover:bg-slate-500 rounded-lg flex items-center justify-center text-white">
                <Smile className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setEndModalOpen(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
            >
              End
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button
              className="md:hidden p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <div className="w-5 h-5 flex flex-col justify-between">
                <div className="w-full h-0.5 bg-slate-600"></div>
                <div className="w-full h-0.5 bg-slate-600"></div>
                <div className="w-full h-0.5 bg-slate-600"></div>
              </div>
            </button>
            <input
              type="text"
              placeholder="Write a reply"
              className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="bg-slate-100 rounded-xl p-12 text-center">
            <div className="text-slate-600 text-lg">Waiting for candidate...</div>
          </div>

          {/* Log out button */}
          <button
            onClick={() => setLoggedOut(true)}
            className="absolute bottom-6 right-6 text-slate-400 hover:text-slate-600 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>

      {/* Live Monitoring Float */}
      <LiveMonitoring />

      {/* Modals */}
      <EndModal />
      <LogOutOverlay />
    </div>
  );
};

export default InterviewerDashboard;