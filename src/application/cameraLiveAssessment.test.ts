import { strict as assert } from 'node:assert';
import { nextLiveCameraAssessment } from './cameraLiveAssessment.ts';

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

console.log('cameraLiveAssessment tests passed');