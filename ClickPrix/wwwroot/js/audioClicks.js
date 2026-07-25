// Web Audio click scheduler + timing-tower animator for ClickPrix.
// Audio events are scheduled on the AudioContext clock (sample-accurate),
// so gaps of 1-2 thousandths of a second are reproduced faithfully.
// Marker travel uses the Web Animations API and row/readout reactions use
// setTimeout - plenty accurate for visuals, never used for audio timing.

let ctx = null;
let master = null;
let keepAlive = null;
let activeNodes = [];
let timeouts = [];
let animations = [];
// Samples (wwwroot/audio/, Pixabay Content License, no attribution
// required): the Markers view plays a car pass-by, the Highlight view a
// punchy pop. Each is fetched and decoded once, lazily, on first use;
// the synthesized click remains as the fallback if a load fails.
const SAMPLE_URLS = { vroom: "audio/vroom.mp3", pop: "audio/pop.mp3" };
const samples = {}; // name -> { buffer, onset, peakAt, load }

function loadSample(name) {
    const s = samples[name] ??= { buffer: null, onset: 0, peakAt: 0, load: null };
    s.load ??= fetch(SAMPLE_URLS[name])
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(b => ctx.decodeAudioData(b))
        .then(buf => {
            s.buffer = buf;
            // Find the onset (skip leading silence) and the loudest point.
            // Pops anchor their onset to the crossing time; pass-bys anchor
            // their PEAK there - the peak is the instant the car passes.
            const d = buf.getChannelData(0);
            let i = 0;
            while (i < d.length && Math.abs(d[i]) < 0.02) i++;
            s.onset = i < d.length ? i / buf.sampleRate : 0;
            let pk = 0, pkIdx = 0;
            for (let j = 0; j < d.length; j++) {
                if (Math.abs(d[j]) > pk) { pk = Math.abs(d[j]); pkIdx = j; }
            }
            s.peakAt = pkIdx / buf.sampleRate;
        })
        .catch(err => {
            // Transient failures must not stick: clear the cached attempt so
            // the next play retries instead of falling back to clicks forever.
            s.load = null;
            console.warn(`ClickPrix: ${name} sample failed to load, falling back to clicks for this run.`, err);
        });
    return s.load;
}

// Opens the audio output stream and keeps the whole output chain awake.
// Without this, the FIRST scheduled click can be swallowed: on Windows
// (notably with Bluetooth headsets and power-saving audio drivers) the
// output chain sleeps during silence and fades audio in on wake, eating
// the earliest sound. Crucially, the keep-alive must carry NON-ZERO
// samples: an all-zero loop holds the Web Audio stream open, but
// silence detectors in drivers and sinks operate on sample content, so
// they sleep anyway and the pole click - always the first real audio
// after a silent stretch - lands inside the wake-up fade. A 30 Hz sine
// at -60 dBFS stays far below the hearing threshold at that frequency
// while keeping real signal flowing for the whole session. 30 whole
// cycles fit a 1 s buffer at any sample rate, so the loop is seamless.
async function ensureContext() {
    if (!ctx) {
        ctx = new AudioContext({ latencyHint: "interactive" });
        master = ctx.createGain();
        master.gain.value = 0.9;
        // Compressor keeps the mix clean when many vrooms overlap -
        // midfield cars arrive tenths apart, so 6-8 voices can be
        // sounding at once and would clip a bare destination.
        const compressor = ctx.createDynamicsCompressor();
        master.connect(compressor);
        compressor.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
        await ctx.resume();
    }
    if (!keepAlive) {
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1s
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = 0.001 * Math.sin(2 * Math.PI * 30 * i / ctx.sampleRate);
        }
        keepAlive = ctx.createBufferSource();
        keepAlive.buffer = buf;
        keepAlive.loop = true;
        keepAlive.connect(ctx.destination);
        keepAlive.start();
    }

    // Don't schedule against a clock that hasn't started ticking yet:
    // right after resume(), currentTime can be frozen for a few ms and
    // then jump, which shifts or clips the earliest scheduled events.
    const t0 = ctx.currentTime;
    for (let i = 0; i < 20 && ctx.currentTime === t0; i++) {
        await new Promise(r => setTimeout(r, 10));
    }
}

function clickSound(time, index, count) {
    // A crisp mechanical tick: square wave through a highpass, gated by a
    // 1 ms attack / ~50 ms exponential-decay envelope.
    const osc = ctx.createOscillator();
    const highpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = 1520 - index * 26; // pitch walks down the order

    highpass.type = "highpass";
    highpass.frequency.value = 700;

    const level = index === 0 ? 0.62 : 0.44; // pole gets a little more energy
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(highpass).connect(gain);
    panToMaster(gain, index, count);

    osc.start(time);
    osc.stop(time + 0.06);
    activeNodes.push(osc);
}

// Pan the grid across the stereo field, P1 left -> last car right,
// then into the master bus.
function panToMaster(node, index, count) {
    if (ctx.createStereoPanner && count > 1) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = -0.5 + index / (count - 1);
        node.connect(panner);
        node = panner;
    }
    node.connect(master);
}

