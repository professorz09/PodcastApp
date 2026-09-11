import fs from 'fs';

function patchButtons(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `                        {/* Vertical Position */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400">Vertical Position</span>
                            <span className="text-xs font-mono text-gray-400">{Math.round(currentSubtitleConfig.y)}px</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                                onClick={() => { const val = Math.max(0, currentSubtitleConfig.y - 20); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), y: val } } }; } return seg; })); }}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                                <ChevronUp size={14} /> Upar
                            </button>
                            <button
                                onClick={() => { const val = Math.min(1080, currentSubtitleConfig.y + 20); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), y: val } } }; } return seg; })); }}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                                <ChevronDown size={14} /> Niche
                            </button>
                            <button
                                onClick={() => { const val = 550; setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), y: val } } }; } return seg; })); }}
                                className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors border border-red-900/40"
                            >
                                <RefreshCw size={12} /> Default
                            </button>
                          </div>
                        </div>`;

  const newCode = `                        {/* Position (X, Y) */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400">Position (X, Y)</span>
                            <span className="text-xs font-mono text-gray-400">{Math.round(currentSubtitleConfig.x || 192)}, {Math.round(currentSubtitleConfig.y)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                                onClick={() => { const val = Math.max(0, currentSubtitleConfig.y - 20); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), y: val } } }; } return seg; })); }}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                                <ChevronUp size={14} /> Upar
                            </button>
                            <button
                                onClick={() => { const val = Math.min(1080, currentSubtitleConfig.y + 20); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), y: val } } }; } return seg; })); }}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                                <ChevronDown size={14} /> Niche
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                                onClick={() => { const val = Math.max(-500, (currentSubtitleConfig.x || 192) - 20); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), x: val } } }; } return seg; })); }}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                                <ChevronLeft size={14} /> Left
                            </button>
                            <button
                                onClick={() => { const val = Math.min(1920, (currentSubtitleConfig.x || 192) + 20); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), x: val } } }; } return seg; })); }}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                            >
                                Right <ChevronRight size={14} />
                            </button>
                            <button
                                onClick={() => { setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), x: 192, y: 550 } } }; } return seg; })); }}
                                className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors border border-red-900/40"
                            >
                                <RefreshCw size={12} /> Default
                            </button>
                          </div>
                        </div>`;

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(filepath, code);
    console.log("Patched X/Y buttons in " + filepath);
  } else {
    console.log("Old code not found in " + filepath);
  }
}

patchButtons('components/EnglishVideoMaker.tsx');
patchButtons('components/DebateVisualizer.tsx');
