import { strict as assert } from 'node:assert';
import {
  IPHONE_LIVE_CAMERA_TUNING,
  liveCameraStabilityProgress,
  nextCameraStabilityFrames,
  nextLiveCameraAssessment,
} from './cameraLiveAssessment.ts';

const iphoneNoise = nextLiveCameraAssessment({
  documentDetected: true,
  movement: 8,
  stableFrames: 4,
  ...IPHONE_LIVE_CAMERA_TUNING,
});
assert.deepEqual(iphoneNoise, { stableFrames: 5, status: 'ready', shouldCapture: false });

const iphoneCapture = nextLiveCameraAssessment({
  documentDetected: true,
  movement: 8,
  stableFrames: 5,
  ...IPHONE_LIVE_CAMERA_TUNING,
});
assert.deepEqual(iphoneCapture, { stableFrames: 6, status: 'ready', shouldCapture: true });

const missingDocument = nextLiveCameraAssessment({
  documentDetected: false,
  movement: 0,
  stableFrames: 3,
});
assert.deepEqual(missingDocument, { stableFrames: 0, status: 'positioning', shouldCapture: false });

const movingDocument = nextLiveCameraAssessment({
  documentDetected: true,
  movement: 8,
  stableFrames: 2,
});
assert.deepEqual(movingDocument, { stableFrames: 0, status: 'moving', shouldCapture: false });

const readyDocument = nextLiveCameraAssessment({
  documentDetected: true,
  movement: 2,
  stableFrames: 1,
});
assert.deepEqual(readyDocument, { stableFrames: 2, status: 'ready', shouldCapture: false });

const captureDocument = nextLiveCameraAssessment({
  documentDetected: true,
  movement: 2,
  stableFrames: 3,
});
assert.deepEqual(captureDocument, { stableFrames: 4, status: 'ready', shouldCapture: true });
assert.equal(liveCameraStabilityProgress(0), 0);
assert.equal(liveCameraStabilityProgress(2), 0.5);
assert.equal(liveCameraStabilityProgress(4), 1);
assert.equal(liveCameraStabilityProgress(8), 1);

assert.equal(nextCameraStabilityFrames(Number.POSITIVE_INFINITY, 3), 0);
assert.equal(nextCameraStabilityFrames(8, 3), 2);
assert.equal(nextCameraStabilityFrames(2, 0), 1);
assert.equal(nextCameraStabilityFrames(2, 3), 4);

console.log('cameraLiveAssessment tests passed');
