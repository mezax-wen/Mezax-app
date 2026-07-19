export type LiveCameraGuideStatus = 'positioning' | 'moving' | 'ready';

export const IPHONE_LIVE_CAMERA_TUNING = {
  stabilityThreshold: 9,
  readyFrames: 4,
  captureFrames: 5,
} as const;

type LiveCameraAssessmentInput = {
  documentDetected: boolean;
  movement: number;
  stableFrames: number;
  stabilityThreshold?: number;
  readyFrames?: number;
  captureFrames?: number;
};

export function nextLiveCameraAssessment({
  documentDetected,
  movement,
  stableFrames,
  stabilityThreshold = 4.8,
  readyFrames = 2,
  captureFrames = 4,
}: LiveCameraAssessmentInput) {
  if (!documentDetected) {
    return {
      stableFrames: Math.max(0, stableFrames - 1),
      status: 'positioning' as const,
      shouldCapture: false,
    };
  }

  const nextStableFrames = movement <= stabilityThreshold
    ? stableFrames + 1
    : movement <= stabilityThreshold * 1.7
      ? Math.max(0, stableFrames - 1)
      : 0;
  return {
    stableFrames: nextStableFrames,
    status: nextStableFrames >= readyFrames ? 'ready' as const : 'moving' as const,
    shouldCapture: nextStableFrames >= captureFrames,
  };
}

export function nextCameraStabilityFrames(
  movement: number,
  stableFrames: number,
  stabilityThreshold = 4.8,
) {
  if (!Number.isFinite(movement)) return 0;
  if (movement > stabilityThreshold) return Math.max(0, stableFrames - 1);
  return Math.max(0, stableFrames) + 1;
}

export function liveCameraStabilityProgress(stableFrames: number, captureFrames = 4) {
  if (!Number.isFinite(stableFrames) || !Number.isFinite(captureFrames) || captureFrames <= 0) return 0;
  return Math.min(1, Math.max(0, stableFrames / captureFrames));
}
