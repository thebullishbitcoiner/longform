import React, { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './page.module.css';

interface MarkdownPostContentProps {
  processedContent: string;
  originalContent: string;
  isLoadingAdditionalData: boolean;
  postContentRef: React.RefObject<HTMLDivElement | null>;
  endOfContentRef: React.RefObject<HTMLDivElement | null>;
}

const videoPatterns = [
  /youtube\.com\/watch\?v=/,
  /youtu\.be\//,
  /vimeo\.com\//,
  /dailymotion\.com\/video\//,
  /\.mp4$/,
  /\.webm$/,
  /\.ogg$/,
  /\.mov$/,
  /\.avi$/,
  /\.mkv$/,
  /\.wmv$/,
  /\.flv$/,
  /\.m4v$/,
  /\.3gp$/,
  /\.ogv$/,
];

const directVideoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.m4v', '.3gp', '.ogv'];

const isVideoUrl = (url: string): boolean => videoPatterns.some((pattern) => pattern.test(url));

const getVideoEmbedUrl = (url: string): string | null => {
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) return `https://www.youtube.com/embed/${youtubeMatch[1]}`;

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  const dailymotionMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  if (dailymotionMatch) return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;

  if (directVideoExtensions.some((ext) => url.toLowerCase().includes(ext))) return url;

  return null;
};

export default function MarkdownPostContent({
  processedContent,
  originalContent,
  isLoadingAdditionalData,
  postContentRef,
  endOfContentRef,
}: MarkdownPostContentProps) {
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.href;
    if (href.startsWith('nostr:')) {
      e.preventDefault();
    }
  };

  const renderImg = useCallback(({ src, alt }: React.ComponentPropsWithoutRef<'img'>) => {
    if (!src || typeof src !== 'string') return null;
    return (
      <img
        src={src}
        alt={alt || 'Image'}
        className={styles.markdownImage}
        style={{
          width: '100%',
          height: 'auto',
          maxWidth: '100%',
          display: 'block',
          opacity: 1,
          transition: 'none',
        }}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
      />
    );
  }, []);

  const markdownComponents = useMemo(
    () => ({
      img: renderImg,
      a: ({ children, ...props }: React.ComponentPropsWithoutRef<'a'>) => {
        const isNostrLink = props.href?.includes('njump.me');
        const isVideoLink = props.href ? isVideoUrl(props.href) : false;
        const isImageUrl = props.href?.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i);

        if (isImageUrl && props.href) {
          return renderImg({ src: props.href, alt: typeof children === 'string' ? children : 'Image' });
        }

        if (isVideoLink && props.href) {
          const embedUrl = getVideoEmbedUrl(props.href);
          if (embedUrl) {
            return (
              <span className={styles.videoContainer}>
                {embedUrl.includes('youtube.com/embed') || embedUrl.includes('vimeo.com') || embedUrl.includes('dailymotion.com') ? (
                  <iframe
                    src={embedUrl}
                    title="Video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className={styles.videoEmbed}
                  />
                ) : (
                  <video controls className={styles.videoPlayer} preload="metadata">
                    <source src={embedUrl} type="video/mp4" />
                    <source src={embedUrl} type="video/webm" />
                    <source src={embedUrl} type="video/ogg" />
                    Your browser does not support the video tag.
                  </video>
                )}
                <span className={styles.videoCaption}>
                  <a href={props.href} target="_blank" rel="noopener noreferrer" className={styles.videoLink}>
                    {children}
                  </a>
                </span>
              </span>
            );
          }
        }

        const isRegularLink = props.href?.startsWith('http://') || props.href?.startsWith('https://');
        const linkClass = isNostrLink ? styles.nostrLink : isRegularLink ? styles.regularLink : styles.link;
        return (
          <a {...props} onClick={handleLinkClick} className={linkClass} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    }),
    [renderImg]
  );

  return (
    <div
      className={styles.postContent}
      ref={postContentRef}
      style={{
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text',
      }}
    >
      {isLoadingAdditionalData && processedContent === originalContent && (
        <div className={styles.processingIndicator}>Processing content...</div>
      )}

      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {processedContent}
      </ReactMarkdown>
      <div ref={endOfContentRef} style={{ height: '1px' }} />
    </div>
  );
}
