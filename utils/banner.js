'use strict';
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'NotoNaskhArabic-Bold.ttf'), 'NotoArabic');

const W = 760;
const H = 300;

/**
 * يرسم بانر اللوبي بنفس ستايل الصورة المرجعية:
 * خلفية داكنة، قرص/عجلة دائرية بلمعة فضية على اليسار،
 * شريط "ريبون" منحني بلون فضي متدرج، وعنوان روليت / ROULETTE على اليمين.
 */
async function drawLobbyBanner() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // خلفية داكنة متدرجة
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0b0d');
  bg.addColorStop(1, '#0f0f12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ---- الريبون الفضي المنحني (يمين الصورة، خلف النص) ----
  ctx.save();
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 4; i++) {
    const grad = ctx.createLinearGradient(W * 0.35, 0, W, H);
    grad.addColorStop(0, 'rgba(60,60,68,0.0)');
    grad.addColorStop(0.5, `rgba(${200 - i * 15},${196 - i * 15},${215 - i * 10},0.55)`);
    grad.addColorStop(1, 'rgba(20,20,24,0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    const yOff = 40 + i * 45;
    ctx.moveTo(W * 0.42, yOff);
    ctx.bezierCurveTo(W * 0.65, yOff - 60, W * 0.95, yOff + 10, W * 1.05, yOff + 70);
    ctx.lineTo(W * 1.05, yOff + 100);
    ctx.bezierCurveTo(W * 0.9, yOff + 40, W * 0.65, yOff + 10, W * 0.42, yOff + 55);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // ---- القرص الدائري (يسار الصورة) ----
  const discCx = 155, discCy = H / 2, discR = 115;
  ctx.save();
  ctx.shadowColor = 'rgba(180,180,200,0.35)';
  ctx.shadowBlur = 35;
  const discGrad = ctx.createRadialGradient(discCx - 40, discCy - 40, 10, discCx, discCy, discR);
  discGrad.addColorStop(0, '#5a5a63');
  discGrad.addColorStop(0.5, '#2c2c31');
  discGrad.addColorStop(1, '#0a0a0c');
  ctx.fillStyle = discGrad;
  ctx.beginPath();
  ctx.arc(discCx, discCy, discR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // حلقات زخرفية بالقرص
  ctx.strokeStyle = 'rgba(180,178,195,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(discCx, discCy, discR - 15, 0, Math.PI * 2);
  ctx.stroke();

  // دائرة مركزية بيضاء تحتوي على شعار
  ctx.fillStyle = '#e9e7f2';
  ctx.beginPath();
  ctx.arc(discCx, discCy, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141416';
  ctx.font = 'bold 13px NotoArabic';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('infinity', discCx, discCy);

  // نص "infinity" أسفل القرص
  ctx.fillStyle = '#d8d6e6';
  ctx.font = 'bold 20px NotoArabic';
  ctx.textAlign = 'center';
  ctx.fillText('infinity', discCx, discCy + discR + 25);
  ctx.font = '10px NotoArabic';
  ctx.fillStyle = '#8a889a';
  ctx.fillText('S E R V E R', discCx, discCy + discR + 42);

  // ---- العنوان الرئيسي "روليت" ----
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f3f2f8';
  ctx.font = 'bold 74px NotoArabic';
  ctx.shadowColor = 'rgba(150,145,180,0.5)';
  ctx.shadowBlur = 20;
  ctx.fillText('روليت', W - 60, H / 2 - 5);
  ctx.shadowBlur = 0;

  ctx.font = 'bold 26px Arial';
  ctx.fillStyle = '#b7b4c8';
  // تباعد الحروف يدوياً لكلمة ROULETTE
  const word = 'R O U L E T T E';
  ctx.fillText(word, W - 60, H / 2 + 40);

  return canvas.encode('png');
}

module.exports = { drawLobbyBanner };
