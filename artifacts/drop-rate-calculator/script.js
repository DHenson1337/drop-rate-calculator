/* ============================================================
   DROP RATE CALCULATOR — script.js
   Pure vanilla JS, no libraries.
   ============================================================ */

'use strict';

// ── DOM refs ─────────────────────────────────────────────────
const dropRateInput   = document.getElementById('drop-rate');
const attemptsNum     = document.getElementById('attempts-num');
const attemptsSlider  = document.getElementById('attempts-slider');
const sliderDisplay   = document.getElementById('slider-display');
const errorMsg        = document.getElementById('error-msg');

const statAtleastone  = document.getElementById('stat-atleastone');
const statExpected    = document.getElementById('stat-expected');
const statNLabel      = document.getElementById('stat-n-label');
const conf50El        = document.getElementById('conf-50');
const conf90El        = document.getElementById('conf-90');
const conf99El        = document.getElementById('conf-99');

const verdictEl       = document.getElementById('verdict');
const verdictIcon     = document.getElementById('verdict-icon');
const verdictTitle    = document.getElementById('verdict-title');
const verdictSub      = document.getElementById('verdict-sub');

const chartCanvas     = document.getElementById('chart');
const presetBtns      = document.querySelectorAll('.preset-btn');

// ── State ─────────────────────────────────────────────────────
let currentP = null;   // parsed drop probability [0,1]
let currentN = 100;    // number of attempts
let rafId    = null;   // animation frame for chart redraws

// ── Maths ─────────────────────────────────────────────────────

/** Parse "3%", "1/512", "0.05" → probability in (0,1), or null on failure.
 *  Strict: no trailing junk, no mixed formats. */
function parseDropRate(raw) {
  const s = raw.trim();
  if (!s) return null;

  // Fraction: digits/digits (spaces around / allowed)
  if (s.includes('/')) {
    const m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const num = parseFloat(m[1]);
    const den = parseFloat(m[2]);
    if (isNaN(num) || isNaN(den) || den === 0) return null;
    return num / den;
  }

  // Percentage: digits followed immediately by %
  if (s.endsWith('%')) {
    const m = s.match(/^(\d+(?:\.\d+)?)%$/);
    if (!m) return null;
    return parseFloat(m[1]) / 100;
  }

  // Plain decimal: digits only, optional single dot
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

/** Validate p; returns error string or null */
function validateP(p) {
  if (p === null)  return 'Enter a rate like "3%", "0.05", or "1/512".';
  if (isNaN(p))    return 'That doesn\'t look like a number.';
  if (p <= 0)      return 'Drop rate must be greater than 0%.';
  if (p >= 1)      return 'Drop rate must be less than 100%.';
  return null;
}

/** P(at least one drop in n attempts) = 1 − (1−p)^n */
function probAtLeastOne(p, n) {
  return 1 - Math.pow(1 - p, n);
}

/** Expected attempts for one drop = 1/p */
function expectedAttempts(p) {
  return 1 / p;
}

/** Minimum n such that P(≥1 drop) ≥ confidence: n = ⌈ln(1−c) / ln(1−p)⌉ */
function attemptsForConfidence(p, confidence) {
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - p));
}

// ── Luck Verdict ──────────────────────────────────────────────

const VERDICTS = [
  {
    level: 'legendary',
    icon:  '✨',
    title: 'Blessed by the RNG gods',
    // True 25th-percentile: 25% of players are done by p25 attempts
    sub:   (n, _exp, p25) => `${n} tries — you're in the luckiest 25% of players!`,
    test:  (n, _exp, _p50, _p90, _p99, p25) => n <= p25,
  },
  {
    level: 'good',
    icon:  '🍀',
    title: 'You got lucky!',
    sub:   (n, exp) => `${n} attempts vs ${fmt(exp)} expected — above average luck.`,
    test:  (n, exp) => n <= exp,
  },
  {
    level: 'neutral',
    icon:  '🎲',
    title: "You're within normal RNG range",
    sub:   (n, _exp, _p25, p90) => `${n} attempts. 90% of players get it by ${fmt(p90)}.`,
    test:  (n, _exp, _p50, p90) => n <= p90,
  },
  {
    level: 'bad',
    icon:  '😤',
    title: "Rough luck — you're in the unlucky 10%",
    sub:   (n, _exp, _p25, _p90, p99) => `${n} attempts. Only 1% of players go past ${fmt(p99)}.`,
    test:  (n, _exp, _p50, _p90, p99) => n <= p99,
  },
  {
    level: 'cursed',
    icon:  '💀',
    title: 'The RNG gods have forsaken you',
    sub:   (n) => `${n} attempts and counting. Less than 1% of players go this long.`,
    test:  () => true, // catch-all
  },
];

function getVerdict(n, p) {
  const exp  = expectedAttempts(p);
  const p25  = attemptsForConfidence(p, 0.25);
  const p50  = attemptsForConfidence(p, 0.50);
  const p90  = attemptsForConfidence(p, 0.90);
  const p99  = attemptsForConfidence(p, 0.99);

  for (const v of VERDICTS) {
    if (v.test(n, exp, p50, p90, p99, p25)) {
      return {
        level: v.level,
        icon:  v.icon,
        title: v.title,
        sub:   v.sub(n, exp, p25, p90, p99),
      };
    }
  }
}

