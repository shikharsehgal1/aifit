// PFAi — experimental camera body-shape estimator.
//
// ⚠️ READ THIS. This is an EXPERIMENTAL aid, not a measurement device and NOT a
// medical or official body-composition tool. It uses on-device pose estimation
// (TensorFlow.js MoveNet) to estimate body *proportions* from a single photo.
// It CANNOT measure body fat, and a single 2D image cannot reliably produce an
// official tape-test waist measurement. Output is a rough proxy only; the
// official screen is height/weight + an in-person tape measurement. Always let
// the user override with a real tape measurement. All processing is local —
// no image ever leaves the device.

let detector = null;
let loadError = null;

export async function initDetector() {
  if (detector) return detector;
  if (typeof poseDetection === 'undefined' || typeof tf === 'undefined') {
    loadError = 'Pose model libraries not loaded (offline?). Manual entry still works.';
    throw new Error(loadError);
  }
  await tf.ready();
  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
  });
  return detector;
}

export function detectorError() {
  return loadError;
}

// Estimate body proportions from a video/image element.
// Returns a rough waist-proxy and a shoulder:hip ratio, with a confidence flag.
// `knownHeightInches` calibrates the pixel->inch scale using detected body span.
export async function estimateProportions(mediaEl, knownHeightInches) {
  if (!detector) await initDetector();
  const poses = await detector.estimatePoses(mediaEl);
  if (!poses.length) return { ok: false, reason: 'No person detected. Center your full body in frame.' };

  const kp = {};
  for (const p of poses[0].keypoints) kp[p.name] = p;

  const need = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_ankle', 'right_ankle', 'nose'];
  const missing = need.filter((n) => !kp[n] || kp[n].score < 0.3);
  if (missing.length > 2)
    return { ok: false, reason: 'Could not see your full body clearly. Step back and ensure good lighting.' };

  const dist = (a, b) => Math.hypot(kp[a].x - kp[b].x, kp[a].y - kp[b].y);
  const shoulderW = dist('left_shoulder', 'right_shoulder');
  const hipW = dist('left_hip', 'right_hip');

  // Pixel body span (nose to mean ankle) used to calibrate scale to real height.
  const ankleY = (kp.left_ankle.y + kp.right_ankle.y) / 2;
  const bodyPx = Math.abs(ankleY - kp.nose.y);
  const pxPerInch = knownHeightInches ? bodyPx / (knownHeightInches * 0.92) : null; // nose≈8% below crown

  // Very rough waist circumference proxy: average of shoulder/hip frontal width
  // expanded by an empirical ellipse factor. THIS IS A PROXY, not a tape test.
  const frontalWaistPx = (shoulderW * 0.5 + hipW * 0.5);
  const ellipseFactor = 2.6; // crude frontal-width -> circumference constant
  const waistProxyIn = pxPerInch ? round1((frontalWaistPx / pxPerInch) * ellipseFactor) : null;

  const shoulderHipRatio = round1(shoulderW / (hipW || 1));
  const meanScore =
    need.reduce((s, n) => s + (kp[n]?.score || 0), 0) / need.length;

  return {
    ok: true,
    experimental: true,
    waistProxyIn,
    shoulderHipRatio,
    confidence: meanScore >= 0.6 ? 'moderate' : 'low',
    note: 'Experimental proxy from a single 2D image — verify with a real tape measurement before relying on it.',
    keypoints: poses[0].keypoints,
  };
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}
