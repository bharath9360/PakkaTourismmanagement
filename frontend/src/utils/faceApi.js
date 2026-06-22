/**
 * faceApi.js — Utility for face-api.js operations
 * Handles model loading, face detection, descriptor extraction, and matching.
 */
import * as faceapi from 'face-api.js';

let modelsLoaded = false;
let loadingPromise = null;

const MODEL_URL = '/models';

/**
 * Load face-api.js models from /models directory.
 * Models are cached — subsequent calls return immediately.
 */
export async function loadModels() {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]).then(() => {
    modelsLoaded = true;
    console.log('✅ face-api.js models loaded');
  });

  return loadingPromise;
}

export function areModelsLoaded() {
  return modelsLoaded;
}

/**
 * Detect a single face in a video/canvas/image element.
 * Returns { detection, landmarks, descriptor } or null if no face found.
 */
export async function detectSingleFace(mediaElement) {
  try {
    const result = await faceapi
      .detectSingleFace(mediaElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    return result || null;
  } catch (err) {
    console.error('Face detection error:', err);
    return null;
  }
}

/**
 * Draw detection results (bounding box + score) on a canvas overlay.
 */
export function drawDetectionOnCanvas(detections, displaySize, canvas) {
  faceapi.matchDimensions(canvas, displaySize);
  const resized = faceapi.resizeResults(detections, displaySize);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!resized) return;

  const box = resized.detection.box;
  const score = resized.detection.score;

  // Draw bounding box
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#10B981';
  ctx.shadowBlur = 8;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Draw corner accents
  const corner = 16;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#34D399';
  ctx.lineWidth = 3;
  [
    [box.x, box.y, corner, 0, 0, corner],
    [box.x + box.width, box.y, -corner, 0, 0, corner],
    [box.x, box.y + box.height, corner, 0, 0, -corner],
    [box.x + box.width, box.y + box.height, -corner, 0, 0, -corner],
  ].forEach(([x, y, dx1, dy1, dx2, dy2]) => {
    ctx.beginPath();
    ctx.moveTo(x + dx1, y + dy1);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx2, y + dy2);
    ctx.stroke();
  });

  // Draw confidence score label
  ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
  ctx.fillRect(box.x, box.y - 22, 80, 20);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillText(`${Math.round(score * 100)}% Face`, box.x + 4, box.y - 7);
}

/**
 * Clear the canvas overlay.
 */
export function clearCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Extract face descriptor (128-float Float32Array) from an HTMLImageElement.
 * Returns the descriptor array, or null if no face detected.
 */
export async function extractDescriptorFromImage(imgElement) {
  const result = await faceapi
    .detectSingleFace(imgElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return result ? Array.from(result.descriptor) : null;
}

/**
 * Compare two 128-float descriptors using Euclidean distance.
 * Returns distance (0 = identical, < 0.5 = same person, > 0.6 = different person).
 */
export function compareDescriptors(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) return Infinity;
  const d1 = desc1 instanceof Float32Array ? desc1 : new Float32Array(desc1);
  const d2 = desc2 instanceof Float32Array ? desc2 : new Float32Array(desc2);
  return faceapi.euclideanDistance(d1, d2);
}

/**
 * Capture a still frame from a <video> element into a data URL (JPEG).
 */
export function captureFrameFromVideo(videoEl, quality = 0.7) {
  const canvas = document.createElement('canvas');
  canvas.width  = videoEl.videoWidth  || 320;
  canvas.height = videoEl.videoHeight || 240;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}
