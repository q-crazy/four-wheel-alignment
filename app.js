const inputs = {
  preset: document.getElementById("presetSelect"),
  dmF: document.getElementById("dmF"),
  dmR: document.getElementById("dmR"),
  dC: document.getElementById("dC"),
  totalFront: document.getElementById("totalFront"),
  totalRear: document.getElementById("totalRear"),
  diagnostic: document.getElementById("diagnosticToggle"),
};

const outputs = {
  dmF: document.getElementById("dmFValue"),
  dmR: document.getElementById("dmRValue"),
  dC: document.getElementById("dCValue"),
  totalFront: document.getElementById("totalFrontValue"),
  totalRear: document.getElementById("totalRearValue"),
  frontBalance: document.getElementById("frontBalanceValue"),
  rearBalance: document.getElementById("rearBalanceValue"),
  cancel: document.getElementById("cancelValue"),
  frontSplit: document.getElementById("frontSplitValue"),
  rearSplit: document.getElementById("rearSplitValue"),
  frontCompact: document.getElementById("frontCompactValue"),
  rearCompact: document.getElementById("rearCompactValue"),
  frontLeftToe: document.getElementById("frontLeftToe"),
  frontRightToe: document.getElementById("frontRightToe"),
  rearLeftToe: document.getElementById("rearLeftToe"),
  rearRightToe: document.getElementById("rearRightToe"),
  diagnosticNote: document.getElementById("diagnosticNote"),
  mirrorCheck: document.getElementById("mirrorCheck"),
};

const calculatorInputs = {
  casterFL: getAngleControl("calcCasterFL"),
  casterFR: getAngleControl("calcCasterFR"),
  camberFL: getAngleControl("calcCamberFL"),
  camberFR: getAngleControl("calcCamberFR"),
  camberRL: getAngleControl("calcCamberRL"),
  camberRR: getAngleControl("calcCamberRR"),
  toeFL: getAngleControl("calcToeFL"),
  toeFR: getAngleControl("calcToeFR"),
  toeRL: getAngleControl("calcToeRL"),
  toeRR: getAngleControl("calcToeRR"),
  targetFront: getAngleControl("calcTargetFront"),
  targetRear: getAngleControl("calcTargetRear"),
};

const calculatorOutputs = {
  dmF: document.getElementById("calcDmF"),
  dmR: document.getElementById("calcDmR"),
  dC: document.getElementById("calcDC"),
  frontSplit: document.getElementById("calcFrontSplit"),
  rearSplit: document.getElementById("calcRearSplit"),
  status: document.getElementById("calcStatus"),
  targetFL: document.getElementById("calcTargetFL"),
  targetFR: document.getElementById("calcTargetFR"),
  targetRL: document.getElementById("calcTargetRL"),
  targetRR: document.getElementById("calcTargetRR"),
  deltaFL: document.getElementById("calcDeltaFL"),
  deltaFR: document.getElementById("calcDeltaFR"),
  deltaRL: document.getElementById("calcDeltaRL"),
  deltaRR: document.getElementById("calcDeltaRR"),
};

const carCanvas = document.getElementById("carCanvas");
const camberCanvas = document.getElementById("camberCanvas");
const carCtx = carCanvas.getContext("2d");
const camberCtx = camberCanvas.getContext("2d");

const presets = {
  current: { dmF: 24, dmR: 8, dC: -2, totalFront: 6, totalRear: 11, diagnostic: false },
  measure3: { dmF: 7, dmR: -3, dC: 9, totalFront: 6, totalRear: 11, diagnostic: false },
  group: { dmF: 4, dmR: -8, dC: 10, totalFront: 4, totalRear: 10, diagnostic: false },
  neutral: { dmF: 0, dmR: 0, dC: 0, totalFront: 6, totalRear: 10, diagnostic: false },
};

let state = { ...presets.current };
let visual = { ...state };
let phase = 0;

function fmt(value, options = {}) {
  const totalMinutes = Math.round(Number(value));
  const normalized = Object.is(totalMinutes, -0) ? 0 : totalMinutes;
  const sign = normalized < 0 ? "-" : options.forcePlus && normalized > 0 ? "+" : "";
  const absolute = Math.abs(normalized);
  const degrees = Math.floor(absolute / 60);
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${degrees}°${minutes}'`;
}

