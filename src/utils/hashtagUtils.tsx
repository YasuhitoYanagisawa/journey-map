import React from 'react';

/**
 * Parses text content and renders hashtags as clickable links.
 * Hashtags are detected with the pattern #word (supports Japanese, alphanumeric, underscore).
 */
export const renderWithHashtags = (
  text: string,
  onHashtagClick?: (tag: string) => void
): React.ReactNode[] => {
  // Match #hashtag (supports Japanese characters, alphanumeric, underscore)
  const hashtagRegex = /(#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]+)/g;
  const parts = text.split(hashtagRegex);

  return parts.map((part, index) => {
    if (hashtagRegex.test(part)) {
      // Reset lastIndex since we reuse the regex
      hashtagRegex.lastIndex = 0;
      return (
        <button
          key={index}
          onClick={(e) => {
            e.stopPropagation();
            onHashtagClick?.(part.slice(1)); // Remove the # prefix
          }}
          className="text-primary hover:underline font-medium"
        >
          {part}
        </button>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

/**
 * Extracts hashtag strings from text content.
 */
export const extractHashtags = (text: string): string[] => {
  const hashtagRegex = /#([\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = hashtagRegex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  return [...new Set(tags)];
};
