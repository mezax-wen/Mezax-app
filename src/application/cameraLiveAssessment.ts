export type LiveCameraGuideStatus = 'positioning' | 'moving' | 'ready';

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
    return { stableFrames: 0, status: 'positioning' as const, shouldCapture: false };
  }

  const nextStableFrames = movement <= stabilityThreshold ? stableFrames + 1 : 0;
  return {
    stableFrames: nextStableFrames,
    status: nextStableFrames >= readyFrames ? 'ready' as const : 'moving' as const,
    shouldCapture: nextStableFrames >= captureFrames,
  };
}