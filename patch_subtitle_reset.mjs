import fs from 'fs';

function patchSubtitleReset(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `                        {/* Display Mode */}
                        <div className="space-y-1">
                          <span className="text-xs text-gray-400 block">Display Mode</span>
                          <select value={currentSubtitleConfig.mode || 'phrase'}
                            onChange={(e) => { const val = e.target.value; setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), mode: val as any } } }))); }}
                            className="w-full bg-[#0a0a0a] text-gray-200 text-xs rounded-lg px-3 py-2 border border-white/5 focus:border-red-500 outline-none appearance-none cursor-pointer"
                          >
                            <option value="phrase">Phrase — show whole phrase at once</option>
                            <option value="word">Word — one word at a time</option>
                            <option value="mix">Mix — words build up in phrase</option>
                            <option value="line">Line — one line at a time</option>
                            <option value="full-static">Full Static — all text always visible</option>
                          </select>
                          <p className="text-[10px] text-gray-600 mt-1">
                            {currentSubtitleConfig.mode === 'phrase' && 'Shows each phrase/sentence at once. Clean & readable.'}
                            {currentSubtitleConfig.mode === 'word' && 'One word at a time — very minimal, karaoke style.'}
                            {currentSubtitleConfig.mode === 'mix' && 'Words appear one-by-one within each phrase, then reset.'}
                            {currentSubtitleConfig.mode === 'line' && 'Shows one wrapped line at a time.'}
                            {currentSubtitleConfig.mode === 'full-static' && 'Always shows the full segment text — no animation.'}
                            {!currentSubtitleConfig.mode && 'Shows each phrase/sentence at once. Clean & readable.'}
                          </p>
                        </div>
                      </div>`;

  const newCode = `                        {/* Display Mode */}
                        <div className="space-y-1">
                          <span className="text-xs text-gray-400 block">Display Mode</span>
                          <select value={currentSubtitleConfig.mode || 'phrase'}
                            onChange={(e) => { const val = e.target.value; setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), mode: val as any } } }))); }}
                            className="w-full bg-[#0a0a0a] text-gray-200 text-xs rounded-lg px-3 py-2 border border-white/5 focus:border-red-500 outline-none appearance-none cursor-pointer"
                          >
                            <option value="phrase">Phrase — show whole phrase at once</option>
                            <option value="word">Word — one word at a time</option>
                            <option value="mix">Mix — words build up in phrase</option>
                            <option value="line">Line — one line at a time</option>
                            <option value="full-static">Full Static — all text always visible</option>
                          </select>
                          <p className="text-[10px] text-gray-600 mt-1">
                            {currentSubtitleConfig.mode === 'phrase' && 'Shows each phrase/sentence at once. Clean & readable.'}
                            {currentSubtitleConfig.mode === 'word' && 'One word at a time — very minimal, karaoke style.'}
                            {currentSubtitleConfig.mode === 'mix' && 'Words appear one-by-one within each phrase, then reset.'}
                            {currentSubtitleConfig.mode === 'line' && 'Shows one wrapped line at a time.'}
                            {currentSubtitleConfig.mode === 'full-static' && 'Always shows the full segment text — no animation.'}
                            {!currentSubtitleConfig.mode && 'Shows each phrase/sentence at once. Clean & readable.'}
                          </p>
                        </div>

                        {/* Reset All Subtitle Settings */}
                        <div className="pt-2">
                          <button
                              onClick={() => { 
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
    console.log("Patched Reset All button in " + filepath);
  } else {
    // Alternate regex matching
    const regex = /<p className="text-\[10px\] text-gray-600 mt-1">[\s\S]*?<\/p>[\s\S]*?<\/div>[\s\S]*?<\/div>/;
    const match = code.match(regex);
    if (match) {
        const replacement = match[0].replace('</div>\n                      </div>', '</div>\n\n                        {/* Reset All Subtitle Settings */}\n                        <div className="pt-2">\n                          <button\n                              onClick={() => { \n                                const defaultSubtitleConfig = { x: 192, y: 550, w: 896, h: 150, fontSize: 1.4, backgroundColor: \'rgba(0,0,0,0.85)\', textColor: \'#ffffff\', borderColor: \'#ffffff\', borderWidth: 0, borderRadius: 20, mode: \'phrase\' };\n                                setScript(prev => prev.map((seg, i) => { \n                                  if (syncSubtitlePosition || i === currentSegmentIndex) { \n                                      return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: defaultSubtitleConfig } }; \n                                  } \n                                  return seg; \n                                }));\n                              }}\n                              className="w-full bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs py-3 rounded-xl border border-red-900/30 flex items-center justify-center gap-2 transition-colors font-bold uppercase tracking-wider"\n                          >\n                              <RefreshCw size={14} /> Reset All Subtitle Settings\n                          </button>\n                        </div>\n                      </div>');
        code = code.replace(regex, replacement);
        fs.writeFileSync(filepath, code);
        console.log("Patched Reset All button (regex) in " + filepath);
    } else {
        console.log("Old code not found in " + filepath);
    }
  }
}

patchSubtitleReset('components/EnglishVideoMaker.tsx');
patchSubtitleReset('components/DebateVisualizer.tsx');
