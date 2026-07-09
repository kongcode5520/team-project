/* ========================================
   Maze Game — Procedural Sound Engine v1.0
   All sounds synthesized via Web Audio API.
   No external audio files required.

   Usage:
     Sound.play('move')
     Sound.play('potion')
     Sound.play('flame')
     Sound.play('monster')
     Sound.play('victory')
     Sound.play('cold', 0|1|2)   // tier
     Sound.play('generate')
     Sound.toggleMute()
     Sound.isMuted
   ======================================== */

var Sound = (function() {
    'use strict';

    var ctx = null;
    var muted = false;
    var masterGain = null;

    // Lazy-init AudioContext on first user interaction
    function getCtx() {
        if (!ctx) {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            ctx = new AudioCtx();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.65;
            masterGain.connect(ctx.destination);
        }
        // Resume if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        return ctx;
    }

    function isMuted() { return muted; }
    function isActive() { return !muted && getCtx(); }

    // ---- Helper: create a gain envelope ----
    function gainEnvelope(gainNode, startTime, peak, duration, decayRatio) {
        decayRatio = decayRatio || 0.3;
        var now = getCtx().currentTime + startTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(peak, now + duration * 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration * decayRatio);
    }

    // ---- Helper: play a simple tone ----
    function playTone(freq, type, duration, volume, startDelay, detune) {
        var c = getCtx();
        if (!c) return;
        startDelay = startDelay || 0;
        volume = volume || 0.3;
        duration = duration || 0.15;
        type = type || 'sine';

        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        if (detune) osc.detune.value = detune;
        gainEnvelope(gain, startDelay, volume, duration, 0.35);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(c.currentTime + startDelay);
        osc.stop(c.currentTime + startDelay + duration * 0.5);
    }

    // ---- Helper: noise burst (for percussion / wind / fire) ----
    function createNoiseBuffer(duration) {
        var c = getCtx();
        if (!c) return null;
        var sampleRate = c.sampleRate;
        var length = Math.floor(sampleRate * duration);
        var buffer = c.createBuffer(1, length, sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    function playNoise(duration, volume, filterFreq, filterType, startDelay) {
        var c = getCtx();
        if (!c) return;
        startDelay = startDelay || 0;
        volume = volume || 0.25;
        duration = duration || 0.2;
        filterFreq = filterFreq || 800;
        filterType = filterType || 'bandpass';

        var buffer = createNoiseBuffer(duration);
        if (!buffer) return;
        var source = c.createBufferSource();
        source.buffer = buffer;
        var filter = c.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = filterFreq;
        filter.Q.value = 0.8;
        var gain = c.createGain();
        gainEnvelope(gain, startDelay, volume, duration, 0.25);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start(c.currentTime + startDelay);
        source.stop(c.currentTime + startDelay + duration * 0.6);
    }

    // ==================== Public Sound Effects ====================

    function playMove() {
        if (!isActive()) return;
        // Soft low thud — like a footstep on stone
        playTone(80, 'sine', 0.08, 0.12, 0, -20);
        playNoise(0.06, 0.06, 200, 'lowpass', 0);
    }

    function playPotionPickup() {
        if (!isActive()) return;
        // Magical sparkle — ascending arpeggio
        playTone(880, 'sine', 0.25, 0.18, 0, 0);
        playTone(1108, 'sine', 0.22, 0.14, 0.06, 10);
        playTone(1318, 'sine', 0.20, 0.12, 0.12, 15);
        playTone(1760, 'triangle', 0.35, 0.15, 0.16, 0);
        // Sparkle shimmer
        playNoise(0.3, 0.08, 4000, 'highpass', 0.05);
    }

    function playFlamePickup() {
        if (!isActive()) return;
        // Warm fire crackle + ascending warm tone
        playNoise(0.25, 0.13, 600, 'bandpass', 0);
        playNoise(0.18, 0.08, 300, 'lowpass', 0.04);
        playTone(440, 'triangle', 0.30, 0.13, 0, 5);
        playTone(554, 'triangle', 0.25, 0.10, 0.06, 8);
        // Subtle warmth
        var c = getCtx();
        if (c) {
            var osc = c.createOscillator();
            var gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.value = 220;
            gainEnvelope(gain, 0, 0.08, 0.35, 0.3);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(c.currentTime);
            osc.stop(c.currentTime + 0.35);
        }
    }

    function playMonsterCollision() {
        if (!isActive()) return;
        // Dramatic hit — low growl + impact noise
        var c = getCtx();
        if (c) {
            // Low sweep down (growl)
            var osc = c.createOscillator();
            var gain = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, c.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.4);
            gainEnvelope(gain, 0, 0.22, 0.45, 0.35);
            var filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, c.currentTime);
            filter.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.35);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);
            osc.start(c.currentTime);
            osc.stop(c.currentTime + 0.5);
        }
        // Impact noise
        playNoise(0.2, 0.28, 300, 'lowpass', 0);
        playNoise(0.12, 0.15, 800, 'bandpass', 0.03);
        // Low thud
        playTone(50, 'sine', 0.18, 0.3, 0.02, -30);
    }

    function playVictory() {
        if (!isActive()) return;
        // Triumphant fanfare — ascending major chord
        var notes = [
            {freq: 523, delay: 0,    dur: 0.35},  // C5
            {freq: 659, delay: 0.1,  dur: 0.35},  // E5
            {freq: 784, delay: 0.2,  dur: 0.4},   // G5
            {freq: 1047, delay: 0.3, dur: 0.55},  // C6
            {freq: 1318, delay: 0.45, dur: 0.5},  // E6
        ];
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            playTone(n.freq, 'triangle', n.dur, 0.17, n.delay, 0);
        }
        // Sparkle tail
        setTimeout(function() {
            playNoise(0.5, 0.06, 5000, 'highpass', 0);
        }, 350);
    }

    function playColdPenalty(tier) {
        if (!isActive()) return;
        tier = tier || 0;
        var c = getCtx();
        if (tier === 0) {
            // Tier 1: Wind howl — disorienting, cold wind
            // Long noise sweep with filter modulation
            if (c) {
                var buffer = createNoiseBuffer(1.2);
                if (buffer) {
                    var source = c.createBufferSource();
                    source.buffer = buffer;
                    var filter = c.createBiquadFilter();
                    filter.type = 'bandpass';
                    filter.frequency.setValueAtTime(400, c.currentTime);
                    filter.frequency.linearRampToValueAtTime(1200, c.currentTime + 0.3);
                    filter.frequency.linearRampToValueAtTime(300, c.currentTime + 0.8);
                    filter.frequency.linearRampToValueAtTime(800, c.currentTime + 1.1);
                    filter.Q.value = 6;
                    var gain = c.createGain();
                    gainEnvelope(gain, 0, 0.16, 1.2, 0.4);
                    source.connect(filter);
                    filter.connect(gain);
                    gain.connect(masterGain);
                    source.start(c.currentTime);
                    source.stop(c.currentTime + 1.3);
                }
            }
            // Icy chime — disorienting high ping
            playTone(1200, 'sine', 0.6, 0.09, 0.1, -15);
            playTone(1400, 'sine', 0.5, 0.07, 0.25, 10);
        } else if (tier === 1) {
            // Tier 2: Monster roar — low, threatening
            if (c) {
                var osc = c.createOscillator();
                var gain = c.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, c.currentTime);
                osc.frequency.linearRampToValueAtTime(60, c.currentTime + 0.6);
                osc.frequency.linearRampToValueAtTime(30, c.currentTime + 0.9);
                var filter2 = c.createBiquadFilter();
                filter2.type = 'lowpass';
                filter2.frequency.setValueAtTime(500, c.currentTime);
                filter2.frequency.exponentialRampToValueAtTime(150, c.currentTime + 0.5);
                filter2.Q.value = 3;
                gainEnvelope(gain, 0, 0.2, 0.9, 0.4);
                osc.connect(filter2);
                filter2.connect(gain);
                gain.connect(masterGain);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 1.0);
            }
            playNoise(0.5, 0.18, 250, 'lowpass', 0);
            // Heavy stomp
            playTone(40, 'sine', 0.35, 0.35, 0.15, -40);
        } else {
            // Tier 3: Death — dramatic low hit + ice shatter
            if (c) {
                // Deep dramatic sweep
                var osc2 = c.createOscillator();
                var gain2 = c.createGain();
                osc2.type = 'sawtooth';
                osc2.frequency.setValueAtTime(100, c.currentTime);
                osc2.frequency.exponentialRampToValueAtTime(20, c.currentTime + 1.2);
                gainEnvelope(gain2, 0, 0.25, 1.3, 0.5);
                var filter3 = c.createBiquadFilter();
                filter3.type = 'lowpass';
                filter3.frequency.setValueAtTime(400, c.currentTime);
                filter3.frequency.exponentialRampToValueAtTime(60, c.currentTime + 1.0);
                osc2.connect(filter3);
                filter3.connect(gain2);
                gain2.connect(masterGain);
                osc2.start(c.currentTime);
                osc2.stop(c.currentTime + 1.5);
            }
            // Ice shatter — multiple noise bursts
            playNoise(0.6, 0.25, 2000, 'highpass', 0);
            playNoise(0.4, 0.20, 3000, 'highpass', 0.15);
            playNoise(0.3, 0.15, 1500, 'bandpass', 0.3);
            // Low death thud
            playTone(30, 'sine', 0.7, 0.4, 0.1, -50);
            playTone(25, 'sine', 0.9, 0.35, 0.25, -60);
            // Dissonant high ring
            playTone(1600, 'sawtooth', 0.8, 0.06, 0.3, 20);
        }
    }

    function playMazeGenerate() {
        if (!isActive()) return;
        // Magical whoosh — rising sweep
        var c = getCtx();
        if (c) {
            var buffer = createNoiseBuffer(0.6);
            if (buffer) {
                var source = c.createBufferSource();
                source.buffer = buffer;
                var filter = c.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(200, c.currentTime);
                filter.frequency.exponentialRampToValueAtTime(3000, c.currentTime + 0.5);
                filter.Q.value = 3;
                var gain = c.createGain();
                gainEnvelope(gain, 0, 0.14, 0.6, 0.3);
                source.connect(filter);
                filter.connect(gain);
                gain.connect(masterGain);
                source.start(c.currentTime);
                source.stop(c.currentTime + 0.65);
            }
        }
        // Rising tone
        playTone(300, 'sine', 0.5, 0.10, 0, 0);
        playTone(450, 'sine', 0.4, 0.08, 0.08, 5);
        playTone(600, 'sine', 0.35, 0.07, 0.15, 10);
        playTone(800, 'triangle', 0.45, 0.09, 0.2, 0);
    }

    function playButtonClick() {
        if (!isActive()) return;
        // Subtle UI tick
        playTone(600, 'sine', 0.06, 0.08, 0, 0);
        playTone(800, 'sine', 0.05, 0.05, 0.015, 10);
    }

    // ==================== Public API ====================

    function play(name, tier) {
        if (muted) return;
        // Lazy-init context
        getCtx();
        switch (name) {
            case 'move':     playMove(); break;
            case 'potion':   playPotionPickup(); break;
            case 'flame':    playFlamePickup(); break;
            case 'monster':  playMonsterCollision(); break;
            case 'victory':  playVictory(); break;
            case 'cold':     playColdPenalty(tier || 0); break;
            case 'generate': playMazeGenerate(); break;
            case 'click':    playButtonClick(); break;
        }
    }

    function toggleMute() {
        muted = !muted;
        return muted;  // returns new state
    }

    // Pre-create AudioContext on first user gesture to avoid autoplay issues
    function initOnInteraction() {
        getCtx();
    }

    // Bind to first interaction
    var bound = false;
    function autoInit() {
        if (bound) return;
        bound = true;
        document.addEventListener('click', initOnInteraction, {once: true});
        document.addEventListener('keydown', initOnInteraction, {once: true});
    }
    autoInit();

    return {
        play: play,
        toggleMute: toggleMute,
        get muted() { return muted; },
        get isActive() { return !muted && !!ctx; }
    };
})();
