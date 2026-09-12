const fs = require('fs');
let content = fs.readFileSync('./components/DebateInput.tsx', 'utf8');

const durationOld = `              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Duration</label>
                <select
                  value={leDuration}
                  onChange={e => setLeDuration(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50"
                >
                  <option value={3} className="bg-[#111]">3 Min</option>
                  <option value={5} className="bg-[#111]">5 Min</option>
                  <option value={8} className="bg-[#111]">8 Min</option>
                  <option value={12} className="bg-[#111]">12 Min</option>
                  <option value={20} className="bg-[#111]">20 Min</option>
                  <option value={30} className="bg-[#111]">30 Min</option>
                  <option value={40} className="bg-[#111]">40 Min</option>
                </select>
              </div>`;

const durationNew = `              {leStyle !== 'multi_situation' && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Duration</label>
                <select
                  value={leDuration}
                  onChange={e => setLeDuration(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50"
                >
                  <option value={3} className="bg-[#111]">3 Min</option>
                  <option value={5} className="bg-[#111]">5 Min</option>
                  <option value={8} className="bg-[#111]">8 Min</option>
                  <option value={12} className="bg-[#111]">12 Min</option>
                  <option value={20} className="bg-[#111]">20 Min</option>
                  <option value={30} className="bg-[#111]">30 Min</option>
                  <option value={40} className="bg-[#111]">40 Min</option>
                </select>
              </div>
              )}`;

content = content.replace(durationOld, durationNew);

const btnOld = `            <button
              onClick={handleSubmit}
              disabled={isLoading || !leTopic.trim()}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-cyan-600 to-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            >`;

const btnNew = `            <button
              onClick={handleSubmit}
              disabled={isLoading || (leStyle !== 'multi_situation' && !leTopic.trim()) || (leStyle === 'multi_situation' && !leSituations.some(s => s.topic.trim()))}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-cyan-600 to-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            >`;

content = content.replace(btnOld, btnNew);

const styleDivOld = `            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Style</label>`;

const styleDivNew = `            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={leStyle === 'multi_situation' ? "col-span-1 sm:col-span-2" : ""}>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Style</label>`;

content = content.replace(styleDivOld, styleDivNew);


fs.writeFileSync('./components/DebateInput.tsx', content);
