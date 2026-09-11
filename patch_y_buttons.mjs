import fs from 'fs';

function patchButtons(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `                        {/* Vertical Position */}
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Vertical Position</span>
                            <span className="text-xs font-mono text-gray-400">{Math.round(currentSubtitleConfig.y)}px</span>
                          </div>
                          <input type="range" min={0} max={720} step={10} value={currentSubtitleConfig.y}
                            onChange={(e) => { const val = parseInt(e.target.value); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), y: val } } }; } return seg; })); }}
                            className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>`;

  const newCode = `                        {/* Vertical Position */}
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

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(filepath, code);
    console.log("Patched buttons in " + filepath);
  } else {
    console.log("Old code not found in " + filepath);
  }
}

patchButtons('components/EnglishVideoMaker.tsx');
patchButtons('components/DebateVisualizer.tsx');
