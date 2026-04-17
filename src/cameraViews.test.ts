import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_STATE_ORDER,
  DEFAULT_CAMERA_STATE,
  formatCameraStateLabel,
  getCameraStateFromStep,
  getCameraStepNumber,
} from "./cameraViews.ts";

test("camera state order and step parsing stay aligned", () => {
  assert.deepEqual(CAMERA_STATE_ORDER, [
    "schematic",
    "solar_system",
    "earth_moon",
    "moon",
    "earth",
  ]);
  assert.equal(DEFAULT_CAMERA_STATE, "moon");
  assert.equal(getCameraStateFromStep("1"), "schematic");
  assert.equal(getCameraStateFromStep("4"), "moon");
  assert.equal(getCameraStateFromStep("5"), "earth");
  assert.equal(getCameraStateFromStep("0"), null);
  assert.equal(getCameraStateFromStep("bogus"), null);
  assert.equal(getCameraStateFromStep(null), null);
});

test("camera labels and step numbers come from a single source of truth", () => {
  assert.equal(formatCameraStateLabel("schematic"), "Schematic (not to scale)");
  assert.equal(formatCameraStateLabel("solar_system"), "Solar system");
  assert.equal(formatCameraStateLabel("earth_moon"), "Earth and Moon");
  assert.equal(formatCameraStateLabel("moon"), "Moon");
  assert.equal(formatCameraStateLabel("earth"), "Earth");
  assert.equal(getCameraStepNumber("schematic"), 1);
  assert.equal(getCameraStepNumber("moon"), 4);
  assert.equal(getCameraStepNumber("earth"), 5);
});
