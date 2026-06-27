import { useMemo } from 'react';
import { getRoadmapTimelineDateLabels } from '@adieuu/shared';

export function RoadmapTimelineDateLabel({ dateKey }: { dateKey: string }) {
  const labels = useMemo(() => getRoadmapTimelineDateLabels(dateKey), [dateKey]);

  if (!labels.useHoverSwap) {
    return (
      <div className="roadmap-timeline-group-label roadmap-timeline-group-label--dated">
        {labels.full}
      </div>
    );
  }

  return (
    <div className="roadmap-timeline-group-label roadmap-timeline-group-label--dated roadmap-timeline-group-label--hover-swap">
      <span className="roadmap-timeline-group-label-relative">{labels.relative}</span>
      <span className="roadmap-timeline-group-label-full">{labels.full}</span>
    </div>
  );
}
