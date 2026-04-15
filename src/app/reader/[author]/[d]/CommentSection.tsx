import React from 'react';
import { ChatBubbleLeftIcon, XMarkIcon } from '@heroicons/react/24/outline';
import styles from './page.module.css';
import type { CommentData } from './commentTypes';
import CommentThread from './CommentThread';

interface CommentSectionProps {
  totalComments: number;
  isLoadingProfiles: boolean;
  isSubmittingComment: boolean;
  isAuthenticated: boolean;
  handleCommentButtonClick: () => void;
  showCommentForm: boolean;
  setShowCommentForm: (show: boolean) => void;
  commentText: string;
  setCommentText: (text: string) => void;
  handleCommentSubmit: () => void;
  isLoadingComments: boolean;
  comments: CommentData[];
  showReplyForm: string | null;
  setShowReplyForm: (id: string | null) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  handleReplyButtonClick: (id: string) => void;
  handleReplySubmit: (id: string) => void;
  isSubmittingReply: boolean;
  processCommentContent: (content: string) => React.ReactNode;
  openCommentJson: (id: string) => void;
}

export default function CommentSection({
  totalComments,
  isLoadingProfiles,
  isSubmittingComment,
  isAuthenticated,
  handleCommentButtonClick,
  showCommentForm,
  setShowCommentForm,
  commentText,
  setCommentText,
  handleCommentSubmit,
  isLoadingComments,
  comments,
  showReplyForm,
  setShowReplyForm,
  replyText,
  setReplyText,
  handleReplyButtonClick,
  handleReplySubmit,
  isSubmittingReply,
  processCommentContent,
  openCommentJson,
}: CommentSectionProps) {
  return (
    <div className={styles.commentSection}>
      <div className={styles.commentSectionHeader}>
        <h3 className={styles.commentSectionTitle}>Comments ({totalComments})</h3>
        <div className={styles.commentSectionActions}>
          {isLoadingProfiles && (
            <div className={styles.profileLoadingIndicator}>
              <div className={styles.profileLoadingSpinner}></div>
              <span>Loading profiles...</span>
            </div>
          )}
          <button
            className={styles.commentButton}
            onClick={handleCommentButtonClick}
            disabled={isSubmittingComment}
          >
            {isAuthenticated ? 'Add Comment' : 'Login to Comment'}
          </button>
        </div>
      </div>

      {showCommentForm && isAuthenticated && (
        <div className={styles.commentForm}>
          <div className={styles.commentFormHeader}>
            <h4>Write a comment</h4>
            <button
              className={styles.commentFormClose}
              onClick={() => {
                setShowCommentForm(false);
                setCommentText('');
              }}
            >
              <XMarkIcon className={styles.commentFormCloseIcon} />
            </button>
          </div>
          <textarea
            className={styles.commentTextarea}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Share your thoughts on this post..."
            rows={4}
            maxLength={2000}
          />
          <div className={styles.commentFormFooter}>
            <span className={styles.commentCharCount}>{commentText.length}/2000</span>
            <div className={styles.commentFormActions}>
              <button
                className={styles.commentCancelButton}
                onClick={() => {
                  setShowCommentForm(false);
                  setCommentText('');
                }}
                disabled={isSubmittingComment}
              >
                Cancel
              </button>
              <button
                className={styles.commentSubmitButton}
                onClick={handleCommentSubmit}
                disabled={!commentText.trim() || isSubmittingComment}
              >
                {isSubmittingComment ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoadingComments ? (
        <div className={styles.commentLoading}>
          <div className={styles.commentLoadingSpinner}></div>
          <span>Loading comments...</span>
        </div>
      ) : comments.length === 0 ? (
        <div className={styles.noComments}>
          <ChatBubbleLeftIcon className={styles.noCommentsIcon} />
          <p>No comments yet</p>
          <p className={styles.noCommentsSubtext}>Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className={styles.commentList}>
          <CommentThread
            comments={comments}
            showReplyForm={showReplyForm}
            setShowReplyForm={setShowReplyForm}
            replyText={replyText}
            setReplyText={setReplyText}
            isAuthenticated={isAuthenticated}
            handleReplyButtonClick={handleReplyButtonClick}
            handleReplySubmit={handleReplySubmit}
            isSubmittingReply={isSubmittingReply}
            processCommentContent={processCommentContent}
            openCommentJson={openCommentJson}
          />
        </div>
      )}
    </div>
  );
}
