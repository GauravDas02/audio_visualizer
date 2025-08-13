'use client'; 

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

// Types and Interfaces
interface AudioData {
  bassLevel: number;
  midLevel: number;
  trebleLevel: number;
  totalLevel: number;
}

interface ParticleControls {
  density: number;
  size: number;
  colorIntensity: number;
}

type VisualizationMode = 'waveform' | 'spectrum';
type ParticleShape = 'nebula' | 'sphere' | 'princess'; 

// Inline Styles for Glassmorphism
const styles = {
  glassPanel: {
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(34, 211, 238, 0.2)',
    boxShadow: '0 8px 32px 0 rgba(6, 182, 212, 0.15)',
  },
  glassButton: {
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(34, 211, 238, 0.3)',
    transition: 'all 0.3s ease',
  },
  glassSlider: {
    backdropFilter: 'blur(8px)',
    borderRadius: '50px',
  },
  permissionModal: {
    backdropFilter: 'blur(25px)',
    animation: 'slideDown 0.5s ease-out', 
  },
  particleCanvas: {
    background: 'radial-gradient(ellipse at center, rgba(20, 184, 166, 0.1) 0%, rgba(22, 78, 99, 0.8) 100%)',
  },
  controlLabel: {
    color: 'rgba(240, 253, 250, 0.9)',
    textShadow: '0 2px 4px rgba(6, 182, 212, 0.3)',
  }
};

// Custom Slider Component
const CustomSlider = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) => {
  return (
    <div className="mb-4">
      <label className="block text-cyan-200 text-sm font-bold mb-2">
        {label}: {value.toFixed(1)}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, rgba(64, 82, 214, 0.8) 0%, rgba(64, 82, 214, 0.8) ${((value - min) / (max - min)) * 100}%, rgba(0, 92, 92, 0.3) ${((value - min) / (max - min)) * 100}%, rgba(0, 92, 92, 0.3) 100%)`,
          ...styles.glassSlider
        }}
      />
    </div>
  );
};

// Custom Toggle Component
const CustomToggle = ({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <label className="text-sm font-medium" style={styles.controlLabel}>
        {label}
      </label>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-cyan-400/50' : 'bg-gray-400/20'
        }`}
        style={styles.glassButton}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

