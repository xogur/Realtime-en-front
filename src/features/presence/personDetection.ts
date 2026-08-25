// A side-profile person framed inside the kiosk's 16:9 camera view can score
// around 0.0977 with EfficientDet Lite0. Keep the threshold low enough for
// presence detection; two consecutive frames still prevent one-frame noise.
export const PERSON_DETECTION_CONFIDENCE = 0.05;

type DetectionCategory = {
  categoryName?: string;
  displayName?: string;
};

type PersonDetection = {
  categories: DetectionCategory[];
};

export function hasPersonDetection(detections: PersonDetection[]) {
  return detections.some((detection) => detection.categories.some((category) => (
    category.categoryName?.trim().toLowerCase() === 'person'
    || category.displayName?.trim().toLowerCase() === 'person'
  )));
}
