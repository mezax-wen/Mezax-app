import { strict as assert } from 'node:assert';
import { isPlausibleLivePaper, livePaperPolygonPoints, smoothLivePaperCorners } from './livePaperTracking.ts';

const paper = {
  topLeft: { x: 0.20, y: 0.12 },
  topRight: { x: 0.80, y: 0.14 },
  bottomRight: { x: 0.78, y: 0.88 },
  bottomLeft: { x: 0.18, y: 0.86 },
};
assert.equal(isPlausibleLivePaper(paper), true);
assert.equal(isPlausibleLivePaper({
  topLeft: { x: 0.42, y: 0.42 },
  topRight: { x: 0.58, y: 0.42 },
  bottomRight: { x: 0.58, y: 0.58 },
  bottomLeft: { x: 0.42, y: 0.58 },
}), false);

const smoothed = smoothLivePaperCorners(paper, {
  ...paper,
  topLeft: { x: 0.22, y: 0.14 },
});
assert.ok(smoothed.topLeft.x > 0.20 && smoothed.topLeft.x < 0.22);
assert.match(livePaperPolygonPoints(paper), /^20\.00,12\.00 /);
console.log('livePaperTracking tests passed');