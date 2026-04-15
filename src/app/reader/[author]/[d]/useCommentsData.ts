import { useCallback, useEffect, useState } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type NDK from '@nostr-dev-kit/ndk';
import toast from 'react-hot-toast';
import { type CommentData, findCommentById } from './commentTypes';
import { KIND_LONGFORM_ARTICLE, KIND_NIP22_COMMENT, KIND_TEXT_NOTE, longformArticleCoordinate } from '@/nostr/kinds';

interface UseCommentsDataParams {
  readNdk: NDK | null;
  writeNdk: NDK | null;
  postId?: string;
  postPubkey?: string;
  postDTag?: string;
  isAuthenticated: boolean;
  dParam?: string;
  getAuthorProfile: (pubkey: string) => { displayName?: string; name?: string; image?: string; picture?: string } | undefined;
}

export function useCommentsData({
  readNdk,
  writeNdk,
  postId,
  postPubkey,
  postDTag,
  isAuthenticated,
  dParam,
  getAuthorProfile,
}: UseCommentsDataParams) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const fetchComments = useCallback(
    async (targetPostId: string) => {
      if (!readNdk) return;

      setIsLoadingComments(true);

      try {
        const currentDTag = dParam ? decodeURIComponent(dParam) : undefined;
        const aCoordinate = postPubkey && currentDTag ? longformArticleCoordinate(postPubkey, currentDTag) : undefined;

        const [nip22ByE, nip22ByEUpper, nip22ByA, kind1ByE, kind1ByEUpper, kind1ByA] = await Promise.all([
          readNdk.fetchEvents({ kinds: [KIND_NIP22_COMMENT], '#e': [targetPostId], limit: 200 }),
          readNdk.fetchEvents({ kinds: [KIND_NIP22_COMMENT], '#E': [targetPostId], limit: 200 }),
          aCoordinate ? readNdk.fetchEvents({ kinds: [KIND_NIP22_COMMENT], '#a': [aCoordinate], limit: 200 }) : Promise.resolve(new Set()),
          readNdk.fetchEvents({ kinds: [KIND_TEXT_NOTE], '#e': [targetPostId], limit: 500 }),
          readNdk.fetchEvents({ kinds: [KIND_TEXT_NOTE], '#E': [targetPostId], limit: 500 }),
          aCoordinate ? readNdk.fetchEvents({ kinds: [KIND_TEXT_NOTE], '#a': [aCoordinate], limit: 500 }) : Promise.resolve(new Set()),
        ]);

        const combined: NDKEvent[] = [];
        const seen = new Set<string>();
        for (const ev of nip22ByE) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
        for (const ev of nip22ByEUpper) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
        for (const ev of nip22ByA as Set<NDKEvent>) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
        for (const ev of kind1ByE) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
        for (const ev of kind1ByEUpper) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
        for (const ev of kind1ByA as Set<NDKEvent>) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }

        const allComments: CommentData[] = combined.map((ev) => {
          const rootEventId = ev.tags.find((tag) => tag[0] === 'E')?.[1];
          const eTags = ev.tags.filter((tag) => tag[0] === 'e');
          const replyTag = eTags.find((tag) => tag[3] === 'reply');
          const rootTag = eTags.find((tag) => tag[3] === 'root');

          let parentId: string | undefined;
          if (replyTag?.[1] && replyTag[1] !== rootEventId) {
            parentId = replyTag[1];
          } else if (rootTag?.[1] && rootTag[1] !== rootEventId) {
            parentId = rootTag[1];
          } else {
            const eTag = eTags.find((tag) => tag[1] && tag[1] !== rootEventId);
            if (eTag?.[1]) {
              parentId = eTag[1];
            }
          }

          return {
            id: ev.id,
            pubkey: ev.pubkey,
            content: ev.content,
            created_at: ev.created_at,
            authorName: undefined,
            authorPicture: undefined,
            kind: ev.kind,
            event: ev,
            parentId,
            children: [],
            depth: 0,
          };
        });

        allComments.sort((a, b) => b.created_at - a.created_at);

        const commentMap = new Map<string, CommentData>();
        const rootComments: CommentData[] = [];
        allComments.forEach((comment) => commentMap.set(comment.id, comment));
        allComments.forEach((comment) => {
          if (comment.parentId && commentMap.has(comment.parentId)) {
            const parent = commentMap.get(comment.parentId)!;
            parent.children.push(comment);
            comment.depth = parent.depth + 1;
          } else {
            rootComments.push(comment);
          }
        });

        const sortComments = (commentList: CommentData[]) => {
          commentList.sort((a, b) => b.created_at - a.created_at);
          commentList.forEach((comment) => {
            if (comment.children.length > 0) {
              comment.children.sort((a, b) => a.created_at - b.created_at);
              sortComments(comment.children);
            }
          });
        };
        sortComments(rootComments);

        setComments(rootComments);

        setIsLoadingProfiles(true);
        const uniquePubkeys = new Set(allComments.map((comment) => comment.pubkey));
        const profileResults = await Promise.all(
          Array.from(uniquePubkeys).map(async (pubkey) => {
            try {
              const cachedProfile = getAuthorProfile(pubkey);
              if (cachedProfile) return { pubkey, profile: cachedProfile };
              const user = readNdk.getUser({ pubkey });
              const profile = await user.fetchProfile();
              return { pubkey, profile };
            } catch (error) {
              console.error('Error fetching profile for pubkey:', pubkey, error);
              return { pubkey, profile: null };
            }
          })
        );

        const profileMap = new Map<string, { displayName?: string; name?: string; image?: string; picture?: string }>();
        profileResults.forEach(({ pubkey, profile }) => {
          if (profile) profileMap.set(pubkey, profile);
        });

        const updateCommentProfiles = (commentList: CommentData[]) => {
          commentList.forEach((comment) => {
            const profile = profileMap.get(comment.pubkey);
            if (profile) {
              comment.authorName = profile.displayName || profile.name;
              comment.authorPicture = profile.image || profile.picture;
            }
            if (comment.children.length > 0) updateCommentProfiles(comment.children);
          });
        };

        updateCommentProfiles(rootComments);
        setComments([...rootComments]);
        setIsLoadingProfiles(false);
      } catch (error) {
        console.error('Error fetching comments:', error);
      } finally {
        setIsLoadingComments(false);
      }
    },
    [dParam, getAuthorProfile, postPubkey, readNdk]
  );

  const handleCommentButtonClick = useCallback(() => {
    if (!isAuthenticated) {
      toast.error('Please log in to comment on this post.');
      return;
    }
    setShowCommentForm(true);
  }, [isAuthenticated]);

  const handleReplyButtonClick = useCallback(
    (commentId: string) => {
      if (!isAuthenticated) {
        toast.error('Please log in to reply to this comment.');
        return;
      }
      setShowReplyForm(commentId);
    },
    [isAuthenticated]
  );

  const handleCommentSubmit = useCallback(async () => {
    if (!commentText.trim() || !postId || !postPubkey || !isAuthenticated) return;
    if (!writeNdk) {
      toast.error('No connection available. Please try again.');
      return;
    }

    setIsSubmittingComment(true);
    try {
      const ndkEvent = new NDKEvent(writeNdk);
      ndkEvent.kind = KIND_NIP22_COMMENT;
      ndkEvent.content = commentText.trim();

      const dTag = postDTag || (dParam ? decodeURIComponent(dParam) : undefined);
      const aCoordinate = longformArticleCoordinate(postPubkey, dTag || postId);
      ndkEvent.tags = [
        ['K', String(KIND_LONGFORM_ARTICLE)],
        ['P', postPubkey],
        ['E', postId],
        ['A', aCoordinate],
        ['k', String(KIND_LONGFORM_ARTICLE)],
        ['p', postPubkey],
        ['e', postId],
        ['a', aCoordinate],
        ['client', 'Longform._'],
      ];

      ndkEvent.created_at = Math.floor(Date.now() / 1000);
      await ndkEvent.publish();
      setCommentText('');
      setShowCommentForm(false);
      await fetchComments(postId);
      toast.success('Comment posted successfully!');
    } catch (error) {
      toast.error(`Error posting comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmittingComment(false);
    }
  }, [commentText, dParam, fetchComments, isAuthenticated, postDTag, postId, postPubkey, writeNdk]);

  const handleReplySubmit = useCallback(
    async (parentCommentId: string) => {
      if (!replyText.trim() || !postId || !postPubkey || !isAuthenticated) return;
      if (!writeNdk) {
        toast.error('No connection available. Please try again.');
        return;
      }

      setIsSubmittingReply(true);
      try {
        const parentComment = findCommentById(comments, parentCommentId);
        if (!parentComment) {
          toast.error('Parent comment not found');
          return;
        }

        const ndkEvent = new NDKEvent(writeNdk);
        ndkEvent.kind = KIND_NIP22_COMMENT;
        ndkEvent.content = replyText.trim();

        const dTag = postDTag || (dParam ? decodeURIComponent(dParam) : undefined);
        const aCoordinate = longformArticleCoordinate(postPubkey, dTag || postId);
        ndkEvent.tags = [
          ['E', postId],
          ['K', String(KIND_LONGFORM_ARTICLE)],
          ['P', postPubkey],
          ['A', aCoordinate],
          ['e', parentCommentId],
          ['k', parentComment.kind.toString()],
          ['p', parentComment.pubkey],
          ['client', 'Longform._'],
        ];

        ndkEvent.created_at = Math.floor(Date.now() / 1000);
        await ndkEvent.publish();
        setReplyText('');
        setShowReplyForm(null);
        await fetchComments(postId);
        toast.success('Reply posted successfully!');
      } catch (error) {
        toast.error(`Error posting reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsSubmittingReply(false);
      }
    },
    [comments, dParam, fetchComments, isAuthenticated, postDTag, postId, postPubkey, replyText, writeNdk]
  );

  useEffect(() => {
    if (postId) {
      fetchComments(postId);
    }
  }, [fetchComments, postId]);

  return {
    comments,
    isLoadingComments,
    isLoadingProfiles,
    showCommentForm,
    setShowCommentForm,
    commentText,
    setCommentText,
    isSubmittingComment,
    handleCommentSubmit,
    handleCommentButtonClick,
    showReplyForm,
    setShowReplyForm,
    replyText,
    setReplyText,
    isSubmittingReply,
    handleReplySubmit,
    handleReplyButtonClick,
    fetchComments,
  };
}
