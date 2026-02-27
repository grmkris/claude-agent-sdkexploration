import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpeechToTextError =
  | "not-supported" // Browser has no SpeechRecognition API
  | "not-allowed" // Mic permission denied by user or OS policy
  | "no-speech" // Silence timeout — no speech detected
  | "network" // Network error during cloud-side recognition
  | "aborted" // Recognition aborted (stop() called mid-session)
  | "unknown"; // Catch-all for unhandled error codes

export interface UseSpeechToText {
  /** Whether the browser supports the Web Speech API */
  isSupported: boolean;
  /** Whether a recognition session is currently active */
  isListening: boolean;
  /** Last error encountered, or null if clean */
  error: SpeechToTextError | null;
  /** Start a recognition session; fires onResult when speech is transcribed */
  start: () => void;
  /** Stop the active recognition session */
  stop: () => void;
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapError(code: SpeechRecognitionErrorCode): SpeechToTextError {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Wraps the browser's Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 * into a React hook. Each call to `start()` records a single utterance; the
 * transcribed text is delivered via `onResult`. Gracefully returns
 * `isSupported: false` on SSR and in browsers that don't implement the API.
 *
 * @param onResult - Called with the final transcript string after each utterance.
 */
export function useSpeechToText(
  onResult: (transcript: string) => void
): UseSpeechToText {
  // Evaluate once — stable boolean, SSR-safe
  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<SpeechToTextError | null>(null);

  // Holds the live SpeechRecognition instance without causing re-renders
  const recognizerRef = useRef<SpeechRecognition | null>(null);

  // Abort any active session on unmount
  useEffect(() => {
    return () => {
      recognizerRef.current?.abort();
      recognizerRef.current = null;
    };
  }, []);

  // ── start ──────────────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (!isSupported) {
      setError("not-supported");
      return;
    }

    // Guard: don't stack sessions
    if (recognizerRef.current) return;

    const SpeechRecognitionImpl =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) return;

    const recognizer = new SpeechRecognitionImpl();
    recognizer.continuous = false; // Single utterance per click
    recognizer.interimResults = false; // Final transcripts only
    recognizer.lang = navigator.language ?? "en-US"; // Respect browser locale

    recognizer.onstart = () => {
      setIsListening(true);
      setError(null); // Clear any previous error on new session
    };

    recognizer.onresult = (ev: SpeechRecognitionEvent) => {
      // With continuous=false there is exactly one result group
      const transcript = ev.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        onResult(transcript);
      }
    };

    recognizer.onerror = (ev: SpeechRecognitionErrorEvent) => {
      // "aborted" fires when stop() is called — not a user-visible error
      if (ev.error !== "aborted") {
        setError(mapError(ev.error));
      }
    };

    recognizer.onend = () => {
      setIsListening(false);
      recognizerRef.current = null;
    };

    recognizerRef.current = recognizer;
    recognizer.start();
  }, [isSupported, onResult]);

  // ── stop ───────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
    // onend will fire and reset isListening + clear recognizerRef
  }, []);

  return { isSupported, isListening, error, start, stop };
}
