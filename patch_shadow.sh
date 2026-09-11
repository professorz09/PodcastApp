sed -i '487,492c\
  if (!drawBox) {\
    if (isIntroSeg) {\
        ctx.shadowColor = "rgba(0,0,0,0.9)";\
        ctx.shadowBlur = 12;\
        ctx.shadowOffsetX = 0;\
        ctx.shadowOffsetY = 0;\
    } else {\
        ctx.shadowColor = "rgba(0,0,0,0.9)";\
        ctx.shadowBlur = 5;\
        ctx.shadowOffsetX = 1;\
        ctx.shadowOffsetY = 1;\
    }\
  }' services/themes/utils.ts