// Main Component
export default function AudioVisualizerComplete() {
  // Canvas and Three.js refs for DOM elements and Three.js objects
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const connectionLinesRef = useRef<THREE.LineSegments | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const currentShapeRef = useRef<ParticleShape>('sphere'); 

  // Audio refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null); 
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null); 

  // Component state
  const [showPermissionModal, setShowPermissionModal] = useState(true);
  const [isUsingMicrophone, setIsUsingMicrophone] = useState(false);
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('spectrum');
  const [showControls, setShowControls] = useState(false);
  const [audioActive, setAudioActive] = useState(false); 
  const [audioData, setAudioData] = useState<AudioData>({
    bassLevel: 0,
    midLevel: 0,
    trebleLevel: 0,
    totalLevel: 0
  });

  const [micPopupVisible, setMicPopupVisible] = useState(false); 
  const [micPopupMounted, setMicPopupMounted] = useState(false);  

  const [fps, setFps] = useState(60);
  const [controls, setControls] = useState<ParticleControls>({
    density: 200,
    size: 2.0,
    colorIntensity: 65
  });

  // Mouse interaction state for rotating the visualization
  const mouseRef = useRef({ x: 0, y: 0, isDown: false });
  const rotationRef = useRef({ x: 0, y: 0 });

  // Performance tracking for FPS calculation
  const performanceRef = useRef({
    lastTime: 0,
    frameCount: 0
  });

  // Initialize Three.js scene, camera, and renderer.
  const initThreeJS = useCallback(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true, 
      antialias: true 
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); 
    camera.position.z = 50; 

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Initial particle system creation based on default visualization mode
    createParticleSystem(visualizationMode === 'waveform' ? 'nebula' : 'sphere');
  }, []); 

  const createParticleSystem = useCallback((shape: ParticleShape) => {
    if (!sceneRef.current) return;

    if (particleSystemRef.current) {
      sceneRef.current.remove(particleSystemRef.current);
      particleSystemRef.current.geometry.dispose();
      (particleSystemRef.current.material as THREE.Material).dispose(); 
    }
    if (connectionLinesRef.current) {
      sceneRef.current.remove(connectionLinesRef.current);
      connectionLinesRef.current.geometry.dispose();
      (connectionLinesRef.current.material as THREE.Material).dispose();
    }


    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(controls.density * 3);
    const colors = new Float32Array(controls.density * 3);

    // Initialize particles based on the selected shape
    for (let i = 0; i < controls.density; i++) {
      const i3 = i * 3;

      if (shape === 'sphere') {
        // Distribute particles in a sphere
        const phi = Math.acos(-1 + (2 * (i / controls.density)));
        const theta = Math.sqrt(controls.density * Math.PI) * phi;
        const radius = 15;

        positions[i3] = radius * Math.cos(theta) * Math.sin(phi);
        positions[i3 + 1] = radius * Math.cos(phi);
        positions[i3 + 2] = radius * Math.sin(theta) * Math.sin(phi);
      } else if (shape === 'nebula' || shape === 'princess') { 
        const angle = (i / controls.density) * Math.PI * 2;
        const height = ((i % 50) / 50) * 30 - 15; 
        const radius = 12 + Math.random() * 8; 

        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = height;
        positions[i3 + 2] = Math.sin(angle) * radius;
      }

      // Initial color assignment
      const hue = 190 + (i / controls.density) * 20; 
      const lightness = controls.colorIntensity;
      const color = new THREE.Color(`hsl(${hue}, 100%, ${lightness}%)`);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: controls.size,
      vertexColors: true, 
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true 
    });

    const particleSystem = new THREE.Points(geometry, material);
    sceneRef.current.add(particleSystem);
    particleSystemRef.current = particleSystem;

  }, [controls.density, controls.size, controls.colorIntensity]);

  // Setup Web Audio API context and analyser.
  const setupAudioContext = useCallback(() => {
    try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
    } catch (error) {
      console.error('Audio context setup failed:', error);
    }
  }, []);

  // Request and enable microphone access.
  const enableMicrophone = useCallback(async () => {
    if (!audioContextRef.current || !analyserRef.current) return;

    try {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const microphone = audioContextRef.current.createMediaStreamSource(stream);
      microphone.connect(analyserRef.current);
      
      microphoneRef.current = microphone;
      setIsUsingMicrophone(true);
      setShowPermissionModal(false);
      setIsPlayingSample(false);
      setAudioActive(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
      setMicPopupMounted(true);
      setMicPopupVisible(true);
      setTimeout(() => {
        setMicPopupVisible(false);
        setTimeout(() => {
          setMicPopupMounted(false); 
        }, 1000); 
      }, 5000);

    }
  }, []);

  // Use the embedded sample audio.
  const useSampleAudio = useCallback(() => {
    if (!audioRef.current || !analyserRef.current || !audioContextRef.current) return;

    try {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      // Disconnect oscillator if active
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
        oscillatorRef.current = null;
      }

      if (!audioSourceRef.current) {
        try {
          audioSourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
          audioSourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
        } catch (e) {
          console.warn("Audio source already connected.");
        }
      }

      audioRef.current.play();                

      setShowPermissionModal(false);
      setIsPlayingSample(true);
      setIsUsingMicrophone(false);
      setAudioActive(true);
    } catch (error) {
      console.error('Failed to play embedded sample audio:', error);
    }
  }, []);

  // Stop all audio sources and reset to permission modal.
  const handleReplay = useCallback(() => {
    // Stop sample audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  
    // Stop oscillator
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
  
    // Stop microphone
    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  
    // Reset state to show permission modal again
    setIsPlayingSample(false);
    setIsUsingMicrophone(false);
    setShowPermissionModal(true);
    setAudioActive(false);
  }, []);

  // Stop just the sample audio.
  const stopSampleAudio = useCallback(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
  
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  
    setIsPlayingSample(false);
    setAudioActive(false);
  }, []);

  // Update particle positions and colors based on audio data.
  const updateParticles = useCallback((rawAudioData: Uint8Array) => {
    if (!particleSystemRef.current || !analyserRef.current) return;

    const positions = particleSystemRef.current.geometry.attributes.position.array as Float32Array;
    const colors = particleSystemRef.current.geometry.attributes.color.array as Float32Array;

    const frequencyData = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(frequencyData);

    const bassRange = Array.from(frequencyData.slice(0, 8));
    const midRange = Array.from(frequencyData.slice(8, 32));
    const trebleRange = Array.from(frequencyData.slice(32, 64));

    // Normalize frequency levels to 0-1
    const bassLevel = bassRange.reduce((a, b) => a + b) / bassRange.length / 255;
    const midLevel = midRange.reduce((a, b) => a + b) / midRange.length / 255;
    const trebleLevel = trebleRange.reduce((a, b) => a + b) / trebleRange.length / 255;
    const totalLevel = (bassLevel + midLevel + trebleLevel) / 3;

    setAudioData({ bassLevel, midLevel, trebleLevel, totalLevel });

    const targetShape = currentShapeRef.current;

    for (let i = 0; i < controls.density; i++) {
      const i3 = i * 3;

      if (targetShape === 'sphere') {
        const phi = Math.acos(-1 + (2 * (i / controls.density)));
        const theta = Math.sqrt(controls.density * Math.PI) * phi;
        const radius = 15 + bassLevel * 10;

        positions[i3] = radius * Math.cos(theta) * Math.sin(phi);
        positions[i3 + 1] = radius * Math.cos(phi);
        positions[i3 + 2] = radius * Math.sin(theta) * Math.sin(phi);
      } else if (targetShape === 'nebula' || targetShape === 'princess') {
        const angle = (i / controls.density) * Math.PI * 2;

        const baseHeight = ((i % 50) / 50) * 30 - 15;
        let height = baseHeight;
        let radius = 12 + midLevel * 8;

        if (visualizationMode === 'waveform') {
            const audioIndex = Math.floor((i / controls.density) * rawAudioData.length);
            height = baseHeight + (rawAudioData[audioIndex] - 128) * 0.1; 
        } else {
            height = baseHeight;
        }

        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = height;
        positions[i3 + 2] = Math.sin(angle) * radius;
      }
      const intensity = totalLevel;

      const hue = 190 + (i / controls.density) * 20;
      const baseLightness = Math.max(controls.colorIntensity, 50);
      const shimmer = intensity * (100 - baseLightness) * 1.5;
      const lightness = Math.min(baseLightness + shimmer, 90);
      const color = new THREE.Color(`hsl(${hue}, 100%, ${lightness}%)`);

      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    particleSystemRef.current.geometry.attributes.position.needsUpdate = true;
    particleSystemRef.current.geometry.attributes.color.needsUpdate = true;
  }, [controls.density, controls.colorIntensity, currentShapeRef, visualizationMode]);

  const animate = useCallback((currentTime: number) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    performanceRef.current.frameCount++;
    if (currentTime - performanceRef.current.lastTime >= 1000) {
      const newFps = Math.round(
        (performanceRef.current.frameCount * 1000) /
        (currentTime - performanceRef.current.lastTime)
      );
      setFps(newFps);
      performanceRef.current.frameCount = 0;
      performanceRef.current.lastTime = currentTime;
    }

    if (analyserRef.current && dataArrayRef.current && audioActive) { 
      if (visualizationMode === 'spectrum') {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      } else {
        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
      }
      updateParticles(dataArrayRef.current);
    } else {
      if (audioData.totalLevel > 0) { 
        setAudioData({ bassLevel: 0, midLevel: 0, trebleLevel: 0, totalLevel: 0 });
      }
      updateParticles(new Uint8Array(128).fill(128)); 
    }

    // Auto-rotation when not being manually rotated
    if (!mouseRef.current.isDown) {
      rotationRef.current.y += 0.005;
      if (particleSystemRef.current) {
        particleSystemRef.current.rotation.y = rotationRef.current.y;
        particleSystemRef.current.rotation.x = rotationRef.current.x;
      }
      if (connectionLinesRef.current) {
        connectionLinesRef.current.rotation.y = rotationRef.current.y;
        connectionLinesRef.current.rotation.x = rotationRef.current.x;
      }
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [visualizationMode, updateParticles, audioActive, audioData.totalLevel]);

  // Mouse event handlers for user interaction (rotation, zoom)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseRef.current.isDown = true;
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (mouseRef.current.isDown && particleSystemRef.current) {
      const deltaX = e.clientX - mouseRef.current.x;
      const deltaY = e.clientY - mouseRef.current.y;

      rotationRef.current.y += deltaX * 0.01;
      rotationRef.current.x += deltaY * 0.01;

      particleSystemRef.current.rotation.y = rotationRef.current.y;
      particleSystemRef.current.rotation.x = rotationRef.current.x;

      if (connectionLinesRef.current) {
        connectionLinesRef.current.rotation.y = rotationRef.current.y;
        connectionLinesRef.current.rotation.x = rotationRef.current.x;
      }
    }
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  }, []);

  const handleMouseUp = useCallback(() => {
    mouseRef.current.isDown = false;
  }, []);

  // Handle mouse wheel for zooming
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (cameraRef.current) {
      cameraRef.current.position.z += e.deltaY * 0.1;
      cameraRef.current.position.z = Math.max(10, Math.min(100, cameraRef.current.position.z));
      cameraRef.current.updateProjectionMatrix();
    }
  }, []);

  // Generic control update function
  const updateControl = useCallback((key: keyof ParticleControls, value: number) => {
    setControls(prev => ({ ...prev, [key]: value }));
  }, []);

  // Reset camera position and rotation.
  const resetCamera = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 50);
      rotationRef.current = { x: 0, y: 0 };
      if (particleSystemRef.current) {
        particleSystemRef.current.rotation.set(0, 0, 0);
      }
      if (connectionLinesRef.current) {
        connectionLinesRef.current.rotation.set(0, 0, 0);
      }
      cameraRef.current.updateProjectionMatrix();
    }
  }, []);

  // Handle window resizing to keep visualization responsive.
  const handleResize = useCallback(() => {
    if (cameraRef.current && rendererRef.current) {
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    }
  }, []);

  // Effects
  useEffect(() => {
    initThreeJS();
    setupAudioContext();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if ('dispose' in object && typeof object.dispose === 'function') {
            object.dispose();
          }
        });
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.error("Error closing audio context:", e));
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [initThreeJS, setupAudioContext, handleResize]);


  // Effect to re-create particle system when visualization mode changes
  useEffect(() => {
    const shape = visualizationMode === 'spectrum' ? 'sphere' : 'nebula';
    currentShapeRef.current = shape; // Update ref for use in updateParticles
    createParticleSystem(shape);
  }, [visualizationMode, createParticleSystem]);


  // Effect to update particle size when controls.size changes
  useEffect(() => {
    if (particleSystemRef.current) {
      (particleSystemRef.current.material as THREE.PointsMaterial).size = controls.size;
      (particleSystemRef.current.material as THREE.PointsMaterial).needsUpdate = true;
    }
  }, [controls.size]);


  // Effect to start and stop the animation loop
  useEffect(() => {
    if (animationIdRef.current === null) {
        animationIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null; 
      }
    };
  }, [animate]);


  return (
    <div
      className="min-h-screen overflow-hidden relative bg-cyan-950/40 backdrop-blur-xl border-t border-white/10"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(20, 184, 166, 0.1) 0%, rgba(22, 78, 99, 0.8) 100%)',
      }}
    >
      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50">
          <div
            className="rounded-2xl px-8 py-6 text-center shadow-2xl border border-cyan-400/30"
            style={styles.permissionModal}
          >
            <div className="flex items-center space-x-3 justify-center mb-4">
              <h3 className="text-xl font-semibold text-white">Choose Your Preferred Mode!</h3>
            </div>
            <p className="text-cyan-100 mb-6">
              Please use your own microphone to visualize your audio input, or use our sample audio instead.
            </p>
            <div className="flex space-x-4 justify-center">
              <button
                onClick={enableMicrophone}
                className="px-6 py-3 rounded-xl text-white font-medium hover:transform hover:-translate-y-1"
                style={styles.glassButton}
              >
                Use Microphone
              </button>
              <button
                onClick={useSampleAudio}
                className="px-6 py-3 rounded-xl text-white font-medium hover:transform hover:-translate-y-1"
                style={styles.glassButton}
              >
                Use Sample Audio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone Denied Popup */}
      {micPopupMounted && (
          <div className={`fixed top-1/2 left-1/2 z-50 transform -translate-x-1/2 -translate-y-1/2
          px-6 py-4 rounded-xl shadow-xl transition-opacity duration-1000
          ${micPopupVisible ? 'opacity-100' : 'opacity-0'} bg-blue-900/30 backdrop-blur-md border border-white/20 text-white`}>
            🎤 Microphone access denied. Please allow access to use this feature.
          </div>
      )}

      {/* Main Visualization Area */}
       <div className="relative w-full h-screen bg-gradient-to-br from-cyan-900/40 to-slate-800/20 backdrop-blur-2xl border-t border-white/10">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={styles.particleCanvas}
        />

        {/* Audio element for sample audio. */}
        <audio
          ref={audioRef}
          src="data:audio/mpeg;base64,SUQzAwAAAAAAIlRTU0UAAAAOAAAATGF2ZjYxL"
          preload="auto"
        />

        {/* Top Controls */}
        <div className="absolute top-6 left-6 z-10">
          <div className="flex space-x-4">
            {!showPermissionModal && !isUsingMicrophone && (
              <button
                  onClick={() => {
                      if (audioRef.current && audioRef.current.ended) {
                          useSampleAudio();
                      } else {
                          if (isPlayingSample) {
                              stopSampleAudio();
                          } else {
                              useSampleAudio();
                          }
                      }
                  }}
                  className="px-6 py-3 rounded-xl text-white font-medium hover:transform hover:-translate-y-1"
                  style={styles.glassButton}
              >
                  {isPlayingSample ? 'Play/Pause' : 'Play/Pause'}
              </button>
            )}

            {/* Visualization Mode Toggle */}
            <button
              onClick={() => setVisualizationMode(prev => prev === 'spectrum' ? 'waveform' : 'spectrum')}
              className="px-4 py-3 rounded-xl text-white hover:transform hover:-translate-y-1"
              style={styles.glassButton}
            >
              {visualizationMode === 'spectrum' ? 'Spectrum' : 'Waveform'}
            </button>

            <button
              onClick={handleReplay}
              className="p-2 rounded-full text-cyan-200 hover:text-white transition"
            >
              Stop
            </button>

            {/* Toggle Controls */}
            <button
              onClick={() => setShowControls(!showControls)}
              className="p-3 rounded-xl text-white hover:transform hover:-translate-y-1"
              style={styles.glassButton}
              title="Toggle Controls"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Top Right Info Panel */}
        <div className="absolute top-6 right-6 z-10">
          <div className="rounded-xl px-4 py-3" style={styles.glassPanel}>
            <div className="text-right space-y-1">
              <div className="text-cyan-100 text-sm">FPS: {fps}</div>
              <div className="text-cyan-100 text-sm">Particles: {controls.density}</div>
              {audioActive && audioData.totalLevel > 0 && (
                <div className="space-y-1">
                  <div className="text-cyan-100 text-xs">Bass: {Math.round(audioData.bassLevel * 100)}%</div>
                  <div className="text-cyan-100 text-xs">Mid: {Math.round(audioData.midLevel * 100)}%</div>
                  <div className="text-cyan-100 text-xs">Treble: {Math.round(audioData.trebleLevel * 100)}%</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Panel (hidden by default, toggled by button) */}
        {showControls && (
          <div className="absolute bottom-6 left-6 z-10">
            <div className="rounded-xl p-6 w-80" style={styles.glassPanel}>
              <h3 className="text-lg font-semibold mb-4 text-white">Particle Controls</h3>

              <CustomSlider
                label="Density"
                value={controls.density}
                onChange={(value) => updateControl('density', value)}
                min={50}
                max={300}
                step={10}
              />

              <CustomSlider
                label="Size"
                value={controls.size}
                onChange={(value) => updateControl('size', value)}
                min={0.5}
                max={4}
                step={0.1}
              />

              <CustomSlider
                label="Color Gradient"
                value={controls.colorIntensity}
                onChange={(value) => updateControl('colorIntensity', value)}
                min={10}
                max={100}
                step={5}
              />
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="absolute bottom-6 right-6 z-10">
          <div className="rounded-xl px-4 py-3 text-right" style={styles.glassPanel}>
            <div className="text-cyan-100 text-sm space-y-1">
              <div>🖱️ Drag to rotate</div>
              <div>🔄 Scroll to zoom</div>
              <div>🎵 Speak or play music</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}