const fs = require('fs');
let content = fs.readFileSync('./components/DebateInput.tsx', 'utf8');

content = content.replace(
  "const [leTopic, setLeTopic] = useState('');",
  "const [leTopic, setLeTopic] = useState('');\n  const [leSituations, setLeSituations] = useState<{topic: string, duration: number}[]>([{topic: '', duration: 3}]);"
);

content = content.replace(
  "const [leStyle, setLeStyle] = useState<'situational' | 'roleplay' | 'interview' | 'casual' | 'debate' | 'podcast'>('podcast');",
  "const [leStyle, setLeStyle] = useState<'situational' | 'roleplay' | 'interview' | 'casual' | 'debate' | 'podcast' | 'multi_situation'>('podcast');"
);

const handleSubmitOld = `    // ── Learn English mode ──────────────────────────────────────────────────
    if (mode === 'learn_english') {
      if (!leTopic.trim()) {
        toast.warning('Topic/situation daalo pehle');
        return;
      }
      onGenerate({
        topic: leTopic.trim(),`;

const handleSubmitNew = `    // ── Learn English mode ──────────────────────────────────────────────────
    if (mode === 'learn_english') {
      let finalTopic = leTopic.trim();
      let finalDuration = leDuration;

      if (leStyle === 'multi_situation') {
        const validSits = leSituations.filter(s => s.topic.trim());
        if (validSits.length === 0) {
          toast.warning('Kam se kam ek situation daalo');
          return;
        }
        finalTopic = JSON.stringify(validSits);
        finalDuration = validSits.reduce((acc, curr) => acc + curr.duration, 0);
      } else {
        if (!finalTopic) {
          toast.warning('Topic/situation daalo pehle');
          return;
        }
      }

      onGenerate({
        topic: finalTopic,`;

content = content.replace(handleSubmitOld, handleSubmitNew);
content = content.replace("duration: leDuration,", "duration: finalDuration,");

const leTopicUI = `            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Topic / Situation</label>
              <textarea
                value={leTopic}
                onChange={e => setLeTopic(e.target.value)}
                placeholder="e.g. Someone stole my phone and I'm reporting it to a police officer"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 resize-none"
              />
            </div>`;

const leMultiUI = `            {leStyle !== 'multi_situation' ? (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Topic / Situation</label>
                <textarea
                  value={leTopic}
                  onChange={e => setLeTopic(e.target.value)}
                  placeholder="e.g. Someone stole my phone and I'm reporting it to a police officer"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 resize-none"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <label className="text-xs text-gray-500 uppercase tracking-wider block">Multiple Situations</label>
                {leSituations.map((sit, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-3 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-cyan-400 uppercase">Situation {idx + 1}</span>
                      {leSituations.length > 1 && (
                        <button onClick={() => setLeSituations(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                      )}
                    </div>
                    <textarea
                      value={sit.topic}
                      onChange={e => {
                        const newSits = [...leSituations];
                        newSits[idx].topic = e.target.value;
                        setLeSituations(newSits);
                      }}
                      placeholder="Describe this situation..."
                      rows={2}
                      className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 resize-none"
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">Duration:</span>
                      <select
                        value={sit.duration}
                        onChange={e => {
                          const newSits = [...leSituations];
                          newSits[idx].duration = parseInt(e.target.value, 10);
                          setLeSituations(newSits);
                        }}
                        className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-cyan-500/50"
                      >
                        <option value={1}>1 Min</option>
                        <option value={2}>2 Min</option>
                        <option value={3}>3 Min</option>
                        <option value={5}>5 Min</option>
                        <option value={8}>8 Min</option>
                        <option value={10}>10 Min</option>
                      </select>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setLeSituations(prev => [...prev, {topic: '', duration: 3}])}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 text-cyan-400 text-sm rounded-xl transition-colors"
                >
                  + Add Another Situation
                </button>
              </div>
            )}`;

content = content.replace(leTopicUI, leMultiUI);

content = content.replace(
  '<option value="podcast">Podcast Style (Boy & Girl Hosts)</option>',
  '<option value="multi_situation">Multi-Situation (Story/Scenes)</option>\n                  <option value="podcast">Podcast Style (Boy & Girl Hosts)</option>'
);

fs.writeFileSync('./components/DebateInput.tsx', content);
