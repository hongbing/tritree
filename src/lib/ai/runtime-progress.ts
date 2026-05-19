export type RuntimeProgressSegmentKind = "debug" | "text" | "tool";

export type RuntimeProgressSegment = {
  delta: string;
  kind: RuntimeProgressSegmentKind;
};

export type RuntimeProgressBridge = {
  emit?: (segments: RuntimeProgressSegment[]) => void;
};

export function createRuntimeProgressBridge(): RuntimeProgressBridge {
  return {};
}

export function attachRuntimeProgressBridge(
  bridge: RuntimeProgressBridge | undefined,
  emit: (segments: RuntimeProgressSegment[]) => void
) {
  if (!bridge) return () => undefined;

  const previousEmit = bridge.emit;
  bridge.emit = emit;

  return () => {
    if (bridge.emit === emit) {
      bridge.emit = previousEmit;
    }
  };
}

export function emitRuntimeProgressSegments(
  bridge: RuntimeProgressBridge | undefined,
  segments: RuntimeProgressSegment[]
) {
  const visibleSegments = segments.filter((segment) => segment.delta);
  if (visibleSegments.length === 0) return;

  bridge?.emit?.(visibleSegments);
}
