import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

const { RoadmapTimelineFooter, RoadmapTodayMarker } = await import('./RoadmapTodayMarker');

describe('RoadmapTimeline components', () => {
  test('RoadmapTimelineFooter links to the features page', () => {
    const html = renderToStaticMarkup(<RoadmapTimelineFooter />);

    expect(html).toContain('roadmap-timeline-footer');
    expect(html).toContain('href="/feedback"');
    expect(html).toContain('about.roadmap.footerCta');
  });

  test('RoadmapTodayMarker renders today label and timeline dot', () => {
    const html = renderToStaticMarkup(<RoadmapTodayMarker />);

    expect(html).toContain('data-roadmap-today');
    expect(html).toContain('about.roadmap.today');
    expect(html).toContain('roadmap-timeline-marker--today');
  });
});
