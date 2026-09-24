// Offline engine for development, UI demos and load tests (no API key needed).
// It "hears" speech via audio energy and emits scripted, parallel sentences word by word.
import { EventEmitter } from 'node:events';
import { rms } from '../audio.js';

const CORPUS = [
  {
    en: 'Welcome to Nerdearla, today we are going to talk about observability in Kubernetes.',
    es: 'Bienvenidos a Nerdearla, hoy vamos a hablar de observabilidad en Kubernetes.',
    pt: 'Bem-vindos ao Nerdearla, hoje vamos falar sobre observabilidade no Kubernetes.',
  },
  {
    en: 'The first thing you need is good metrics, logs and traces with OpenTelemetry.',
    es: 'Lo primero que necesitás son buenas métricas, logs y trazas con OpenTelemetry.',
    pt: 'A primeira coisa que você precisa são boas métricas, logs e traces com OpenTelemetry.',
  },
  {
    en: 'When the pager goes off at three in the morning, context is everything.',
    es: 'Cuando suena el pager a las tres de la mañana, el contexto lo es todo.',
    pt: 'Quando o pager toca às três da manhã, o contexto é tudo.',
  },
  {
    en: 'So we built a small pipeline that sends every pull request through a preview environment.',
    es: 'Entonces armamos un pipeline chico que manda cada pull request a un entorno de preview.',
    pt: 'Então construímos um pequeno pipeline que envia cada pull request para um ambiente de preview.',
  },
  {
    en: 'Open source communities make conferences like this one possible.',
    es: 'Las comunidades open source hacen posibles conferencias como esta.',
    pt: 'As comunidades open source tornam possíveis conferências como esta.',
  },
  {
    en: 'Any questions? Remember you can follow these captions from your phone by scanning the QR code.',
    es: '¿Preguntas? Recuerden que pueden seguir estos subtítulos desde el celular escaneando el código QR.',
    pt: 'Perguntas? Lembrem que podem acompanhar estas legendas pelo celular escaneando o QR code.',
  },
];

export class MockEngine extends EventEmitter {
  constructor({ label, target, source = 'en' }) {
    super();
    this.label = label;
    this.target = target;
    this.source = source === 'auto' ? 'en' : source;
    this.state = 'idle';
    this.stats = { reconnects: 0, resumes: 0, errors: 0, lastError: '', connectedAt: 0, audioMs: 0, lastInputAt: 0, lastOutputAt: 0, tokens: 0 };
    this.sentence = Math.floor(Math.random() * CORPUS.length);
    this.word = 0;
    this.speechMs = 0;
    this.queue = [];
  }

  start() {
    this.state = 'connecting';
    this.emit('state', this.state);
    setTimeout(() => { this.state = 'live'; this.stats.connectedAt = Date.now(); this.emit('state', 'live'); }, 400);
  }

  stop() {
    this.state = 'idle';
    this.emit('state', 'idle');
    for (const t of this.queue) clearTimeout(t);
    this.queue = [];
  }

  restart() { this.stop(); this.start(); }
  endAudio() {}

  sendAudio(chunk) {
    if (this.state !== 'live') return;
    this.stats.audioMs += 100;
    if (rms(chunk) < 0.008) return;
    this.speechMs += 100;
    if (this.speechMs < 380) return; // ~2.6 words/s
    this.speechMs = 0;
    const s = CORPUS[this.sentence];
    const src = (s[this.source] || s.en).split(' ');
    const tgt = (s[this.target] || s.en).split(' ');
    const i = this.word++;
    const done = this.word >= src.length;
    if (i < src.length) {
      this.stats.lastInputAt = Date.now();
      this.emit('input', { text: (i ? ' ' : '') + src[i], finished: done, lang: this.source });
    }
    // Translation follows ~1.2 s behind, proportionally mapped onto target words.
    const from = Math.floor((i / src.length) * tgt.length);
    const to = done ? tgt.length : Math.floor(((i + 1) / src.length) * tgt.length);
    if (to > from) {
      const text = (from ? ' ' : '') + tgt.slice(from, to).join(' ');
      this.queue.push(setTimeout(() => {
        this.stats.lastOutputAt = Date.now();
        this.emit('output', { text, finished: done, lang: this.target });
      }, 1200));
      if (this.queue.length > 50) this.queue.shift();
    }
    if (done) { this.word = 0; this.sentence = (this.sentence + 1) % CORPUS.length; }
  }

  status() {
    return { target: this.target, echo: false, state: this.state, level: 'mock', ...this.stats };
  }
}
