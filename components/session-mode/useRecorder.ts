"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Camera and recording for Session Mode.
 *
 * Two things worth knowing about how this behaves:
 *
 * The PREVIEW is mirrored and the RECORDING is not. People expect to see
 * themselves as they do in a mirror, but a recording that comes out
 * backwards makes any text in shot unreadable and looks wrong to everyone
 * else. The flip is CSS on the video element, which never touches the
 * stream being recorded.
 *
 * Nothing is uploaded. The file is built in the browser and saved straight
 * to the device, so there is no storage bill, no upload wait, and no size
 * ceiling imposed by us.
 */

/**
 * Preferred first, in order. Safari and iOS only do mp4; Chrome and Firefox
 * historically only did webm. Picking the first supported one rather than
 * hardcoding webm is what stops this producing files an iPhone cannot play.
 */
const CANDIDATE_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of CANDIDATE_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // Older implementations throw rather than returning false.
    }
  }
  return undefined; // let the browser choose
}

function extensionFor(mimeType: string | undefined): string {
  if (!mimeType) return "webm";
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

export type CameraState = "off" | "starting" | "on" | "error";

/**
 * How long it has to stay quiet before the recorder stops rolling.
 *
 * Short enough that walking to the next spot is cut out, long enough
 * that a breath or a beat for effect is not. Under about half a second
 * this starts eating the pauses that make someone sound human.
 */
const SILENCE_HOLD_MS = 700;

/** How often the level is measured. Cheap, and 20 a second is plenty. */
const METER_MS = 50;

export interface Take {
  file: File;
  /** Megabytes, rounded, for telling him the take is really there. */
  mb: number;
}

export interface Recorder {
  state: CameraState;
  /** Live microphone level, 0 to 1, for the meter. */
  level: number;
  /** Cut the quiet parts out while recording. */
  autoCut: boolean;
  setAutoCut: (on: boolean) => void;
  /** Below this level counts as quiet. His room decides the number. */
  threshold: number;
  setThreshold: (v: number) => void;
  /** True while the recorder is paused because it has gone quiet. */
  cutting: boolean;
  /** True while he has paused it himself. */
  paused: boolean;
  pauseRecording: () => void;
  resumeRecording: () => void;
  error: string | null;
  recording: boolean;
  /** Seconds elapsed in the current take. */
  elapsed: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  supported: boolean;
  /**
   * The last take, held rather than thrown at the downloads folder.
   *
   * A phone has somewhere better for a video to go than Files, and the
   * share sheet is how it gets to Photos or straight into Instagram. But
   * iOS only opens a share sheet inside a tap, and a recording finishes
   * on its own, so the file waits here for him to press something.
   */
  take: Take | null;
  /**
   * The same take with nothing cut out.
   *
   * Kept because automatic cutting is destructive and silent: if the
   * threshold is wrong for the room, words go missing and there is
   * nothing to compare against. A second recorder on the same stream
   * costs memory and removes the only real objection to the feature.
   */
  fullTake: Take | null;
  canShareTake: boolean;
  shareTake: () => Promise<void>;
  downloadTake: () => void;
  shareFullTake: () => Promise<void>;
  downloadFullTake: () => void;
  clearTake: () => void;
}

/** Hands a file to the downloads folder. */
function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download on some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function useRecorder(filenameHint: string): Recorder {
  const [state, setState] = useState<CameraState>("off");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [fullTake, setFullTake] = useState<Take | null>(null);
  const [level, setLevel] = useState(0);
  const [autoCut, setAutoCut] = useState(false);
  const [threshold, setThreshold] = useState(0.015);
  const [cutting, setCutting] = useState(false);
  const [paused, setPaused] = useState(false);
  // A deliberate pause outranks the silence watcher. Without this, going
  // quiet while paused looks the same to the meter as going quiet while
  // rolling, and the first word on his return would start it again from
  // the middle of a room he has walked out of.
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [canShareTake, setCanShareTake] = useState(false);
  // Read inside the recorder's onstop, which closes over the moment it
  // was created, so the current value has to come through a ref.
  const canShareRef = useRef(false);
  canShareRef.current = canShareTake;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The uncut safety copy, and the machinery that watches the level.
  const fullRecorderRef = useRef<MediaRecorder | null>(null);
  const fullChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quietSinceRef = useRef<number | null>(null);
  // Read inside the meter loop, which is created once and would
  // otherwise close over the values these had at that moment.
  const autoCutRef = useRef(autoCut);
  autoCutRef.current = autoCut;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  // Read inside the recorder's onstop, which closes over its creation
  // moment, so it has to be a ref rather than the prop directly.
  const nameRef = useRef(filenameHint);
  nameRef.current = filenameHint;

  // Worked out after mount, never during render.
  //
  // Deciding this inline looks harmless and is not: the server has no
  // `navigator`, so it renders the camera controls away, the browser renders
  // them in, and React throws a hydration mismatch on every load. Starting
  // false and flipping it in an effect means both passes agree.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof MediaRecorder !== "undefined",
    );
    // Whether this device can hand a video to the system. Asked with a
    // real file rather than guessed from the user agent, because a
    // browser can have navigator.share and still refuse files.
    try {
      const probe = new File([new Blob([new Uint8Array([0])])], "probe.mp4", {
        type: "video/mp4",
      });
      setCanShareTake(
        typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [probe] }),
      );
    } catch {
      setCanShareTake(false);
    }
  }, []);

  /** Tears down the level meter. */
  const stopMeter = useCallback(() => {
    if (meterRef.current) {
      clearInterval(meterRef.current);
      meterRef.current = null;
    }
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
    quietSinceRef.current = null;
  }, []);

  /**
   * Watches how loud it is, and rolls or stops the recorder to match.
   *
   * Pausing a MediaRecorder leaves no gap in the file: the result is
   * already cut, with no re-encoding, no upload and nothing for a phone
   * to grind through afterwards. That is the whole reason this works on
   * a phone at all.
   *
   * It waits SILENCE_HOLD_MS before cutting, so a breath survives, and
   * resumes on the first sound above the threshold. Resuming cannot
   * reach backwards, so a few milliseconds at the front of a word are
   * lost; the hold is what keeps that from happening mid-sentence.
   */
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Float32Array(analyser.fftSize);
      meterRef.current = setInterval(() => {
        const a = analyserRef.current;
        if (!a) return;
        a.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);

        const rec = recorderRef.current;
        if (!autoCutRef.current || !rec || rec.state === "inactive") return;
        if (pausedRef.current) return;

        if (rms >= thresholdRef.current) {
          quietSinceRef.current = null;
          if (rec.state === "paused") {
            rec.resume();
            setCutting(false);
          }
          return;
        }

        if (rec.state !== "recording") return;
        const now = Date.now();
        if (quietSinceRef.current === null) quietSinceRef.current = now;
        else if (now - quietSinceRef.current >= SILENCE_HOLD_MS) {
          rec.pause();
          setCutting(true);
        }
      }, METER_MS);
    } catch {
      // No audio context means no meter and no cutting. Recording still
      // works, which is the part that matters.
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (fullRecorderRef.current && fullRecorderRef.current.state !== "inactive") {
      fullRecorderRef.current.stop();
    }
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
    setCutting(false);
    setState("off");
  }, [stopMeter]);

  const startCamera = useCallback(async () => {
    if (!supported) {
      setState("error");
      setError("This browser cannot use the camera. Try Chrome or Safari.");
      return;
    }
    setState("starting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS refuses to show a preview without these two.
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => undefined);
      }
      startMeter(stream);
      setState("on");
    } catch (err) {
      setState("error");
      const name = err instanceof Error ? err.name : "";
      // Say which of these it is, because the fix is different for each
      // and "could not start camera" sends people to the wrong setting.
      setError(
        name === "NotAllowedError"
          ? "Camera and microphone were blocked. Allow them for this site in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : name === "NotReadableError"
              ? "Another app is already using the camera. Close it and try again."
              : "Could not start the camera.",
      );
    }
  }, [supported, startMeter]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = pickMimeType();
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setError("This browser could not start a recording.");
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const type = mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];

      // An empty take used to vanish without a word, which looks exactly
      // like a successful one until you go looking for the file.
      if (blob.size === 0) {
        setError(
          "That take came back empty and was not saved. Check the camera is still on, then record again.",
        );
        return;
      }

      const file = new File([blob], `${nameRef.current}.${extensionFor(mimeType)}`, {
        type,
      });
      setTake({ file, mb: Math.max(1, Math.round(blob.size / 1_048_576)) });

      // Where there is no share sheet, the downloads folder is the only
      // place a video can go, so it goes there straight away as before.
      if (!canShareRef.current) downloadFile(file);
    };

    // The uncut copy, on the same stream, started alongside. Only when
    // cutting is on: otherwise it would be a second identical file for
    // no reason, at twice the memory.
    if (autoCutRef.current) {
      try {
        const full = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        fullChunksRef.current = [];
        full.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) fullChunksRef.current.push(e.data);
        };
        full.onstop = () => {
          const type = mimeType || "video/webm";
          const blob = new Blob(fullChunksRef.current, { type });
          fullChunksRef.current = [];
          if (blob.size === 0) return;
          const file = new File([blob], `${nameRef.current}-uncut.${extensionFor(mimeType)}`, {
            type,
          });
          setFullTake({ file, mb: Math.max(1, Math.round(blob.size / 1_048_576)) });
        };
        full.start(1000);
        fullRecorderRef.current = full;
      } catch {
        // No safety copy. The cut take still records, and the UI says
        // plainly whether an uncut one exists rather than assuming.
        fullRecorderRef.current = null;
      }
    }

    // A timeslice means data arrives in chunks rather than only at the end,
    // so a crash or a closed tab does not lose the entire take.
    recorder.start(1000);
    recorderRef.current = recorder;
    setTake(null);
    setFullTake(null);
    quietSinceRef.current = null;
    setCutting(false);
    setPaused(false);
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  /**
   * Stop rolling, keep the take open.
   *
   * The same mechanism the silence cutter uses, with his hand on it: the
   * file carries on where it left off, so a take filmed in three places
   * is still one video rather than three to join up afterwards.
   */
  const pauseRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") rec.pause();
    fullRecorderRef.current?.state === "recording" && fullRecorderRef.current.pause();
    setPaused(true);
    setCutting(false);
  }, []);

  const resumeRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "paused") rec.resume();
    fullRecorderRef.current?.state === "paused" && fullRecorderRef.current.resume();
    setPaused(false);
    quietSinceRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      // A paused recorder has to be resumed before it will stop and
      // flush what it has. Stopping it while paused loses the take.
      if (rec.state === "paused") rec.resume();
      rec.stop();
    }
    if (fullRecorderRef.current && fullRecorderRef.current.state !== "inactive") {
      fullRecorderRef.current.stop();
    }
    setRecording(false);
    setCutting(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Release the camera on unmount, or the indicator light stays on and the
  // device stays warm long after the page is gone.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const shareTake = useCallback(async () => {
    if (!take) return;
    try {
      await navigator.share({ files: [take.file], title: "Take" });
    } catch (err) {
      // Closing the sheet is a thing people do on purpose.
      if ((err as Error)?.name !== "AbortError") {
        setError("That share was refused. Saving it to your downloads instead.");
        downloadFile(take.file);
      }
    }
  }, [take]);

  const downloadTake = useCallback(() => {
    if (take) downloadFile(take.file);
  }, [take]);

  const shareFullTake = useCallback(async () => {
    if (!fullTake) return;
    try {
      await navigator.share({ files: [fullTake.file], title: "Uncut take" });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") downloadFile(fullTake.file);
    }
  }, [fullTake]);

  const downloadFullTake = useCallback(() => {
    if (fullTake) downloadFile(fullTake.file);
  }, [fullTake]);

  const clearTake = useCallback(() => {
    setTake(null);
    setFullTake(null);
  }, []);

  return {
    state,
    error,
    recording,
    elapsed,
    videoRef,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    supported,
    level,
    autoCut,
    setAutoCut,
    threshold,
    setThreshold,
    cutting,
    paused,
    pauseRecording,
    resumeRecording,
    take,
    fullTake,
    canShareTake,
    shareTake,
    downloadTake,
    shareFullTake,
    downloadFullTake,
    clearTake,
  };
}