function fmtDelta(value) {
  const normalized = Math.abs(value) < 0.5 ? 0 : value;
  return fmt(normalized, { forcePlus: true });
}

function getAngleControl(id) {
  return {
    sign: document.getElementById(`${id}Sign`),
    degrees: document.getElementById(`${id}Deg`),
    minutes: document.getElementById(`${id}Min`),
  };
}

function readNumericPart(element) {
  if (!element.value.trim()) return null;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : null;
}

function readCalculatorInput(control) {
  const degrees = readNumericPart(control.degrees);
  const minutes = readNumericPart(control.minutes);
  if (degrees === null || minutes === null) return null;
  const sign = Number(control.sign.value) < 0 ? -1 : 1;
  return sign * (Math.abs(degrees) * 60 + Math.abs(minutes));
}

function normalizeAngleControl(control) {
  const value = readCalculatorInput(control);
  if (value === null) return;
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(Math.round(value));
  control.sign.value = String(sign);
  control.degrees.value = String(Math.floor(absolute / 60));
  control.minutes.value = String(absolute % 60);
}

function angleControlElements(control) {
  return [control.sign, control.degrees, control.minutes];
}

function addAngleControlListeners(control) {
  for (const element of angleControlElements(control)) {
    element.addEventListener("input", updateCalculator);
    element.addEventListener("blur", () => {
      normalizeAngleControl(control);
      updateCalculator();
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current, target, amount) {
  return current + (target - current) * amount;
}

function readState() {
  state = {
    dmF: Number(inputs.dmF.value),
    dmR: Number(inputs.dmR.value),
    dC: Number(inputs.dC.value),
    totalFront: Number(inputs.totalFront.value),
    totalRear: Number(inputs.totalRear.value),
    diagnostic: inputs.diagnostic.checked,
  };
  updateOutputs();
}

function applyPreset(name) {
  const preset = presets[name] ?? presets.current;
  inputs.dmF.value = preset.dmF;
  inputs.dmR.value = preset.dmR;
  inputs.dC.value = preset.dC;
  inputs.totalFront.value = preset.totalFront;
  inputs.totalRear.value = preset.totalRear;
  inputs.diagnostic.checked = preset.diagnostic;
  readState();
}

function computeModel(s) {
  const acceptedFront = 0.406 * s.dmF + 0.354 * s.dC;
  const acceptedRear = 0.367 * s.dmR + 0.391 * s.dC;
  const compactFront = 0.39 * (s.dmF + s.dC);
  const compactRear = 0.376 * (s.dmR + s.dC);
  const diagnosticRear = 0.356 * (s.dmR + s.dC) + 0.00164 * s.dmF * s.dmR;
  const activeRear = s.diagnostic ? diagnosticRear : acceptedRear;

  return {
    acceptedFront,
    acceptedRear,
    compactFront,
    compactRear,
    diagnosticRear,
    activeRear,
    frontLeftToe: (s.totalFront + acceptedFront) / 2,
    frontRightToe: (s.totalFront - acceptedFront) / 2,
    rearLeftToe: (s.totalRear + activeRear) / 2,
    rearRightToe: (s.totalRear - activeRear) / 2,
    frontBalance: s.dmF + s.dC,
    rearBalance: s.dmR + s.dC,
  };
}

function setCalculatorOutputs(values) {
  for (const [key, value] of Object.entries(values)) {
    calculatorOutputs[key].textContent = value;
  }
}

function updateCalculator() {
  const calc = {};
  for (const [key, element] of Object.entries(calculatorInputs)) {
    calc[key] = readCalculatorInput(element);
  }

  const missing = Object.entries(calc)
    .filter(([, value]) => value === null)
    .map(([key]) => key);

  if (missing.length) {
    setCalculatorOutputs({
      dmF: "-",
      dmR: "-",
      dC: "-",
      frontSplit: "-",
      rearSplit: "-",
      targetFL: "-",
      targetFR: "-",
      targetRL: "-",
      targetRR: "-",
      deltaFL: "-",
      deltaFR: "-",
      deltaRL: "-",
      deltaRR: "-",
    });
    calculatorOutputs.status.textContent = "Complete sign, degree, and minute fields to calculate toe targets.";
    return;
  }

  const dmF = calc.camberFL - calc.camberFR;
  const dmR = calc.camberRL - calc.camberRR;
  const dC = calc.casterFR - calc.casterFL;
  const frontSplit = 0.406 * dmF + 0.354 * dC;
  const rearSplit = 0.367 * dmR + 0.391 * dC;
  const targetFL = (calc.targetFront + frontSplit) / 2;
  const targetFR = (calc.targetFront - frontSplit) / 2;
  const targetRL = (calc.targetRear + rearSplit) / 2;
  const targetRR = (calc.targetRear - rearSplit) / 2;

  setCalculatorOutputs({
    dmF: fmt(dmF),
    dmR: fmt(dmR),
    dC: fmt(dC),
    frontSplit: fmt(frontSplit),
    rearSplit: fmt(rearSplit),
    targetFL: fmt(targetFL),
    targetFR: fmt(targetFR),
    targetRL: fmt(targetRL),
    targetRR: fmt(targetRR),
    deltaFL: fmtDelta(targetFL - calc.toeFL),
    deltaFR: fmtDelta(targetFR - calc.toeFR),
    deltaRL: fmtDelta(targetRL - calc.toeRL),
    deltaRR: fmtDelta(targetRR - calc.toeRR),
  });
  calculatorOutputs.status.textContent = "Targets use accepted split formulas; diagnostic rear term is excluded.";
}

function updateOutputs() {
  const model = computeModel(state);
  outputs.dmF.textContent = fmt(state.dmF);
  outputs.dmR.textContent = fmt(state.dmR);
  outputs.dC.textContent = fmt(state.dC);
  outputs.totalFront.textContent = fmt(state.totalFront);
  outputs.totalRear.textContent = fmt(state.totalRear);
  outputs.frontBalance.textContent = fmt(model.frontBalance);
  outputs.rearBalance.textContent = fmt(model.rearBalance);
  outputs.frontSplit.textContent = fmt(model.acceptedFront);
  outputs.rearSplit.textContent = fmt(model.activeRear);
  outputs.frontCompact.textContent = fmt(model.compactFront);
  outputs.rearCompact.textContent = fmt(model.compactRear);
  outputs.frontLeftToe.textContent = fmt(model.frontLeftToe);
  outputs.frontRightToe.textContent = fmt(model.frontRightToe);
  outputs.rearLeftToe.textContent = fmt(model.rearLeftToe);
  outputs.rearRightToe.textContent = fmt(model.rearRightToe);
  outputs.cancel.textContent = cancellationLabel(state.dmF, state.dmR, state.dC);
  outputs.diagnosticNote.style.opacity = state.diagnostic ? "1" : "0.68";
  outputs.mirrorCheck.textContent = mirrorCheckText(state, model);
}

function mirrorCheckText(s, model) {
  const diagnosticExtra = 0.00164 * s.dmF * s.dmR;
  const mirrored = computeModel({
    ...s,
    dmF: -s.dmF,
    dmR: -s.dmR,
    dC: -s.dC,
    diagnostic: false,
  });
  return `Accepted rear: ${fmt(model.acceptedRear)}; mirrored accepted: ${fmt(mirrored.acceptedRear)}. Diagnostic extra: ${fmt(diagnosticExtra)}; mirrored extra stays ${fmt(diagnosticExtra)}.`;
}

function cancellationLabel(dmF, dmR, dC) {
  const frontOpposes = Math.sign(dmF) !== 0 && Math.sign(dC) !== 0 && Math.sign(dmF) !== Math.sign(dC);
  const rearOpposes = Math.sign(dmR) !== 0 && Math.sign(dC) !== 0 && Math.sign(dmR) !== Math.sign(dC);
  if (frontOpposes && rearOpposes) return "front + rear";
  if (frontOpposes) return "front";
  if (rearOpposes) return "rear";
  return "none";
}

function setupCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawArrow(ctx, x1, y1, x2, y2, color, label, pulseOffset = 0) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 3) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const head = 9;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  const dotDistance = ((pulseOffset % 1) + 1) % 1;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = x1 + dx * length * dotDistance;
  const py = y1 + dy * length * dotDistance;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (label) {
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tx = x1 + (x2 - x1) * 0.5;
    const ty = y1 + (y2 - y1) * 0.5 - 13;
    ctx.fillText(label, tx, ty);
  }
  ctx.restore();
}

function drawWheel(ctx, x, y, toe, side, label) {
  const exaggerated = clamp((toe / 60) * 18, -10, 10);
  const visualAngle = (side === "L" ? exaggerated : -exaggerated) * (Math.PI / 180);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(visualAngle);
  roundedRect(ctx, -13, -42, 26, 84, 7);
  ctx.fillStyle = "#22262b";
  ctx.fill();
  roundedRect(ctx, -7, -34, 14, 68, 5);
  ctx.fillStyle = "#3b4148";
  ctx.fill();
  ctx.strokeStyle = "#dfe8ee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -35);
  ctx.lineTo(0, 35);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#2f343b";
  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, x, y + 48);
  ctx.fillStyle = "#68717a";
  ctx.font = "700 10px Inter, system-ui, sans-serif";
  ctx.fillText(fmt(toe), x, y + 63);
}

