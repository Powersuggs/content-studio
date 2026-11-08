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

export interface Take {
  file: File;
  /** Megabytes, rounded, for telling him the take is really there. */
  mb: number;
}

export interface Recorder {
  state: CameraState;
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
  canShareTake: boolean;
  shareTake: () => Promise<void>;
  downloadTake: () => void;
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

  const stopCamera = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
    setState("off");
  }, []);

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
  }, [supported]);

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

    // A timeslice means data arrives in chunks rather than only at the end,
    // so a crash or a closed tab does not lose the entire take.
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
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

  const clearTake = useCallback(() => setTake(null), []);

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
    take,
    canShareTake,
    shareTake,
    downloadTake,
    clearTake,
  };
}
