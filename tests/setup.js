import { vi } from 'vitest';

// Mock canvas and 2D context globally
const mockCanvas = {
  width: 800,
  height: 600,
  getContext: vi.fn(() => ({
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    })),
    createPattern: vi.fn(),
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    lineDashOffset: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000000',
    fillStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowBlur: 0,
    shadowColor: '#000000',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
    imageSmoothingEnabled: true
  })),
  toDataURL: vi.fn(() => 'data:image/png;base64,'),
  style: {}
};

Object.defineProperty(window, 'HTMLCanvasElement', {
  value: class HTMLCanvasElement {
    constructor() {
      Object.assign(this, mockCanvas);
    }
    getContext() { return mockCanvas.getContext(); }
  }
});

document.createElement = vi.fn((tag) => {
  if (tag === 'canvas') return new window.HTMLCanvasElement();
  const el = {
    tagName: tag.toUpperCase(),
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(), toggle: vi.fn() },
    style: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => []),
    getAttribute: vi.fn(),
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    children: [],
    parentNode: null,
    closest: vi.fn()
  };
  return el;
});

document.getElementById = vi.fn((id) => {
  const base = document.createElement('div');
  base.id = id;
  return base;
});

document.querySelectorAll = vi.fn(() => []);
document.querySelector = vi.fn(() => document.createElement('div'));
document.body = document.createElement('body');
document.head = document.createElement('head');
document.documentElement = document.createElement('html');

window.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
window.cancelAnimationFrame = vi.fn();
window.performance = { now: vi.fn(() => Date.now()) };
window.localStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

window.Image = class Image {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.src = '';
    this.width = 50;
    this.height = 50;
    setTimeout(() => this.onload?.(), 0);
  }
};

window.Audio = class Audio {
  constructor() {
    this.play = vi.fn(() => Promise.resolve());
    this.pause = vi.fn();
    this.currentTime = 0;
    this.volume = 1;
    this.loop = false;
  }
};

window.AudioContext = class AudioContext {
  constructor() {
    this.state = 'running';
    this.createOscillator = vi.fn(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { value: 440 },
      type: 'sine'
    }));
    this.createGain = vi.fn(() => ({
      connect: vi.fn(),
      gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    }));
    this.createBuffer = vi.fn();
    this.decodeAudioData = vi.fn(() => Promise.resolve({}));
    this.resume = vi.fn(() => Promise.resolve());
    this.suspend = vi.fn(() => Promise.resolve());
  }
};

window.navigator = {
  ...window.navigator,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  maxTouchPoints: 0
};

window.matchMedia = vi.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
}));

global.TAU = Math.PI * 2;