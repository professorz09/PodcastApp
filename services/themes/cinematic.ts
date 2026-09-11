import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles } from './utils';

export const cinematicTheme: Theme = {
  id: 'cinematic',
  name: 'Cinematic',
  description: 'Over-the-shoulder conversation style with dynamic timers and VU meters.',
  properties: [
    { id: 'speakerColorA', label: 'Speaker A Color', type: 'color', defaultValue: '#3b82f6' },
    { id: 'speakerColorB', label: 'Speaker B Color', type: 'color', defaultValue: '#ef4444' },
    { id: 'timerColor', label: 'Timer Color', type: 'color', defaultValue: '#ffffff' },
  ],
  draw: (context: DrawContext) => {
    const { ctx, time, audioLevel, script, currentSegmentIndex, config, assets, themeConfig } = context;
    const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
    const currentSegment = script[currentSegmentIndex];
    if (!currentSegment) return;

    const isPlaying = true;
    const { speakerIds, speakerLabels } = config;
    const colors = [
        themeConfig?.speakerColorA || '#3b82f6',
        themeConfig?.speakerColorB || '#ef4444',
        '#eab308',
        '#22c55e'
    ];

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    const isNarrator = currentSegment.speaker === 'Narrator';
    const isQuiz = currentSegment.learnEnglish?.segmentType === 'quiz' || Boolean(currentSegment.learnEnglish?.quiz);
    const speakerIndex = speakerIds.indexOf(currentSegment.speaker);
    const hasKnownSpeaker = !isNarrator && !isQuiz && speakerIndex !== -1;
    const isRightSide = speakerIndex % 2 === 0;

    // Calculate Debate Points
    let totalA = 0, totalB = 0, currentA = 0, currentB = 0;
    if (speakerIds.length >= 2) {
        script.forEach((seg, idx) => {
            if (seg.speaker === speakerIds[0]) {
                totalA++;
                if (idx <= currentSegmentIndex) currentA++;
            } else if (seg.speaker === speakerIds[1]) {
                totalB++;
                if (idx <= currentSegmentIndex) currentB++;
            }
        });
    }

    if (hasKnownSpeaker) {
        const isPrimary = speakerIndex % 2 === 0;
        const mainColor = isPrimary ? '#ffffff' : '#000000';
        const timerBgColor = isPrimary ? 'rgba(255, 255, 255, 0.9)' : 'rgba(17, 17, 17, 0.9)';
        const timerTextColor = isPrimary ? '#000000' : '#ffffff';

        // Speaker name off-center alternating
        const label = (speakerLabels[speakerIndex] || currentSegment.speaker).toUpperCase();
        
        ctx.save();
        ctx.font = 'bold 42px "Bebas Neue", sans-serif'; // Strong condensed font look
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = mainColor;
        ctx.shadowBlur = 0; // Removed glow
        
        const nameY = 40;
        const nameX = canvasWidth / 2;
        ctx.fillText(label, nameX, nameY);
        
        // Underline
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        ctx.beginPath();
        ctx.moveTo(nameX - textWidth / 2 - 20, nameY + 50);
        ctx.lineTo(nameX + textWidth / 2 + 20, nameY + 50);
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Timer
        if (config.showTimer) {
            const segStartTime = context.segmentOffsets[currentSegmentIndex] || 0;
            const segEndTime = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
            const timeLeft = Math.max(0, Math.ceil(segEndTime - time));
            const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const s = (timeLeft % 60).toString().padStart(2, '0');

            ctx.save();
            const timerW = 120;
            const timerH = 50;
            const timerY = 40;
            const timerX = isRightSide ? canvasWidth - timerW - 40 : 40;

            ctx.fillStyle = timerBgColor;
            ctx.shadowBlur = 0; // Removed glow
            ctx.beginPath();
            ctx.roundRect(timerX, timerY, timerW, timerH, 8);
            ctx.fill();

            ctx.fillStyle = timerTextColor;
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${m}:${s}`, timerX + timerW / 2, timerY + timerH / 2 + 2);
            ctx.restore();
        }

        // Bottom UI
        const isSpeaking = isPlaying && currentSegment.speaker === speakerIds[speakerIndex];
        const color = colors[speakerIndex % colors.length];

        // VU Meter (Bottom corner on speaker\'s side)
        if (config.showVuMeter) {
            const meterY = canvasHeight - 40;
            const meterX = isRightSide ? canvasWidth - 40 : 40;

            ctx.save();
            const DOTS = 8;
            const boxW = 8;
            const boxH = 8;
            const gap = 6;
            const cols = 2;
            
            const activeDots = isSpeaking ? Math.round(Math.max(0.1, audioLevel) * DOTS) : 0;

            for (let d = 0; d < DOTS; d++) {
                for (let c = 0; c < cols; c++) {
                    const rectX = isRightSide ? meterX - (cols - c) * (boxW + gap) : meterX + c * (boxW + gap);
                    const rectY = meterY - (d + 1) * (boxH + gap);
                    const isLit = d < activeDots;
                    
                    ctx.beginPath();
                    ctx.rect(rectX, rectY, boxW, boxH);
                    ctx.fillStyle = isLit ? '#ffffff' : 'rgba(255,255,255,0.2)';
                    if (isLit) {
                        ctx.shadowColor = '#ffffff';
                        ctx.shadowBlur = 8;
                    }
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
            ctx.restore();
        }

        // Points Counter (Bottom corner on opposite side)
        if (config.showSideStats) {
            const totalPoints = speakerIndex === 0 ? totalA : totalB;
            const currentPoints = speakerIndex === 0 ? currentA : currentB;
            
            const boxSize = 8;
            const gap = 6;
            const cols = 2; // Two columns of dots
            
            const startX = !isRightSide ? canvasWidth - 40 : 40;
            const startY = canvasHeight - 40;

            ctx.save();
            for (let i = 0; i < totalPoints; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                
                const dotX = !isRightSide ? startX - (cols - col) * (boxSize + gap) : startX + col * (boxSize + gap);
                const dotY = startY - (row + 1) * (boxSize + gap);
                
                const isCompleted = i < currentPoints;
                const isCurrent = i === currentPoints - 1 && isSpeaking;
                
                ctx.beginPath();
                ctx.rect(dotX, dotY, boxSize, boxSize);
                
                if (isCompleted) {
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = isCurrent ? 12 : 0;
                } else {
                    ctx.fillStyle = 'transparent';
                    ctx.shadowBlur = 0;
                }
                
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();
        }

    } else if (isNarrator) {
        // Simple centered narrator logic
    }
    
    // Subtitles
    drawSubtitles(ctx, context);
  }
};
