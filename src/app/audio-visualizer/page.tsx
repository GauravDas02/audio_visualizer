'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Mic, MicOff, Play, Pause, RotateCcw, Settings, Volume2 } from 'lucide-react';

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
  connectionsEnabled: boolean;
}

type VisualizationMode = 'waveform' | 'spectrum';
type ParticleShape = 'nebula' | 'sphere' | 'cylinder' | 'princess';

// Inline Styles for Glassmorphism
const styles = {
  glassPanel: {
    // background: 'rgba(6, 182, 212, 0.1)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(34, 211, 238, 0.2)',
    boxShadow: '0 8px 32px 0 rgba(6, 182, 212, 0.15)',
  },
  glassButton: {
    // background: 'rgba(34, 211, 238, 0.15)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(34, 211, 238, 0.3)',
    transition: 'all 0.3s ease',
  },
  glassSlider: {
    // background: 'rgba(6, 182, 212, 0.2)',
    backdropFilter: 'blur(8px)',
    borderRadius: '50px',
  },
  permissionModal: {
    // background: 'rgba(20, 184, 166, 0.95)',
    backdropFilter: 'blur(25px)',
    animation: 'slideDown 0.5s ease-out',
  },
  particleCanvas: {
    // background: 'radial-gradient(ellipse at center, rgba(20, 184, 166, 0.1) 0%, rgba(22, 78, 99, 0.8) 100%)',
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
      <label className="block text-sm font-medium mb-2" style={styles.controlLabel}>
        {label}: {value}
      </label>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, rgba(34, 211, 238, 0.8) 0%, rgba(34, 211, 238, 0.8) ${((value - min) / (max - min)) * 100}%, rgba(6, 182, 212, 0.2) ${((value - min) / (max - min)) * 100}%, rgba(6, 182, 212, 0.2) 100%)`,
            ...styles.glassSlider
          }}
        />
      </div>
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
  // Canvas and Three.js refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const connectionLinesRef = useRef<THREE.LineSegments | null>(null);
  const animationIdRef = useRef<number | null>(null);


  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);


  // State
  const [showPermissionModal, setShowPermissionModal] = useState(true);
  const [isUsingMicrophone, setIsUsingMicrophone] = useState(false);
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('spectrum');
  const [showControls, setShowControls] = useState(false);
  const [audioData, setAudioData] = useState<AudioData>({
    bassLevel: 0,
    midLevel: 0,
    trebleLevel: 0,
    totalLevel: 0
  });
  const [fps, setFps] = useState(60);
  const [controls, setControls] = useState<ParticleControls>({
    density: 800,
    size: 2.0,
    colorIntensity: 70,
    connectionsEnabled: true
  });

  // Mouse interaction state
  const mouseRef = useRef({ x: 0, y: 0, isDown: false });
  const rotationRef = useRef({ x: 0, y: 0 });

  // Performance tracking
  const performanceRef = useRef({
    lastTime: 0,
    frameCount: 0
  });

  // Initialize Three.js scene
  const initThreeJS = useCallback(() => {
    if (!canvasRef.current) return;

    // Scene setup
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

    createParticleSystem();
  }, []);

  // Create particle system
  const createParticleSystem = useCallback(() => {
    if (!sceneRef.current) return;

    // Remove existing particle system
    if (particleSystemRef.current) {
      sceneRef.current.remove(particleSystemRef.current);
    }
    if (connectionLinesRef.current) {
      sceneRef.current.remove(connectionLinesRef.current);
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(controls.density * 3);
    const colors = new Float32Array(controls.density * 3);

    // Initialize particles in nebula formation
    for (let i = 0; i < controls.density; i++) {
      const i3 = i * 3;
      const radius = Math.random() * 30 + 5;
      const angle = Math.random() * Math.PI * 4;
      const height = (Math.random() - 0.5) * 20;

      positions[i3] = Math.cos(angle) * radius;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * radius;

      // Ocean tide colors
      const colorVariant = Math.random();
      colors[i3] = colorVariant * (controls.colorIntensity / 100);
      colors[i3 + 1] = 0.7 + colorVariant * 0.3;
      colors[i3 + 2] = 0.9 + colorVariant * 0.1;
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

    // Create connection lines if enabled
    if (controls.connectionsEnabled) {
      createConnectionLines();
    }
  }, [controls.density, controls.size, controls.colorIntensity, controls.connectionsEnabled]);

  // Create connection lines between particles
  const createConnectionLines = useCallback(() => {
    if (!sceneRef.current || !particleSystemRef.current) return;

    const positions = particleSystemRef.current.geometry.attributes.position.array as Float32Array;
    const linePositions: number[] = [];
    const lineColors: number[] = [];

    // Connect nearby particles
    for (let i = 0; i < controls.density; i += 10) {
      for (let j = i + 10; j < Math.min(i + 50, controls.density); j += 10) {
        const i3 = i * 3;
        const j3 = j * 3;

        const dx = positions[i3] - positions[j3];
        const dy = positions[i3 + 1] - positions[j3 + 1];
        const dz = positions[i3 + 2] - positions[j3 + 2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < 15) {
          linePositions.push(positions[i3], positions[i3 + 1], positions[i3 + 2]);
          linePositions.push(positions[j3], positions[j3 + 1], positions[j3 + 2]);

          // Ocean blue color with transparency
          lineColors.push(0.2, 0.8, 1, 0.2, 0.8, 1);
        }
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3
    });

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    sceneRef.current.add(lines);
    connectionLinesRef.current = lines;
  }, [controls.density, controls.connectionsEnabled]);

  // Setup audio context
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

  // Enable microphone
  const enableMicrophone = useCallback(async () => {
    if (!audioContextRef.current || !analyserRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const microphone = audioContextRef.current.createMediaStreamSource(stream);
      microphone.connect(analyserRef.current);
      
      microphoneRef.current = microphone;
      setIsUsingMicrophone(true);
      setShowPermissionModal(false);
      setIsPlayingSample(false);
    } catch (error) {
      console.error('Microphone access denied:', error);
      showPermissionMessage();
    }
  }, []);

  // Use sample audio
  const useSampleAudio = useCallback(() => {
    if (!audioContextRef.current || !analyserRef.current) return;

    // Stop any existing sample audio
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
    }

    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(analyserRef.current);

    oscillator.frequency.setValueAtTime(440, audioContextRef.current.currentTime);
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);

    oscillator.start();
    oscillatorRef.current = oscillator;
    gainNodeRef.current = gainNode;

    // Add frequency variation for more interesting visualization
    const varyFrequency = () => {
      if (oscillatorRef.current && audioContextRef.current) {
        const freq = 200 + Math.random() * 800;
        oscillatorRef.current.frequency.setValueAtTime(freq, audioContextRef.current.currentTime);
      }
    };

    const intervalId = setInterval(varyFrequency, 2000);
    
    setShowPermissionModal(false);
    setIsPlayingSample(true);
    setIsUsingMicrophone(false);

    // Clean up on component unmount
    return () => {
      clearInterval(intervalId);
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
      }
    };
  }, []);

  // Stop sample audio
  const stopSampleAudio = useCallback(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      // oscillatorRef.current = undefined;
      oscillatorRef.current = null;
    }
    setIsPlayingSample(false);
  }, []);

  // Show permission message
  const showPermissionMessage = useCallback(() => {
    setTimeout(() => {
      setShowPermissionModal(false);
    }, 5000);
  }, []);

  // Update particles based on audio data
  const updateParticles = useCallback((rawAudioData: Uint8Array) => {
    if (!particleSystemRef.current) return;

    const positions = particleSystemRef.current.geometry.attributes.position.array as Float32Array;
    const colors = particleSystemRef.current.geometry.attributes.color.array as Float32Array;

    // Calculate frequency ranges
    const bassRange = Array.from(rawAudioData.slice(0, 8));
    const midRange = Array.from(rawAudioData.slice(8, 32));
    const trebleRange = Array.from(rawAudioData.slice(32, 64));

    const bassLevel = bassRange.reduce((a, b) => a + b) / bassRange.length / 255;
    const midLevel = midRange.reduce((a, b) => a + b) / midRange.length / 255;
    const trebleLevel = trebleRange.reduce((a, b) => a + b) / trebleRange.length / 255;
    const totalLevel = (bassLevel + midLevel + trebleLevel) / 3;

    setAudioData({ bassLevel, midLevel, trebleLevel, totalLevel });

    // Determine current shape based on audio intensity
    let targetShape: ParticleShape = 'nebula';
    if (totalLevel > 0.1) {
      const shapes: ParticleShape[] = ['sphere', 'cylinder', 'princess'];
      targetShape = shapes[Math.floor(totalLevel * 3) % shapes.length];
    }

    // Update particle positions and colors
    for (let i = 0; i < controls.density; i++) {
      const i3 = i * 3;

      if (targetShape === 'nebula') {
        // Nebula/galaxy pattern
        const time = Date.now() * 0.001;
        const radius = 20 + Math.sin(time + i * 0.1) * 5;
        const angle = time * 0.5 + i * 0.1;

        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = Math.sin(time + i * 0.05) * 10;
        positions[i3 + 2] = Math.sin(angle) * radius;

      } else if (targetShape === 'sphere') {
        // Sphere formation
        const phi = Math.acos(-1 + (2 * (i / controls.density)));
        const theta = Math.sqrt(controls.density * Math.PI) * phi;
        const radius = 15 + bassLevel * 10;

        positions[i3] = radius * Math.cos(theta) * Math.sin(phi);
        positions[i3 + 1] = radius * Math.cos(phi);
        positions[i3 + 2] = radius * Math.sin(theta) * Math.sin(phi);

      } else if (targetShape === 'cylinder') {
        // Cylinder formation
        const angle = (i / controls.density) * Math.PI * 2;
        const height = ((i % 50) / 50) * 30 - 15;
        const radius = 12 + midLevel * 8;

        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = height;
        positions[i3 + 2] = Math.sin(angle) * radius;

      } else if (targetShape === 'princess') {
        // Princess cut diamond shape
        const layer = Math.floor(i / (controls.density / 10));
        const angleStep = (layer + 4) * 0.8;
        const angle = (i % angleStep) * (Math.PI * 2 / angleStep);
        const radius = layer < 5 ? (5 - layer) * 3 : (layer - 4) * 2;
        const height = layer < 5 ? layer * 2 : (10 - layer) * 2;

        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = height - 10;
        positions[i3 + 2] = Math.sin(angle) * radius;
      }

      // Update colors based on frequency data
      const audioIndex = Math.floor((i / controls.density) * rawAudioData.length);
      const intensity = rawAudioData[audioIndex] / 255;

      const baseColor = [0.1, 0.7, 0.9]; // Ocean blue base
      colors[i3] = baseColor[0] + intensity * (controls.colorIntensity / 100);
      colors[i3 + 1] = baseColor[1] + intensity * 0.3;
      colors[i3 + 2] = baseColor[2];
    }

    particleSystemRef.current.geometry.attributes.position.needsUpdate = true;
    particleSystemRef.current.geometry.attributes.color.needsUpdate = true;

    // Update connection lines if enabled
    if (controls.connectionsEnabled && connectionLinesRef.current) {
      createConnectionLines();
    }
  }, [controls.density, controls.colorIntensity, controls.connectionsEnabled, createConnectionLines]);

  // Animation loop
  const animate = useCallback((currentTime: number) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    // Calculate FPS
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

    // Get audio data
    if (analyserRef.current && dataArrayRef.current) {
      if (visualizationMode === 'spectrum') {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      } else {
        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
      }
      updateParticles(dataArrayRef.current);
    } else {
      // Default nebula animation when no audio
      updateParticles(new Uint8Array(128).fill(0));
    }

    // Auto-rotation when not interacting
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
  }, [visualizationMode, updateParticles]);

  // Mouse event handlers
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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (cameraRef.current) {
      cameraRef.current.position.z += e.deltaY * 0.1;
      cameraRef.current.position.z = Math.max(10, Math.min(100, cameraRef.current.position.z));
    }
  }, []);

  // Control handlers
  const updateControl = useCallback((key: keyof ParticleControls, value: number | boolean) => {
    setControls(prev => ({ ...prev, [key]: value }));
  }, []);

  // Reset camera position
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
    }
  }, []);

  // Window resize handler
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
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
      }
    };
  }, [initThreeJS, setupAudioContext, handleResize]);

  useEffect(() => {
    createParticleSystem();
  }, [createParticleSystem]);

  useEffect(() => {
    if (particleSystemRef.current) {
      (particleSystemRef.current.material as THREE.PointsMaterial).size = controls.size;
    }
  }, [controls.size]);

  useEffect(() => {
    animationIdRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [animate]);

  return (
    <div 
      className="min-h-screen overflow-hidden relative"
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
              <div className="w-8 h-8 rounded-full bg-cyan-400/20 flex items-center justify-center">
                <Mic className="w-5 h-5 text-cyan-300" />
              </div>
              <h3 className="text-xl font-semibold text-white">Microphone Access Required</h3>
            </div>
            <p className="text-cyan-100 mb-6">
              Please allow microphone access to visualize your audio input, or use our sample audio instead.
            </p>
            <div className="flex space-x-4 justify-center">
              <button
                onClick={enableMicrophone}
                className="px-6 py-3 rounded-xl text-white font-medium hover:transform hover:-translate-y-1"
                style={styles.glassButton}
              >
                Enable Microphone
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

      {/* Main Visualization Area */}
      <div className="relative w-full h-screen">
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

        {/* Top Controls */}
        <div className="absolute top-6 left-6 z-10">
          <div className="flex space-x-4">
            {/* Audio Source Toggle */}
            {!showPermissionModal && (
              <button
                onClick={isUsingMicrophone ? enableMicrophone : (isPlayingSample ? stopSampleAudio : useSampleAudio)}
                className="p-3 rounded-xl text-white hover:transform hover:-translate-y-1"
                style={styles.glassButton}
                title={isUsingMicrophone ? "Using Microphone" : isPlayingSample ? "Stop Sample Audio" : "Start Sample Audio"}
              >
                {isUsingMicrophone ? <Mic className="w-5 h-5" /> : 
                 isPlayingSample ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
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

            {/* Reset Camera */}
            <button
              onClick={resetCamera}
              className="p-3 rounded-xl text-white hover:transform hover:-translate-y-1"
              style={styles.glassButton}
              title="Reset Camera"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* Toggle Controls */}
            <button
              onClick={() => setShowControls(!showControls)}
              className="p-3 rounded-xl text-white hover:transform hover:-translate-y-1"
              style={styles.glassButton}
              title="Toggle Controls"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Right Info */}
        <div className="absolute top-6 right-6 z-10">
          <div className="rounded-xl px-4 py-3" style={styles.glassPanel}>
            <div className="text-right space-y-1">
              <div className="text-cyan-100 text-sm">FPS: {fps}</div>
              <div className="text-cyan-100 text-sm">Particles: {controls.density}</div>
              {audioData.totalLevel > 0 && (
                <div className="space-y-1">
                  <div className="text-cyan-100 text-xs">Bass: {Math.round(audioData.bassLevel * 100)}%</div>
                  <div className="text-cyan-100 text-xs">Mid: {Math.round(audioData.midLevel * 100)}%</div>
                  <div className="text-cyan-100 text-xs">Treble: {Math.round(audioData.trebleLevel * 100)}%</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Panel */}
        {showControls && (
          <div className="absolute bottom-6 left-6 z-10">
            <div className="rounded-xl p-6 w-80" style={styles.glassPanel}>
              <h3 className="text-lg font-semibold mb-4 text-white">Particle Controls</h3>
              
              <CustomSlider
                label="Density"
                value={controls.density}
                onChange={(value) => updateControl('density', value)}
                min={100}
                max={2000}
                step={50}
              />

              <CustomSlider
                label="Size"
                value={controls.size}
                onChange={(value) => updateControl('size', value)}
                min={0.5}
                max={5}
                step={0.1}
              />

              <CustomSlider
                label="Color Intensity"
                value={controls.colorIntensity}
                onChange={(value) => updateControl('colorIntensity', value)}
                min={10}
                max={100}
                step={5}
              />

              <CustomToggle
                label="Particle Connections"
                checked={controls.connectionsEnabled}
                onChange={(value) => updateControl('connectionsEnabled', value)}
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