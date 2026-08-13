'use strict';
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

// تسجيل خط يدعم العربي (بدون هذا الخط تطلع الحروف العربية مربعات فارغة)
GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'NotoNaskhArabic-Bold.ttf'), 'NotoArabic');

const SIZE = 700;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 20;

// ألوان متبادلة تشبه الصورة المرجعية (بنفسجي فاتح غامق / أبيض)
const COLORS = ['#b9b0d8', '#f4f2fb', '#8f83bb', '#e9e5f7'];

/**
 * يرسم عجلة الروليت مقسّمة على عدد اللاعبين
 * @param {Array<{id:string, name:string, avatarURL:string|null}>} players
 * @param {number} rotationRad - زاوية دوران العجلة الحالية (راديان) لعمل تأثير الحركة
 * @param {string|null} highlightUserId - لاعب يتم تمييزه (الفائز/المستهدف) بعد التوقف
 */
async function drawWheel(players, rotationRad = 0, highlightUserId = null) {
  const canvas = createCanvas(SIZE, SIZE + 90);
  const ctx = canvas.getContext('2d');

  // خلفية شفافة/داكنة
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(0, 0, SIZE, SIZE + 90);

  const n = players.length;
  const sliceAngle = (2 * Math.PI) / n;

  ctx.save();
  ctx.translate(CENTER, CENTER + 40);
  ctx.rotate(rotationRad);

  // ظل خارجي
  ctx.save();
  ctx.shadowColor = 'rgba(150,130,220,0.55)';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < n; i++) {
    const start = i * sliceAngle;
    const end = start + sliceAngle;
    const isHighlighted = highlightUserId && players[i].id === highlightUserId;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, RADIUS, start, end);
    ctx.closePath();
    ctx.fillStyle = isHighlighted ? '#ffd76b' : COLORS[i % COLORS.length];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0d0d10';
    ctx.stroke();

    // اسم اللاعب داخل القطاع
    ctx.save();
    ctx.rotate(start + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isHighlighted ? '#1a1a1e' : '#242028';
    ctx.font = 'bold 22px NotoArabic';
    const label = players[i].name.length > 12 ? players[i].name.slice(0, 12) + '…' : players[i].name;
    ctx.fillText(label, RADIUS - 30, 0);
    ctx.restore();
  }

  // خطوط فاصلة من المركز
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#0d0d10';
  ctx.stroke();

  ctx.restore();

  // الدائرة المركزية (شعار/صورة)
  const centerRadius = 75;
  ctx.save();
  ctx.translate(CENTER, CENTER + 40);
  ctx.beginPath();
  ctx.arc(0, 0, centerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#111114';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#c9c0ea';
  ctx.stroke();

  try {
    if (players[0] && players[0].avatarURL) {
      // نعرض صورة أول لاعب أو صورة السيرفر كديكور مركزي (اختياري)
    }
  } catch (_) { /* تجاهل */ }

  ctx.fillStyle = '#c9c0ea';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('INF', 0, 0);
  ctx.restore();

  // المؤشر (السهم) في الأعلى يمين يشير للقطاع المتوقف عنده
  ctx.save();
  ctx.translate(CENTER + RADIUS + 15, CENTER + 40);
  ctx.beginPath();
  ctx.moveTo(-25, -18);
  ctx.lineTo(-25, 18);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // عنوان أسفل العجلة
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px NotoArabic';
  ctx.textAlign = 'center';
  ctx.fillText('ROULETTE', CENTER, SIZE + 65);

  return canvas.encode('png');
}

module.exports = { drawWheel };
