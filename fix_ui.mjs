import fs from 'fs';

function fixUI(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldUI = `                        {/* Display Mode */}
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
                        </div>`;

  const newUI = `                        {/* Display Mode */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400 block">Display Mode</span>
                            {isCurrentSegmentIntro && (
                              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">Fixed in Intro</span>
                            )}
                          </div>
                          <select 
                            value={isCurrentSegmentIntro ? 'line' : (currentSubtitleConfig.mode || 'phrase')}
                            disabled={isCurrentSegmentIntro}
                            onChange={(e) => { 
                                const val = e.target.value; 
                                setScript(prev => prev.map((seg, i) => {
                                    const isSegIntro = i === 0 || seg.learnEnglish?.segmentType === 'intro';
                                    if (isSegIntro) return seg;
                                    return { 
                                        ...seg, 
                                        visualConfig: { 
                                            ...seg.visualConfig, 
                                            subtitleConfig: { 
                                                ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), 
                                                mode: val as any 
                                            } 
                                        } 
                                    };
                                })); 
                            }}
                            className={\`w-full bg-[#0a0a0a] text-gray-200 text-xs rounded-lg px-3 py-2 border border-white/5 outline-none appearance-none cursor-pointer \${isCurrentSegmentIntro ? 'opacity-50' : 'focus:border-red-500'}\`}
                          >
                            <option value="phrase">Phrase — show whole phrase at once</option>
                            <option value="word">Word — one word at a time</option>
                            <option value="mix">Mix — words build up in phrase</option>
                            <option value="line">Line — one line at a time</option>
                            <option value="full-static">Full Static — all text always visible</option>
                          </select>
                          <p className="text-[10px] text-gray-600 mt-1">
                            {isCurrentSegmentIntro ? 'Intro always shows one wrapped line at a time.' : (
                                <>
                                    {currentSubtitleConfig.mode === 'phrase' && 'Shows each phrase/sentence at once. Clean & readable.'}
                                    {currentSubtitleConfig.mode === 'word' && 'One word at a time — very minimal, karaoke style.'}
                                    {currentSubtitleConfig.mode === 'mix' && 'Words appear one-by-one within each phrase, then reset.'}
                                    {currentSubtitleConfig.mode === 'line' && 'Shows one wrapped line at a time.'}
                                    {currentSubtitleConfig.mode === 'full-static' && 'Always shows the full segment text — no animation.'}
                                    {!currentSubtitleConfig.mode && 'Shows each phrase/sentence at once. Clean & readable.'}
                                </>
                            )}
                          </p>
                        </div>`;

  if (code.includes(oldUI)) {
    code = code.replace(oldUI, newUI);
    fs.writeFileSync(filepath, code);
    console.log("Fixed UI in " + filepath);
  } else {
    console.log("Old UI not found in " + filepath);
  }
}

fixUI('components/EnglishVideoMaker.tsx');
fixUI('components/DebateVisualizer.tsx');
