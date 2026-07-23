// Web Audio click scheduler for ClickPrix.
// Audio events are scheduled on the AudioContext clock (sample-accurate),
// so gaps of 1-2 thousandths of a second are reproduced faithfully.
// Row highlighting uses setTimeout, which is plenty accurate for visuals.

let ctx = null;
let keepAlive = null;
let activeNodes = [];
let timeouts = [];

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

function clickSound(time, isFirst) {
    // A short, bright tick: high-frequency square blip with a fast decay.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    // Pole gets a slightly lower, distinct pitch so you can anchor on it.
    osc.frequency.value = isFirst ? 1400 : 2100;

    // Give the pole click a little more energy and length - it is the
    // one that plays into the quietest moment.
    const level = isFirst ? 0.65 : 0.5;
    const decay = isFirst ? 0.05 : 0.03;

    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + decay + 0.01);
    activeNodes.push(osc);
}

export async function play(items, dotnetRef) {
    // items: [{ offset: seconds-from-start, rowId: string }]
    stop();
    await ensureContext();

    const base = ctx.currentTime + 0.1; // scheduling headroom

    let maxOffset = 0;
    items.forEach((item, i) => {
        clickSound(base + item.offset, i === 0);
        maxOffset = Math.max(maxOffset, item.offset);

        timeouts.push(setTimeout(() => {
            const row = document.getElementById(item.rowId);
            if (row) row.classList.add("clicked");
        }, (item.offset + 0.1) * 1000));
    });

    timeouts.push(setTimeout(() => {
        if (dotnetRef) dotnetRef.invokeMethodAsync("OnPlaybackFinished");
    }, (maxOffset + 0.4) * 1000));
}

export function stop() {
    timeouts.forEach(clearTimeout);
    timeouts = [];
    activeNodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    activeNodes = [];
    document.querySelectorAll(".clicked").forEach(el => el.classList.remove("clicked"));
}