// ── Formatting ────────────────────────────────────────────────

/** Format a number with commas; ≥1000 gets grouped */
function fmt(n) {
  if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1000)  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 100)   return Math.round(n).toString();
  if (n >= 10)    return n.toFixed(1);
  return n.toFixed(2);
}

function fmtPct(v) {
  return (v * 100).toFixed(2) + '%';
}

// ── Chart ─────────────────────────────────────────────────────

const COLORS = {
  curve:    '#7c4dff',
  fill0:    'rgba(124, 77, 255, 0.30)',
  fill1:    'rgba(124, 77, 255, 0.00)',
  c50:      '#60a5fa',
  c90:      '#fb923c',
  c99:      '#f87171',
  grid:     'rgba(255,255,255,0.06)',
  axis:     'rgba(255,255,255,0.15)',
  label:    '#5a5a80',
  bg:       '#141424',
};

function drawChart(p, n) {
  const canvas = chartCanvas;
  const wrap   = canvas.parentElement;
  const dpr    = window.devicePixelRatio || 1;
  const W      = wrap.clientWidth;
  const H      = wrap.clientHeight;

  if (W <= 0 || H <= 0) return;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Padding for axes
  const pad = { top: 16, right: 20, bottom: 36, left: 50 };
  const pw  = W - pad.left - pad.right;   // plot width
  const ph  = H - pad.top  - pad.bottom;  // plot height

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  if (!p || !n || n < 1) return;

  const exp  = expectedAttempts(p);
  const c50  = attemptsForConfidence(p, 0.50);
  const c90  = attemptsForConfidence(p, 0.90);
  const c99  = attemptsForConfidence(p, 0.99);

  // x-axis domain: always show at least through the 90% confidence marker
  // so users can see where "normal range" ends relative to their attempts
  const xMax = Math.max(n, c90);

  // helpers: value → canvas coords
  const cx = (attempt) => pad.left + (attempt / xMax) * pw;
  const cy = (prob)    => pad.top  + ph * (1 - prob);

  // ── Grid lines (horizontal at 0%, 25%, 50%, 75%, 100%) ──
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);

  [0, 0.25, 0.5, 0.75, 1.0].forEach(level => {
    const y = cy(level);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + pw, y);
    ctx.stroke();

    // Y label
    ctx.fillStyle  = COLORS.label;
    ctx.font       = `11px 'Space Mono', monospace`;
    ctx.textAlign  = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(level * 100)}%`, pad.left - 8, y);
  });
  ctx.restore();

  // ── Confidence markers (vertical dashed lines) ──
  const markers = [
    { x: c50, color: COLORS.c50,  label: '50%' },
    { x: c90, color: COLORS.c90,  label: '90%' },
    { x: c99, color: COLORS.c99,  label: '99%' },
  ];

  markers.forEach(({ x, color, label }) => {
    if (x > xMax) return;
    const px = cx(x);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + ph);
    ctx.stroke();
    ctx.restore();
  });

  // ── Current attempt marker (vertical solid line) ──
  if (n <= xMax) {
    const px = cx(n);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + ph);
    ctx.stroke();
    ctx.restore();
  }

  // ── Probability curve ──
  // Draw from attempt 1 all the way to xMax so the full domain is covered
  const samples = Math.min(xMax, Math.max(300, pw));
  const step    = xMax / samples;

  // Build path points
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const k    = Math.max(1, Math.round(i * step));
    const prob = probAtLeastOne(p, k);
    pts.push({ x: cx(k), y: cy(prob) });
  }

  // Filled area under curve
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
  grad.addColorStop(0, COLORS.fill0);
  grad.addColorStop(1, COLORS.fill1);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx(0), cy(0));
  pts.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(pts[pts.length - 1].x, cy(0));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Curve line
  ctx.save();
  ctx.strokeStyle = COLORS.curve;
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.setLineDash([]);
  ctx.shadowColor  = COLORS.curve;
  ctx.shadowBlur   = 6;
  ctx.beginPath();
  pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
  ctx.stroke();
  ctx.restore();

  // ── Current-attempt dot on curve ──
  if (n >= 1 && n <= xMax) {
    const dotProb = probAtLeastOne(p, n);
    const dotX    = cx(n);
    const dotY    = cy(dotProb);

    // Outer glow ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(dotX, dotY, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(124,77,255,0.25)';
    ctx.fill();
    ctx.restore();

    // White dot
    ctx.save();
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#fff';
    ctx.shadowColor = COLORS.curve;
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.restore();

    // Tooltip label (probability at current n)
    const labelText  = fmtPct(dotProb);
    const labelX     = dotX + 10;
    const labelY     = dotY - 10;
    ctx.save();
    ctx.font         = `bold 11px 'Space Mono', monospace`;
    ctx.fillStyle    = '#fff';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    // Keep inside plot bounds
    const measured = ctx.measureText(labelText).width;
    const finalX   = (labelX + measured > pad.left + pw) ? dotX - measured - 10 : labelX;
    ctx.fillText(labelText, finalX, labelY + 2);
    ctx.restore();
  }

  // ── X-axis labels ──
  ctx.save();
  ctx.fillStyle    = COLORS.label;
  ctx.font         = `11px 'Space Mono', monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  const xTicks = smartTicks(xMax, Math.floor(pw / 55));
  xTicks.forEach(val => {
    const px = cx(val);
    if (px < pad.left || px > pad.left + pw) return;
    ctx.fillText(val >= 1000 ? (val / 1000) + 'k' : val.toString(), px, pad.top + ph + 6);
  });
  ctx.restore();

  // ── Axes ──
  ctx.save();
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth   = 1;
  // Y axis
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + ph);
  ctx.stroke();
  // X axis
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + ph);
  ctx.lineTo(pad.left + pw, pad.top + ph);
  ctx.stroke();
  ctx.restore();
}

