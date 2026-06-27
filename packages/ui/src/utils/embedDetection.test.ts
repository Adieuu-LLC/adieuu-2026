import { describe, expect, test } from 'bun:test';
import { extractYouTubeVideoId, classifyUrl, extractTld } from './embedDetection';

// ---------------------------------------------------------------------------
// extractYouTubeVideoId — valid YouTube URLs
// ---------------------------------------------------------------------------

describe('extractYouTubeVideoId', () => {
  const VALID_ID = 'dQw4w9WgXcQ';

  describe('youtube.com /watch', () => {
    test('standard watch URL', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
    });

    test('watch URL without www', () => {
      expect(extractYouTubeVideoId(`https://youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
    });

    test('watch URL with extra query params', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${VALID_ID}&t=42s`)).toBe(VALID_ID);
    });

    test('watch URL with v not first param', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/watch?feature=share&v=${VALID_ID}`)).toBe(VALID_ID);
    });

    test('http scheme', () => {
      expect(extractYouTubeVideoId(`http://www.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
    });

    test('trailing slash on /watch/', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/watch/?v=${VALID_ID}`)).toBe(VALID_ID);
    });
  });

  describe('youtube-nocookie.com', () => {
    test('embed URL', () => {
      expect(extractYouTubeVideoId(`https://www.youtube-nocookie.com/embed/${VALID_ID}`)).toBe(VALID_ID);
    });

    test('watch URL', () => {
      expect(extractYouTubeVideoId(`https://youtube-nocookie.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
    });
  });

  describe('youtube.com /embed', () => {
    test('standard embed URL', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/embed/${VALID_ID}`)).toBe(VALID_ID);
    });

    test('embed URL with query params', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/embed/${VALID_ID}?autoplay=1`)).toBe(VALID_ID);
    });
  });

  describe('youtube.com /shorts', () => {
    test('standard shorts URL', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/shorts/${VALID_ID}`)).toBe(VALID_ID);
    });
  });

  describe('youtu.be short URLs', () => {
    test('standard short URL', () => {
      expect(extractYouTubeVideoId(`https://youtu.be/${VALID_ID}`)).toBe(VALID_ID);
    });

    test('short URL with query params', () => {
      expect(extractYouTubeVideoId(`https://youtu.be/${VALID_ID}?t=30`)).toBe(VALID_ID);
    });

    test('www.youtu.be', () => {
      expect(extractYouTubeVideoId(`https://www.youtu.be/${VALID_ID}`)).toBe(VALID_ID);
    });
  });

  describe('subdomain variations', () => {
    test('m.youtube.com (mobile)', () => {
      expect(extractYouTubeVideoId(`https://m.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
    });

    test('music.youtube.com', () => {
      expect(extractYouTubeVideoId(`https://music.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // Rejections — non-YouTube hosts (security-critical)
  // ---------------------------------------------------------------------------

  describe('rejects non-YouTube hosts', () => {
    test('evil host with youtube.com in path', () => {
      expect(extractYouTubeVideoId(`https://evil.com/youtube.com/watch?v=${VALID_ID}`)).toBeNull();
    });

    test('evil subdomain of different TLD', () => {
      expect(extractYouTubeVideoId(`https://youtube.com.evil.com/watch?v=${VALID_ID}`)).toBeNull();
    });

    test('evil domain mimicking youtu.be', () => {
      expect(extractYouTubeVideoId(`https://notyoutu.be/${VALID_ID}`)).toBeNull();
    });

    test('completely unrelated URL', () => {
      expect(extractYouTubeVideoId('https://example.com/video/dQw4w9WgXcQ')).toBeNull();
    });

    test('URL with youtube in path but wrong host', () => {
      expect(extractYouTubeVideoId(`https://phishing.site/embed/${VALID_ID}`)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Rejections — invalid video IDs
  // ---------------------------------------------------------------------------

  describe('rejects invalid video IDs', () => {
    test('ID too short', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    test('ID too long', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQX')).toBeNull();
    });

    test('ID with invalid characters', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9W!XcQ')).toBeNull();
    });

    test('missing v param on /watch', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?feature=share')).toBeNull();
    });

    test('youtu.be with no path segment', () => {
      expect(extractYouTubeVideoId('https://youtu.be/')).toBeNull();
    });

    test('empty embed path', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    test('invalid URL string', () => {
      expect(extractYouTubeVideoId('not-a-url')).toBeNull();
    });

    test('empty string', () => {
      expect(extractYouTubeVideoId('')).toBeNull();
    });

    test('youtube.com homepage', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/')).toBeNull();
    });

    test('youtube.com channel page', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/@someuser')).toBeNull();
    });

    test('video ID with hyphens and underscores', () => {
      expect(extractYouTubeVideoId('https://youtu.be/a-B_c1D2e3f')).toBe('a-B_c1D2e3f');
    });
  });
});

// ---------------------------------------------------------------------------
// classifyUrl
// ---------------------------------------------------------------------------

describe('classifyUrl', () => {
  test('classifies YouTube URL as youtube type with videoId', () => {
    const result = classifyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toEqual({
      type: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  test('classifies generic https URL', () => {
    const result = classifyUrl('https://example.com/article');
    expect(result).toEqual({
      type: 'generic',
      url: 'https://example.com/article',
    });
  });

  test('classifies generic http URL', () => {
    const result = classifyUrl('http://example.com');
    expect(result).toEqual({
      type: 'generic',
      url: 'http://example.com',
    });
  });

  test('returns null for non-http URL', () => {
    expect(classifyUrl('ftp://files.example.com/data')).toBeNull();
  });

  test('non-YouTube host with youtube-like path gets generic, not youtube', () => {
    const result = classifyUrl('https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result?.type).toBe('generic');
    expect(result?.videoId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractTld
// ---------------------------------------------------------------------------

describe('extractTld', () => {
  test('strips www prefix', () => {
    expect(extractTld('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
  });

  test('returns hostname without www', () => {
    expect(extractTld('https://example.com/page')).toBe('example.com');
  });

  test('preserves subdomain other than www', () => {
    expect(extractTld('https://music.youtube.com/')).toBe('music.youtube.com');
  });

  test('returns null for invalid URL', () => {
    expect(extractTld('not a url')).toBeNull();
  });
});