function vroomSound(time, index, count) {
    // Each pass-by plays out its full length at natural pitch so
    // consecutive cars mix and overlap like a real field crossing the
    // line; the stereo pan keeps crossings distinguishable in the blend.
    // The sample's PEAK is aligned to the crossing time: the car is heard
    // approaching, and is loudest exactly as its marker hits the line.
    const { buffer, onset, peakAt } = samples.vroom;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const dur = buffer.duration - onset;
    const lead = Math.max(0, peakAt - onset);
    const start = Math.max(ctx.currentTime + 0.01, time - lead);

    const gain = ctx.createGain();
    const level = index === 0 ? 0.55 : 0.4; // pole gets a little more energy
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.01);
    gain.gain.setValueAtTime(level, start + Math.max(0.02, dur - 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(gain);
    panToMaster(gain, index, count);

    src.start(start, onset);
    src.stop(start + dur + 0.05);
    activeNodes.push(src);
}

function popSound(time, index, count) {
    // The pop's transient is ~30 ms with a natural decay, so no envelope
    // gating is needed - just skip the file's leading silence so the
    // punch lands exactly on the crossing time.
    const { buffer, onset } = samples.pop;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Same descending-pitch cue as the synth ticks, via playback rate.
    src.playbackRate.value = count > 1 ? 1.12 - 0.24 * (index / (count - 1)) : 1;

    const gain = ctx.createGain();
    gain.gain.value = index === 0 ? 0.7 : 0.5; // pole gets a little more energy

    src.connect(gain);
    panToMaster(gain, index, count);

    src.start(time, onset);
    src.stop(time + 0.3);
    activeNodes.push(src);
}

function crossingVisuals(item, index) {
    const row = document.getElementById(`cp-row-${index}`);
    if (row) {
        row.classList.add("flash");
        row.classList.add("lit"); // persists until reset; styled by the Highlight view
        timeouts.push(setTimeout(() => row.classList.remove("flash"), 500));
    }

    const marker = document.getElementById(`cp-marker-${index}`);
    if (marker) marker.classList.add("crossed");

    const pulse = document.getElementById(`cp-pulse-${index}`);
    if (pulse) {
        pulse.classList.add("pulsing");
        timeouts.push(setTimeout(() => pulse.classList.remove("pulsing"), 650));
    }

    const pos = document.getElementById("cp-readout-pos");
    if (pos) pos.textContent = `P${String(index + 1).padStart(2, "0")} · ${item.code}`;
    const gap = document.getElementById("cp-readout-gap");
    if (gap) gap.textContent = "+" + item.gap.toFixed(3);
}

function resetVisuals() {
    animations.forEach(a => a.cancel());
    animations = [];
    document.querySelectorAll(".cp-marker.crossed").forEach(el => el.classList.remove("crossed"));
    document.querySelectorAll(".cp-row.flash").forEach(el => el.classList.remove("flash"));
    document.querySelectorAll(".cp-row.lit").forEach(el => el.classList.remove("lit"));
    document.querySelectorAll(".cp-pulse.pulsing").forEach(el => el.classList.remove("pulsing"));
    const pos = document.getElementById("cp-readout-pos");
    if (pos) pos.textContent = "P— · READY";
    const gap = document.getElementById("cp-readout-gap");
    if (gap) gap.textContent = "+0.000";
}

export async function play(items, totalSeconds, useVroom, dotnetRef) {
    // items: [{ code, gap, cross: seconds-from-start, idlePct, endPct, durMs }]
    stop();
    await ensureContext();
    const which = useVroom ? "vroom" : "pop";
    await loadSample(which);
    const sound = samples[which].buffer ? (useVroom ? vroomSound : popSound) : clickSound;

    const headroom = 0.1; // scheduling headroom, mirrored in every visual delay
    const base = ctx.currentTime + headroom;

    items.forEach((item, i) => {
        sound(base + item.cross, i, items.length);

        const marker = document.getElementById(`cp-marker-${i}`);
        if (marker) {
            animations.push(marker.animate(
                [{ left: item.idlePct + "%" }, { left: item.endPct + "%" }],
                { duration: item.durMs, delay: headroom * 1000, easing: "linear", fill: "forwards" }));
        }

        timeouts.push(setTimeout(() => crossingVisuals(item, i), (item.cross + headroom) * 1000));
    });

    const fill = document.getElementById("cp-progress-fill");
    if (fill) {
        animations.push(fill.animate(
            [{ width: "0%" }, { width: "100%" }],
            { duration: totalSeconds * 1000, delay: headroom * 1000, easing: "linear", fill: "forwards" }));
    }

    timeouts.push(setTimeout(() => {
        resetVisuals();
        if (dotnetRef) dotnetRef.invokeMethodAsync("OnPlaybackFinished");
    }, (totalSeconds + headroom) * 1000));
}

export function stop() {
    timeouts.forEach(clearTimeout);
    timeouts = [];
    activeNodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    activeNodes = [];
    resetVisuals();
}

addEventListener("pagehide", () => stop());