/** Generate nice round tick values for an axis */
function smartTicks(max, targetCount) {
  if (targetCount < 2) targetCount = 2;
  const rough     = max / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm      = rough / magnitude;
  const nice      = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step      = nice * magnitude;
  const ticks     = [];
  for (let v = step; v <= max; v += step) {
    ticks.push(Math.round(v));
  }
  return ticks;
}

// ── UI Update ────────────────────────────────────────────────

function update() {
  const raw  = dropRateInput.value;
  const p    = parseDropRate(raw);
  const err  = raw.trim() === '' ? null : validateP(p);

  // Show / hide error
  if (err) {
    errorMsg.textContent = err;
    dropRateInput.classList.add('is-error');
  } else {
    errorMsg.textContent = '';
    dropRateInput.classList.remove('is-error');
  }

  currentP = (err === null && p !== null) ? p : null;

  if (currentP === null) {
    // Clear outputs
    statAtleastone.textContent = '—';
    statExpected.textContent   = '—';
    statNLabel.textContent     = '—';
    conf50El.textContent       = '—';
    conf90El.textContent       = '—';
    conf99El.textContent       = '—';
    setVerdict('neutral', '🎲', 'Enter your drop rate to begin', 'Awaiting input…');
    scheduleRedraw();
    return;
  }

  const n   = currentN;
  const prob = probAtLeastOne(currentP, n);
  const exp  = expectedAttempts(currentP);
  const c50  = attemptsForConfidence(currentP, 0.50);
  const c90  = attemptsForConfidence(currentP, 0.90);
  const c99  = attemptsForConfidence(currentP, 0.99);

  // Stats
  statAtleastone.textContent = fmtPct(prob);
  statExpected.textContent   = fmt(exp);
  statNLabel.textContent     = n.toLocaleString();
  conf50El.textContent       = fmt(c50);
  conf90El.textContent       = fmt(c90);
  conf99El.textContent       = fmt(c99);

  // Verdict
  const v = getVerdict(n, currentP);
  setVerdict(v.level, v.icon, v.title, v.sub);

  // Chart
  scheduleRedraw();
}

function setVerdict(level, icon, title, sub) {
  verdictEl.className = `verdict verdict--${level}`;
  verdictIcon.textContent  = icon;
  verdictTitle.textContent = title;
  verdictSub.textContent   = sub;
}

function scheduleRedraw() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    drawChart(currentP, currentN);
    rafId = null;
  });
}

// ── Event Listeners ───────────────────────────────────────────

dropRateInput.addEventListener('input', update);

attemptsNum.addEventListener('input', () => {
  let v = parseInt(attemptsNum.value, 10);
  if (isNaN(v) || v < 1) v = 1;
  if (v > 100000) v = 100000;
  // Sync the clamped value back so displayed input matches computation
  if (String(v) !== attemptsNum.value) attemptsNum.value = v;
  currentN = v;
  attemptsSlider.value = Math.min(v, 1000);
  sliderDisplay.textContent = v.toLocaleString();
  update();
});

attemptsSlider.addEventListener('input', () => {
  const v = parseInt(attemptsSlider.value, 10);
  currentN = v;
  attemptsNum.value = v;
  sliderDisplay.textContent = v.toLocaleString();
  update();
});

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const rate     = btn.dataset.rate;
    const attempts = parseInt(btn.dataset.attempts, 10);

    dropRateInput.value = rate;
    currentN = attempts;
    attemptsNum.value = attempts;
    attemptsSlider.value = Math.min(attempts, 1000);
    sliderDisplay.textContent = attempts.toLocaleString();
    update();
  });
});

// ── Resize observer (redraw chart on container resize) ────────

const resizeObserver = new ResizeObserver(() => scheduleRedraw());
resizeObserver.observe(chartCanvas.parentElement);

// ── Init ──────────────────────────────────────────────────────

// Seed with a classic preset so the app looks alive on first load
dropRateInput.value       = '1/512';
attemptsNum.value         = 100;
attemptsSlider.value      = 100;
sliderDisplay.textContent = '100';
currentN                  = 100;
update();
