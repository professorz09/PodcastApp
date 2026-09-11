import fs from 'fs';

function patchReset(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `                          <input type="checkbox" checked={questionMode} onChange={(e) => setQuestionMode(e.target.checked)} className="accent-red-500 shrink-0" />
                        </label>
                      </div>`;

  const newCode = `                          <input type="checkbox" checked={questionMode} onChange={(e) => setQuestionMode(e.target.checked)} className="accent-red-500 shrink-0" />
                        </label>

                        {/* Reset All Subtitle Settings */}
                        <div className="pt-2 border-t border-white/5">
                          <button
                              onClick={() => { 
                                setSubtitleBackground(false);
                                const defaultSubtitleConfig = { x: 192, y: 550, w: 896, h: 150, fontSize: 1.4, backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 0, borderRadius: 20, mode: 'phrase' };
                                setScript(prev => prev.map((seg, i) => { 
                                  if (syncSubtitlePosition || i === currentSegmentIndex) { 
                                      return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: defaultSubtitleConfig } }; 
                                  } 
                                  return seg; 
                                }));
                              }}
                              className="w-full bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs py-3 rounded-xl border border-red-900/30 flex items-center justify-center gap-2 transition-colors font-bold uppercase tracking-wider"
                          >
                              <RefreshCw size={14} /> Reset All Subtitle Settings
                          </button>
                        </div>
                      </div>`;

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(filepath, code);
    console.log("Patched Reset button correctly in " + filepath);
  } else {
    console.log("Old code not found in " + filepath);
  }
}

patchReset('components/EnglishVideoMaker.tsx');
patchReset('components/DebateVisualizer.tsx');
