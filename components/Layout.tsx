import React, { useState } from 'react';
import {
  Mic2,
  FileText,
  Wand2,
  Video,
  Menu,
  X,
  Image,
  FolderDown,
  Music2,
  RotateCcw,
  Film,
  Smartphone,
  Scissors,
  ChevronRight,
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
    { id: AppState.VIDEO_CLIP_IMPORT, label: 'Clip Generator', icon: Scissors, optional: true },
    { id: AppState.IMPORT,            label: 'Import Content', icon: FolderDown, optional: true },
    { id: AppState.INPUT,             label: 'Generate',       icon: Mic2 },
    { id: AppState.SCRIPT,            label: 'Script Editor',  icon: FileText },
    { id: AppState.THUMBNAIL,         label: 'Thumbnail',      icon: Image },
    { id: AppState.AUDIO,             label: 'Voice Gen',      icon: Wand2 },
    { id: AppState.VISUALIZER,        label: 'Video',          icon: Video },
    { id: AppState.STORYBOARD,        label: 'Storyboard',     icon: Film },
    { id: AppState.SHORTS,            label: 'Shorts',         icon: Smartphone },
    { id: AppState.LYRICS,            label: 'Song / Lyrics',  icon: Music2, optional: true },
  ];

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 font-sans flex overflow-hidden selection:bg-purple-500/30">

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-30"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#050505]/98 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white text-black rounded-lg flex items-center justify-center shadow-md">
            <Mic2 size={16} />
          </div>
          <span className="font-bold text-base tracking-tight">Debate<span className="text-purple-400">Forge</span></span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-500 hover:text-white hover:bg-white/8 rounded-lg transition-all"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 w-60 bg-[#080808] border-r border-white/[0.05] flex flex-col transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>

        {/* Logo */}
        <div className="px-5 py-5 mt-14 md:mt-0 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white text-black rounded-xl flex items-center justify-center shadow-lg">
              <Mic2 size={19} />
            </div>
            <div>
              <h1 className="font-bold text-[17px] tracking-tight leading-none">
                Debate<span className="text-purple-400">Forge</span>
              </h1>
              <p className="text-[10px] text-gray-600 mt-1 uppercase tracking-[0.12em] font-medium">AI Video Studio</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {steps.map((step, index) => {
            const isActive = activeStep === step.id;
            const Icon = step.icon;

            // Group divider before "Generate" (first non-optional)
            const showDivider = step.id === AppState.INPUT;

            return (
              <React.Fragment key={step.id}>
                {showDivider && (
                  <div className="pt-2 pb-1 px-3">
                    <div className="border-t border-white/[0.05]" />
                  </div>
                )}
                <button
                  onClick={() => { onStepChange(step.id); closeMobileMenu(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-left group active:scale-[0.98] ${
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all ${
                    isActive
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-gray-600 group-hover:text-gray-400'
                  }`}>
                    <Icon size={15} />
                  </div>
                  <span className={`text-[13px] font-medium flex-1 ${isActive ? 'text-white' : ''}`}>
                    {step.label}
                  </span>
                  {(step as any).optional && !isActive && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-700 border border-gray-800 rounded px-1 py-0.5">opt</span>
                  )}
                  {isActive && (
                    <div className="w-1 h-1 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)]" />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.05] space-y-1.5">
          {onNewProject && (
            <button
              onClick={onNewProject}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all text-gray-600 hover:text-red-400 hover:bg-red-500/[0.06] group"
            >
              <RotateCcw size={13} className="shrink-0 group-hover:text-red-400 transition-colors" />
              <span className="text-[12px] font-medium">New Project</span>
            </button>
          )}
          <div className="px-3 py-2.5 rounded-lg bg-purple-500/[0.06] border border-purple-500/[0.12] flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            </div>
            <div className="text-[11px]">
              <span className="block text-gray-300 font-semibold">Pro Active</span>
              <span className="text-gray-600">All features enabled</span>
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

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/98 backdrop-blur-xl border-t border-white/[0.05] z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex overflow-x-auto scrollbar-hide">
          {steps.map((step) => {
            const isActive = activeStep === step.id;
            const Icon = step.icon;
            const mobileLabel =
              step.id === AppState.LYRICS ? 'Song' :
              step.id === AppState.VIDEO_CLIP_IMPORT ? 'Clips' :
              step.id === AppState.STORYBOARD ? 'Board' :
              step.id === AppState.VISUALIZER ? 'Video' :
              step.id === AppState.THUMBNAIL ? 'Thumb' :
              step.label;
            return (
              <button
                key={step.id}
                onClick={() => onStepChange(step.id)}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-3 min-w-[56px] flex-1 transition-all active:scale-95 ${
                  isActive ? 'text-white' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                <div className={`p-1.5 rounded-lg transition-all ${isActive ? 'bg-purple-500/15' : ''}`}>
                  <Icon size={17} className={isActive ? 'text-purple-400' : ''} />
                </div>
                <span className={`text-[9px] font-semibold leading-none ${isActive ? 'text-white' : ''}`}>
                  {mobileLabel}
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
