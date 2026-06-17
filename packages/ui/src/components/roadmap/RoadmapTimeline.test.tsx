import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

const { RoadmapTimelineFooter } = await import('./RoadmapTodayMarker');

describe('RoadmapTimeline components', () => {
  test('RoadmapTimelineFooter links to the features page', () => {
    const html = renderToStaticMarkup(<RoadmapTimelineFooter />);

    expect(html).toContain('roadmap-timeline-footer');
    expect(html).toContain('href="/feedback"');
    expect(html).toContain('about.roadmap.footerCta');
  });
});
