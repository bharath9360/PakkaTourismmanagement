/**
 * FaceCapture.jsx — Reusable face capture component
 * Supports: camera capture (live video) or photo upload.
 * Integrates face-api.js to detect face and extract descriptor.
 *
 * Props:
 *   mode            'register' | 'verify'
 *   storedDescriptor  Float32Array/Array (for 'verify' mode, the stored descriptor to match against)
 *   onSuccess       (result: { descriptor, photoDataUrl, distance? }) => void
 *   onError         (message: string) => void
 *   onCancel        () => void
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  loadModels, areModelsLoaded,
  detectSingleFace, drawDetectionOnCanvas, clearCanvas,
  captureFrameFromVideo, compareDescriptors
} from '../utils/faceApi';

const MATCH_THRESHOLD = 0.52; // euclidean distance below this = same person

export default function FaceCapture({ mode = 'register', storedDescriptor, onSuccess, onError, onCancel }) {
  const [tab, setTab]               = useState('camera'); // 'camera' | 'upload'
  const [modelsReady, setModelsReady] = useState(areModelsLoaded());
  const [loadingModels, setLoadingModels] = useState(!areModelsLoaded());
  const [cameraOn, setCameraOn]     = useState(false);
  const [detecting, setDetecting]   = useState(false);
  const [faceFound, setFaceFound]   = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [statusMsg, setStatusMsg]   = useState('');
  const [statusType, setStatusType] = useState('info'); // 'info' | 'success' | 'error'
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadProcessing, setUploadProcessing] = useState(false);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectIntervalRef = useRef(null);

  // Load models on mount
  useEffect(() => {
    if (areModelsLoaded()) { setModelsReady(true); setLoadingModels(false); return; }
    setLoadingModels(true);
    loadModels().then(() => {
      setModelsReady(true);
      setLoadingModels(false);
    }).catch(err => {
      setLoadingModels(false);
      setStatusMsg('Failed to load face recognition models. Please refresh.');
      setStatusType('error');
    });
  }, []);

  // Auto-open camera when tab='camera' and models ready
  useEffect(() => {
    if (tab === 'camera' && modelsReady && !cameraOn) {
      openCamera();
    }
    return () => {
      if (tab !== 'camera') closeCamera();
    };
  }, [tab, modelsReady]);

  // Cleanup on unmount
  useEffect(() => () => { closeCamera(); }, []);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setStatusMsg('Position your face in the frame');
      setStatusType('info');
      startContinuousDetection();
    } catch (err) {
      setStatusMsg('Camera access denied. Please allow camera permission.');
      setStatusType('error');
      onError?.('Camera access denied');
    }
  };

  const closeCamera = () => {
    stopContinuousDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
    setFaceFound(false);
    clearCanvas(canvasRef.current);
  };

  const startContinuousDetection = () => {
    detectIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !modelsReady) return;
      const result = await detectSingleFace(videoRef.current);
      if (result) {
        setFaceFound(true);
        drawDetectionOnCanvas(
          result,
          { width: videoRef.current.videoWidth || 640, height: videoRef.current.videoHeight || 480 },
          canvasRef.current
        );
      } else {
        setFaceFound(false);
        clearCanvas(canvasRef.current);
      }
    }, 200);
  };

  const stopContinuousDetection = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
  };

  const handleCapture = async () => {
    if (!faceFound) {
      setStatusMsg('No face detected. Please position your face clearly.');
      setStatusType('error');
      return;
    }
    setScanning(true);
    setStatusMsg('Analyzing face…');
    setStatusType('info');
    stopContinuousDetection();

    try {
      const result = await detectSingleFace(videoRef.current);
      if (!result) {
        setStatusMsg('Face lost during capture. Please try again.');
        setStatusType('error');
        setScanning(false);
        startContinuousDetection();
        return;
      }
      const descriptor = Array.from(result.descriptor);
      const photoDataUrl = captureFrameFromVideo(videoRef.current, 0.7);
      closeCamera();

      if (mode === 'verify' && storedDescriptor) {
        const distance = compareDescriptors(descriptor, storedDescriptor);
        if (distance <= MATCH_THRESHOLD) {
          setStatusMsg(`✅ Face Verified! Match confidence: ${Math.round((1 - distance) * 100)}%`);
          setStatusType('success');
          onSuccess?.({ descriptor, photoDataUrl, distance, matched: true });
        } else {
          setStatusMsg(`❌ Face not recognized. Distance: ${distance.toFixed(3)} (threshold: ${MATCH_THRESHOLD})`);
          setStatusType('error');
          onError?.('Face not matched — please try again or contact admin');
        }
      } else {
        setStatusMsg('✅ Face captured and registered!');
        setStatusType('success');
        onSuccess?.({ descriptor, photoDataUrl, matched: null });
      }
    } catch (err) {
      setStatusMsg('Face processing failed. Please try again.');
      setStatusType('error');
      setScanning(false);
      startContinuousDetection();
    } finally {
      setScanning(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadProcessing(true);
    setStatusMsg('Processing uploaded photo…');
    setStatusType('info');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setUploadPreview(dataUrl);
      try {
        const img = new window.Image();
        img.src = dataUrl;
        await new Promise(res => img.onload = res);
        document.body.appendChild(img); // needs to be in DOM for face-api
        img.style.position = 'absolute';
        img.style.top = '-9999px';
        img.style.left = '-9999px';

        const result = await detectSingleFace(img);
        document.body.removeChild(img);

        if (!result) {
          setStatusMsg('No face detected in the photo. Please use a clear face photo.');
          setStatusType('error');
          setUploadProcessing(false);
          return;
        }
        const descriptor = Array.from(result.descriptor);

        if (mode === 'verify' && storedDescriptor) {
          const distance = compareDescriptors(descriptor, storedDescriptor);
          if (distance <= MATCH_THRESHOLD) {
            setStatusMsg(`✅ Face Verified! Match confidence: ${Math.round((1 - distance) * 100)}%`);
            setStatusType('success');
            onSuccess?.({ descriptor, photoDataUrl: dataUrl, distance, matched: true });
          } else {
            setStatusMsg(`❌ Face not recognized (distance: ${distance.toFixed(3)})`);
            setStatusType('error');
            onError?.('Face not matched');
          }
        } else {
          setStatusMsg('✅ Face detected and registered from photo!');
          setStatusType('success');
          onSuccess?.({ descriptor, photoDataUrl: dataUrl, matched: null });
        }
      } catch (err) {
        setStatusMsg('Photo processing failed. Please try a different photo.');
        setStatusType('error');
      } finally {
        setUploadProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const statusColor = { info: '#60A5FA', success: '#34D399', error: '#FCA5A5' };
  const statusBg = { info: 'rgba(59,130,246,0.1)', success: 'rgba(16,185,129,0.1)', error: 'rgba(220,38,38,0.1)' };
  const statusBorder = { info: 'rgba(96,165,250,0.3)', success: 'rgba(52,211,153,0.3)', error: 'rgba(248,113,113,0.3)' };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Loading models */}
      {loadingModels && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{
            width: 36, height: 36,
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#3B82F6', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'
          }} />
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Loading Face Recognition AI…</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>First load may take a moment</div>
        </div>
      )}

      {/* Tab switch: Camera / Upload */}
      {!loadingModels && (
        <>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '3px', border: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { id: 'camera', label: '📷 Live Camera' },
              { id: 'upload', label: '🖼️ Upload Photo' },
            ].map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: tab === t.id ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: tab === t.id ? '#93C5FD' : 'rgba(255,255,255,0.4)',
                  fontSize: '12px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.15s',
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* Camera panel */}
          {tab === 'camera' && (
            <div>
              <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#0A0E1A', border: `2px solid ${faceFound ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.08)'}`, transition: 'border-color 0.3s', aspectRatio: '4/3', maxHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' /* mirror */ }}
                />
                <canvas
                  ref={canvasRef}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', pointerEvents: 'none' }}
                />
                {/* Scanning overlay grid */}
                {cameraOn && !faceFound && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `
                      linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)
                    `, backgroundSize: '32px 32px',
                    pointerEvents: 'none',
                    animation: 'scanGrid 4s linear infinite',
                  }} />
                )}
                {/* Face found indicator */}
                {faceFound && (
                  <div style={{
                    position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
                    fontSize: '11px', fontWeight: 700, color: '#34D399',
                    textShadow: '0 0 8px rgba(52,211,153,0.8)',
                    animation: 'pulse 1s ease-in-out infinite',
                  }}>
                    ● FACE DETECTED
                  </div>
                )}
                {scanning && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(59,130,246,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 8px' }} />
                      <div style={{ color: '#93C5FD', fontSize: '12px', fontWeight: 600 }}>Analyzing…</div>
                    </div>
                  </div>
                )}
                {!cameraOn && !scanning && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '32px' }}>📷</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Camera loading…</div>
                  </div>
                )}
              </div>

              {/* Status message */}
              {statusMsg && (
                <div style={{
                  margin: '10px 0', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                  background: statusBg[statusType], border: `1px solid ${statusBorder[statusType]}`,
                  color: statusColor[statusType], fontWeight: 500,
                }}>
                  {statusMsg}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button type="button" onClick={onCancel}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                  Cancel
                </button>
                <button type="button" onClick={handleCapture} disabled={!faceFound || scanning}
                  style={{
                    flex: 2, padding: '10px', borderRadius: '10px', border: 'none', cursor: faceFound && !scanning ? 'pointer' : 'not-allowed',
                    background: faceFound && !scanning ? 'linear-gradient(135deg,#059669,#047857)' : 'rgba(255,255,255,0.06)',
                    color: faceFound && !scanning ? '#fff' : 'rgba(255,255,255,0.3)',
                    fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
                    boxShadow: faceFound && !scanning ? '0 4px 12px rgba(5,150,105,0.4)' : 'none',
                  }}>
                  {scanning ? '⟳ Processing…' : faceFound ? '📸 Capture & Verify' : '○ Position Face in Frame'}
                </button>
              </div>
            </div>
          )}

          {/* Upload panel */}
          {tab === 'upload' && (
            <div>
              <label style={{
                display: 'block', border: '2px dashed rgba(96,165,250,0.3)', borderRadius: '12px',
                padding: '24px', textAlign: 'center', cursor: 'pointer', background: 'rgba(59,130,246,0.04)',
                transition: 'all 0.2s', marginBottom: '12px',
              }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                {uploadPreview ? (
                  <img src={uploadPreview} alt="Preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: '10px', border: '2px solid rgba(96,165,250,0.4)' }} />
                ) : (
                  <>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🖼️</div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Click to upload face photo</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>JPEG, PNG · Max 5MB · Clear face required</div>
                  </>
                )}
              </label>

              {uploadProcessing && (
                <div style={{ textAlign: 'center', padding: '12px', color: '#60A5FA', fontSize: '13px' }}>
                  <div style={{ width: 24, height: 24, border: '2.5px solid rgba(255,255,255,0.1)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 8px' }} />
                  Detecting face in photo…
                </div>
              )}

              {statusMsg && (
                <div style={{
                  margin: '8px 0', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                  background: statusBg[statusType], border: `1px solid ${statusBorder[statusType]}`,
                  color: statusColor[statusType], fontWeight: 500,
                }}>
                  {statusMsg}
                </div>
              )}

              <button type="button" onClick={onCancel}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '13px', marginTop: '4px' }}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanGrid { to { background-position: 32px 32px; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
