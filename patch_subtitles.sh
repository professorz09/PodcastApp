sed -i '478,484c\
  if (isIntroSeg) {\
    ctx.fillStyle = config.introSubtitleColor || "#ffffff";\
  } else if (currentSegment.speaker === "Narrator") {\
    ctx.fillStyle = config.narratorTextColor || "#eab308";\
  } else if (comicBoxActive && drawBox) {\
    ctx.fillStyle = "#000000";\
  } else {\
    ctx.fillStyle = subtitleConfig.textColor || "#ffffff";\
  }' services/themes/utils.ts
