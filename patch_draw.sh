sed -i '505,518c\
  visibleLines.forEach((l, i) => {\
    const textY = textStartY + i * lineHeight;\
    ctx.fillText(l, bx + bw / 2, textY);\
  });\
  if (isIntroSeg && !drawBox) {\
      ctx.shadowBlur = 3;\
      visibleLines.forEach((l, i) => {\
        const textY = textStartY + i * lineHeight;\
        ctx.fillText(l, bx + bw / 2, textY);\
      });\
  }' services/themes/utils.ts
