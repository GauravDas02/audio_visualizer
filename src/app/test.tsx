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
          src="data:audio/mpeg;base64,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oGEBLdIuoqIllvi3KBBItGEt8XNSkRXSiLslzkn0wEoi7KApJdU6TKAJASm4nWkygCQmqzp0JBIOoTlD1LEzkUXRgB+3lcp0YAgd7XJeKA4EgZyYCgN+IFdqAYhA78u1AL6SB+nZgqG4Q/TswVEIXZprtS/Zpq1e9apble9apruF+lrXbF+mq3Ld6mq3Ke/S1rti/S1q6wEn9iJl0BhmIMVDVs0gkyqAxV89CM1dI0BE1Es2wI694IpjxArCmUNgwQHCUXTLF0WElUoEBwUCiUQg+zhFeJtI5K1TTQ3F9BkvNGLcfKGHkdKmO1DEEdR+pBLqlXKVcK9Ck6umMsAdQ3SqJWa44SVGyaBrEtJ8Z6HmKXI3T4Os8TKJ6k0IPI0TuRaMOIAgoIPCQYSQHjQUCJhgoFAiYYJBi4WROLQUSNMTRJGmQkROtBI0pliokGhoiQ4KmS0qt2Vq3zTdtU7YurVptUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVN4qzE5Yx9dMgLhGUmKpBkzuY3PACzMAsTLow09NNMFAc1jSAViZQEqZo7pQGAgAoDl7Ea07/+9JkGo/3Q348g2w2wm1El1Fl5mYAAAGkAAAAIAAANIAAAAQU6kvUtVoNDd2WNOUBQnDgCQAKWi73Ul8SaSocm6nasAyt+IvUiLdmwthFBLJiuK8EMMELkZ6dHJeLydz7LSUPJCIRXOH6MnQ8kIhFc4fprRVLxSTrH4vxmCCGl+tW2w589ZamSpWL9tlqYul1Ivp9mUyUDEHxvk4ssy43P///s0aUUfH8nGigI+N8nCRQEfF49GlFHxednZnbcp2d2/ypOLLMvPRpwGBmXno04DLMuN8lWsARwahe4wVzECLhjgBAWQpDjow+DFAEePEJRLNEyElKI9jtKIzz8T6QPkzD4SaIV4QPVuZ2fKNOEiTLz0acJAzLjsacWWZcb5OLLEZlYqLN/FmYqKNqFhXFRRuLCv/1C7KxUW1C7Nbf//UzWKdSTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg=="
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