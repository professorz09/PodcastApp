import fs from 'fs';
let code = fs.readFileSync('components/DebateVisualizer.tsx', 'utf8');

const target = "                        {/* Display Mode */}";
const insert = `                        {/* Display Mode */}
                        {(() => {
                            const isCurrentSegmentIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));
                            return (
                                <>`;

const targetEnd = `                            )}
                          </p>
                        </div>`;
const insertEnd = `                            )}
                          </p>
                        </div>
                        </>
                            );
                        })()}`;

if (code.includes(target) && !code.includes("const isCurrentSegmentIntro =")) {
    code = code.replace(target, insert).replace(targetEnd, insertEnd);
    fs.writeFileSync('components/DebateVisualizer.tsx', code);
    console.log("Fixed DebateVisualizer UI");
}
