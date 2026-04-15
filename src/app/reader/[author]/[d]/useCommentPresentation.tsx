import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import type NDK from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import type { CommentData } from './commentTypes';

interface UseCommentPresentationParams {
  comments: CommentData[];
  ndk: NDK | null;
  getAuthorProfile: (pubkey: string) => { displayName?: string; name?: string } | undefined;
  nostrLinkClassName: string;
}

export function useCommentPresentation({
  comments,
  ndk,
  getAuthorProfile,
  nostrLinkClassName,
}: UseCommentPresentationParams) {
  const processCommentContent = useCallback(
    (content: string) => {
      if (!content || typeof content !== 'string') {
        return content;
      }

      const nostrLinkRegex = /(nostr:)?(nprofile1[a-zA-Z0-9]+|npub1[a-zA-Z0-9]+|note1[a-zA-Z0-9]+|nevent1[a-zA-Z0-9]+)/g;
      const elements: (string | React.ReactElement)[] = [];
      let lastIndex = 0;
      let match;

      while ((match = nostrLinkRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          elements.push(content.slice(lastIndex, match.index));
        }

        const fullMatch = match[0];
        const cleanPart = fullMatch.replace(/^nostr:/, '');

        try {
          const decoded = nip19.decode(cleanPart);

          switch (decoded.type) {
            case 'nprofile': {
              const pubkey = decoded.data.pubkey;
              if (pubkey) {
                const profileUrl = `/profile/${nip19.npubEncode(pubkey)}`;
                const cachedProfile = getAuthorProfile(pubkey);
                const displayName = cachedProfile?.displayName || cachedProfile?.name;
                elements.push(
                  <Link
                    key={`nostr-${match.index}`}
                    href={profileUrl}
                    className={nostrLinkClassName}
                    onClick={(e) => e.stopPropagation()}
                    title={fullMatch}
                  >
                    {displayName ? `@${displayName}` : `@${pubkey.slice(0, 8)}...`}
                  </Link>
                );
              } else {
                elements.push(fullMatch);
              }
              break;
            }

            case 'npub': {
              const npubUrl = `/profile/${cleanPart}`;
              const npubPubkey = decoded.data;
              const npubCachedProfile = getAuthorProfile(npubPubkey);
              const npubDisplayName = npubCachedProfile?.displayName || npubCachedProfile?.name;
              elements.push(
                <Link
                  key={`nostr-${match.index}`}
                  href={npubUrl}
                  className={nostrLinkClassName}
                  onClick={(e) => e.stopPropagation()}
                  title={fullMatch}
                >
                  {npubDisplayName ? `@${npubDisplayName}` : `@${npubPubkey.slice(0, 8)}...`}
                </Link>
              );
              break;
            }

            case 'note':
            case 'nevent': {
              const eventUrl = `https://njump.me/${cleanPart}`;
              elements.push(
                <a
                  key={`nostr-${match.index}`}
                  href={eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={nostrLinkClassName}
                  onClick={(e) => e.stopPropagation()}
                >
                  {fullMatch}
                </a>
              );
              break;
            }

            default:
              elements.push(fullMatch);
          }
        } catch (error) {
          console.error('Error decoding nostr link:', fullMatch, error);
          elements.push(fullMatch);
        }

        lastIndex = match.index + fullMatch.length;
      }

      if (lastIndex < content.length) {
        elements.push(content.slice(lastIndex));
      }

      return elements.length > 0 ? elements : content;
    },
    [getAuthorProfile, nostrLinkClassName]
  );

  useEffect(() => {
    if (comments.length === 0 || !ndk) return;

    const nostrProfileRegex = /(nostr:)?(nprofile1[a-zA-Z0-9]+|npub1[a-zA-Z0-9]+)/g;
    const nostrProfileLinks = new Set<string>();

    const extractNostrProfiles = (commentList: CommentData[]) => {
      commentList.forEach((comment) => {
        const matches = comment.content.match(nostrProfileRegex);
        if (matches) {
          matches.forEach((m) => nostrProfileLinks.add(m));
        }
        if (comment.children.length > 0) {
          extractNostrProfiles(comment.children);
        }
      });
    };

    extractNostrProfiles(comments);

    nostrProfileLinks.forEach((nostrLink) => {
      try {
        const cleanLink = nostrLink.replace(/^nostr:/, '');
        const decoded = nip19.decode(cleanLink);

        if (decoded.type === 'nprofile') {
          const pubkey = decoded.data.pubkey;
          if (pubkey && !getAuthorProfile(pubkey)) {
            const user = ndk.getUser({ pubkey });
            user.fetchProfile().catch((error) => {
              console.error('Error fetching profile for nprofile link:', error);
            });
          }
        } else if (decoded.type === 'npub') {
          const pubkey = decoded.data;
          if (pubkey && !getAuthorProfile(pubkey)) {
            const user = ndk.getUser({ pubkey });
            user.fetchProfile().catch((error) => {
              console.error('Error fetching profile for npub link:', error);
            });
          }
        }
      } catch (error) {
        console.error('Error decoding nostr profile link:', error);
      }
    });
  }, [comments, getAuthorProfile, ndk]);

  return { processCommentContent };
}
