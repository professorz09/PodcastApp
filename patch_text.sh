sed -i '504c\
  const textBlockHeight = visibleLines.length * lineHeight;\
  const textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);\
  visibleLines.forEach((l, i) => {' services/themes/utils.ts