function drawVectorStack(ctx, cx, y, dm, dC, targetD, axleLabel, width) {
  const scale = Math.min(width * 0.012, 6.2);
  const baseX = cx;
  const camberLen = clamp(dm * scale, -150, 150);
  const casterLen = clamp(dC * scale, -120, 120);
  const toeLen = clamp(targetD * scale * 1.2, -155, 155);

  ctx.save();
  ctx.font = "760 12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#30343a";
  ctx.textAlign = "center";
  ctx.fillText(axleLabel, cx, y - 50);
  drawArrow(ctx, baseX, y - 32, baseX + camberLen, y - 32, "#0f766e", "dm", phase * 0.9);
  drawArrow(ctx, baseX, y, baseX + casterLen, y, "#b45309", "dC", phase * 0.75 + 0.25);
  drawArrow(ctx, baseX, y + 32, baseX + toeLen, y + 32, "#2563eb", "D", phase * 1.1 + 0.5);
  ctx.restore();
}

function drawCar() {
  const size = setupCanvas(carCanvas, carCtx);
  const ctx = carCtx;
  const model = computeModel(visual);
  const w = size.width;
  const h = size.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const bodyW = clamp(w * 0.32, 190, 290);
  const bodyH = clamp(h * 0.62, 330, 455);
  const bodyX = cx - bodyW / 2;
  const bodyY = h * 0.18;
  const frontY = bodyY + bodyH * 0.22;
  const rearY = bodyY + bodyH * 0.78;
  const halfTrack = clamp(w * 0.24, 145, 230);
  const leftX = cx - halfTrack;
  const rightX = cx + halfTrack;

  ctx.save();
  ctx.strokeStyle = "#e6e3d8";
  ctx.lineWidth = 1;
  for (let x = 28; x < w; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 26; y < h; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#b8c0c5";
  ctx.setLineDash([8, 9]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, bodyY - 40);
  ctx.lineTo(cx, bodyY + bodyH + 45);
  ctx.stroke();
  ctx.restore();

  const referenceOffset = clamp(visual.dC * 2.1, -32, 32);
  ctx.save();
  ctx.strokeStyle = "#b45309";
  ctx.globalAlpha = 0.72;
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + referenceOffset, bodyY - 28);
  ctx.lineTo(cx - referenceOffset * 0.35, bodyY + bodyH + 36);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, bodyX, bodyY, bodyW, bodyH, 8);
  ctx.fillStyle = "#d8e5e2";
  ctx.fill();
  ctx.strokeStyle = "#78938d";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, bodyY - 32);
  ctx.lineTo(bodyX + bodyW * 0.18, bodyY + bodyH * 0.13);
  ctx.lineTo(bodyX + bodyW * 0.82, bodyY + bodyH * 0.13);
  ctx.closePath();
  ctx.fillStyle = "#eef5f4";
  ctx.fill();
  ctx.strokeStyle = "#9db4af";
  ctx.stroke();

  roundedRect(ctx, bodyX + bodyW * 0.18, bodyY + bodyH * 0.25, bodyW * 0.64, bodyH * 0.18, 7);
  ctx.fillStyle = "#f7fbfb";
  ctx.fill();
  roundedRect(ctx, bodyX + bodyW * 0.2, bodyY + bodyH * 0.54, bodyW * 0.6, bodyH * 0.16, 7);
  ctx.fill();
  ctx.restore();

  drawWheel(ctx, leftX, frontY, model.frontLeftToe, "L", "FL");
  drawWheel(ctx, rightX, frontY, model.frontRightToe, "R", "FR");
  drawWheel(ctx, leftX, rearY, model.rearLeftToe, "L", "RL");
  drawWheel(ctx, rightX, rearY, model.rearRightToe, "R", "RR");

  drawVectorStack(ctx, cx, Math.max(82, bodyY - 48), visual.dmF, visual.dC, model.acceptedFront, "Front split balance", w);
  drawVectorStack(ctx, cx, Math.min(h - 72, bodyY + bodyH + 54), visual.dmR, visual.dC, model.activeRear, "Rear split balance", w);

  ctx.save();
  ctx.fillStyle = "#2b3137";
  ctx.font = "760 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Toe-in positive", 18, h - 44);
  ctx.fillStyle = "#66717a";
  ctx.font = "650 11px Inter, system-ui, sans-serif";
  ctx.fillText("Wheel angles are visually exaggerated; numeric outputs use x°xx'.", 18, h - 25);
  ctx.restore();
}

