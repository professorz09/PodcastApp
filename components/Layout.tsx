import React, { useState } from 'react';
import {
  Mic2,
  FileText,
  Wand2,
  Video,
  Menu,
  X,
  Sparkles,
  Image,
  FolderDown,
  RotateCcw,
} from 'lucide-react';
import { AppState } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeStep: AppState;
  onStepChange: (step: AppState) => void;
  onNewProject?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeStep, onStepChange, onNewProject }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const steps = [
    { id: AppState.IMPORT, label: 'Import', icon: FolderDown, optional: true },
    { id: AppState.INPUT, label: 'Generate', icon: Mic2 },
    { id: AppState.SCRIPT, label: 'Script', icon: FileText },
    { id: AppState.THUMBNAIL, label: 'Thumb', icon: Image },
    { id: AppState.AUDIO, label: 'Voice', icon: Wand2 },
    { id: AppState.VISUALIZER, label: 'Video', icon: Video },
  ];

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 font-sans flex overflow-hidden selection:bg-purple-500/30">

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white text-black rounded-lg flex items-center justify-center">
            <Mic2 size={17} />
          </div>
          <span className="font-bold text-base tracking-tight">Debate<span className="text-purple-500">Forge</span></span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Desktop Sidebar / Mobile Slide-in */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 w-64 md:w-72 bg-[#0a0a0a] border-r border-white/5 flex flex-col transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Sidebar Logo */}
        <div className="p-5 md:p-6 flex items-center gap-3 mt-14 md:mt-0">
          <div className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center shadow-lg">
            <Mic2 size={22} />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight leading-none">Debate<span className="text-purple-500">Forge</span></h1>
            <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-widest font-semibold">AI Video Generator</p>
          </div>
        </div>

        <nav className="flex-1 px-3 md:px-4 py-4 space-y-1 overflow-y-auto">
          {steps.map((step) => {
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => {
                  onStepChange(step.id);
                  closeMobileMenu();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 text-left group active:scale-[0.98] ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                }`}
              >
                <step.icon size={18} className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'} />
                <span className={`font-medium text-sm ${isActive ? 'tracking-wide' : ''}`}>
                  {step.id === AppState.IMPORT ? 'Import Content' :
                   step.id === AppState.INPUT ? 'Generate' :
                   step.id === AppState.SCRIPT ? 'Script Editor' :
                   step.id === AppState.THUMBNAIL ? 'Thumbnail' :
                   step.id === AppState.AUDIO ? 'Voice Gen' : 'Video Maker'}
                </span>
                {(step as any).optional && !isActive && (
                  <span className="ml-auto text-[9px] font-semibold uppercase tracking-widest text-gray-700 border border-gray-700 rounded px-1 py-0.5">skip</span>
                )}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 md:p-4 border-t border-white/5 space-y-2">
          {onNewProject && (
            <button
              onClick={onNewProject}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all text-gray-600 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/15 group active:scale-[0.98]"
            >
              <RotateCcw size={15} className="group-hover:text-red-400 transition-colors shrink-0" />
              <span className="text-xs font-medium">New Project</span>
            </button>
          )}
          <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 flex items-center gap-3">
            <Sparkles size={16} className="text-purple-400" />
            <div className="text-xs">
              <span className="block text-white font-medium">Pro Features</span>
              <span className="text-gray-400">Enabled</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden pt-14 md:pt-0 relative bg-[#050505]">
        <div className="flex-1 overflow-y-auto w-full h-full custom-scrollbar pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav — scrollable, short labels */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex overflow-x-auto scrollbar-hide">
          {steps.map((step) => {
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => onStepChange(step.id)}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-3 min-w-[60px] flex-1 transition-all active:scale-95 ${
                  isActive
                    ? 'text-white'
                    : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                <div className={`p-1.5 rounded-lg transition-all ${isActive ? 'bg-purple-500/20' : ''}`}>
                  <step.icon size={19} className={isActive ? 'text-purple-400' : ''} />
                </div>
                <span className={`text-[10px] font-semibold leading-none ${isActive ? 'text-white' : 'text-gray-600'}`}>
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Layout;