function drawCamberWheel(ctx, x, y, magnitude, side, label) {
  const angle = clamp((magnitude / 60) * 9, -11, 11) * (Math.PI / 180);
  const signed = side === "L" ? angle : -angle;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(signed);
  roundedRect(ctx, -8, -32, 16, 64, 6);
  ctx.fillStyle = "#25313a";
  ctx.fill();
  ctx.strokeStyle = "#d7e9e5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.lineTo(0, 27);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#30343a";
  ctx.font = "760 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 42);
  ctx.fillStyle = "#68717a";
  ctx.font = "650 10px Inter, system-ui, sans-serif";
  ctx.fillText(`m ${fmt(magnitude)}`, x, y + 56);
}

function drawCamber() {
  const size = setupCanvas(camberCanvas, camberCtx);
  const ctx = camberCtx;
  const w = size.width;
  const h = size.height;
  ctx.clearRect(0, 0, w, h);

  const frontBase = 50;
  const rearBase = 55;
  const frontLeftM = frontBase - visual.dmF / 2;
  const frontRightM = frontBase + visual.dmF / 2;
  const rearLeftM = rearBase - visual.dmR / 2;
  const rearRightM = rearBase + visual.dmR / 2;

  ctx.save();
  ctx.strokeStyle = "#d8d5ca";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(22, h * 0.45);
  ctx.lineTo(w - 22, h * 0.45);
  ctx.moveTo(22, h * 0.7);
  ctx.lineTo(w - 22, h * 0.7);
  ctx.stroke();
  ctx.fillStyle = "#30343a";
  ctx.font = "760 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Relative camber magnitude split", 16, 20);
  ctx.fillStyle = "#6b6f76";
  ctx.font = "650 10px Inter, system-ui, sans-serif";
  ctx.fillText("m = -camber; larger m = more negative camber", 16, 36);
  ctx.restore();

  const leftX = w * 0.24;
  const rightX = w * 0.76;
  drawCamberWheel(ctx, leftX, h * 0.42, frontLeftM, "L", "FL");
  drawCamberWheel(ctx, rightX, h * 0.42, frontRightM, "R", "FR");
  drawCamberWheel(ctx, leftX, h * 0.68, rearLeftM, "L", "RL");
  drawCamberWheel(ctx, rightX, h * 0.68, rearRightM, "R", "RR");
}

function animate() {
  phase += 0.012;
  for (const key of ["dmF", "dmR", "dC", "totalFront", "totalRear"]) {
    visual[key] = lerp(visual[key], state[key], 0.12);
  }
  visual.diagnostic = state.diagnostic;
  drawCar();
  drawCamber();
  requestAnimationFrame(animate);
}

for (const key of ["dmF", "dmR", "dC", "totalFront", "totalRear", "diagnostic"]) {
  inputs[key].addEventListener("input", () => {
    inputs.preset.value = "custom";
    readState();
  });
}

inputs.preset.addEventListener("change", (event) => {
  applyPreset(event.target.value);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  inputs.preset.value = "current";
  applyPreset("current");
});

window.addEventListener("resize", () => {
  drawCar();
  drawCamber();
});

for (const control of Object.values(calculatorInputs)) {
  addAngleControlListeners(control);
}

const customOption = document.createElement("option");
customOption.value = "custom";
customOption.textContent = "Custom";
inputs.preset.appendChild(customOption);

applyPreset("current");
updateCalculator();
animate();
