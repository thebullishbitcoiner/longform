import React from 'react';
import { EllipsisVerticalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import styles from './page.module.css';
import type { CommentData } from './commentTypes';

const closeAllCommentMenus = () => {
  const menus = document.querySelectorAll(`.${styles.commentMenu}`);
  menus.forEach((menu) => {
    (menu as HTMLElement).style.display = 'none';
  });
};

const FallbackAvatar = ({ name, pubkey }: { name?: string; pubkey: string }) => {
  const initials = name ? name.slice(0, 2).toUpperCase() : pubkey.slice(0, 2).toUpperCase();
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const colorIndex = pubkey.charCodeAt(0) % colors.length;

  return (
    <div className={styles.fallbackAvatar} style={{ backgroundColor: colors[colorIndex] }}>
      {initials}
    </div>
  );
};

interface CommentThreadProps {
  comments: CommentData[];
  showReplyForm: string | null;
  setShowReplyForm: (id: string | null) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  isAuthenticated: boolean;
  handleReplyButtonClick: (id: string) => void;
  handleReplySubmit: (id: string) => void;
  isSubmittingReply: boolean;
  processCommentContent: (content: string) => React.ReactNode;
  openCommentJson: (id: string) => void;
  depth?: number;
}

interface CommentItemProps extends Omit<CommentThreadProps, 'comments' | 'depth'> {
  comment: CommentData;
  depth: number;
}

const CommentItem = React.memo(({
  comment,
  showReplyForm,
  setShowReplyForm,
  replyText,
  setReplyText,
  isAuthenticated,
  handleReplyButtonClick,
  handleReplySubmit,
  isSubmittingReply,
  processCommentContent,
  openCommentJson,
  depth,
}: CommentItemProps) => {
  const isReply = depth > 0;

  return (
    <div className={`${styles.commentContent} ${isReply ? styles.commentReply : ''}`}>
      <div className={styles.commentHeader}>
        <div className={styles.commentAuthor}>
          {comment.authorPicture ? (
            <Image
              src={comment.authorPicture}
              alt="Author"
              width={32}
              height={32}
              className={styles.commentAuthorAvatar}
            />
          ) : (
            <FallbackAvatar name={comment.authorName} pubkey={comment.pubkey} />
          )}
          <span className={styles.commentAuthorName}>
            {comment.authorName || comment.pubkey.slice(0, 8) + '...'}
          </span>
        </div>
        <div className={styles.commentHeaderRight}>
          <span className={styles.commentDate}>
            {new Date(comment.created_at * 1000).toLocaleDateString()}
          </span>
          <div className={styles.commentActions}>
            <button
              className={styles.replyButton}
              onClick={(e) => {
                e.stopPropagation();
                handleReplyButtonClick(comment.id);
              }}
              disabled={!isAuthenticated}
            >
              Reply
            </button>
            <div className={styles.commentMenuWrapper}>
              <button
                className={styles.commentMenuButton}
                onClick={(e) => {
                  e.stopPropagation();
                  closeAllCommentMenus();
                  const menu = e.currentTarget.nextSibling as HTMLElement;
                  if (menu) {
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                  }
                }}
              >
                <EllipsisVerticalIcon className={styles.commentMenuIcon} />
              </button>
              <div className={styles.commentMenu} onClick={(e) => e.stopPropagation()}>
                <button className={styles.commentMenuItem} onClick={() => openCommentJson(comment.id)}>View JSON</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.commentText}>{processCommentContent(comment.content)}</div>

      {showReplyForm === comment.id && isAuthenticated && (
        <div className={styles.replyForm}>
          <div className={styles.replyFormHeader}>
            <h5>Reply to {comment.authorName || comment.pubkey.slice(0, 8) + '...'}</h5>
            <button
              className={styles.replyFormClose}
              onClick={() => {
                setShowReplyForm(null);
                setReplyText('');
              }}
            >
              <XMarkIcon className={styles.replyFormCloseIcon} />
            </button>
          </div>
          <textarea
            className={styles.replyTextarea}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            maxLength={1000}
          />
          <div className={styles.replyFormFooter}>
            <span className={styles.replyCharCount}>{replyText.length}/1000</span>
            <div className={styles.replyFormActions}>
              <button
                className={styles.replyCancelButton}
                onClick={() => {
                  setShowReplyForm(null);
                  setReplyText('');
                }}
                disabled={isSubmittingReply}
              >
                Cancel
              </button>
              <button
                className={styles.replySubmitButton}
                onClick={() => handleReplySubmit(comment.id)}
                disabled={!replyText.trim() || isSubmittingReply}
              >
                {isSubmittingReply ? 'Posting...' : 'Post Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

CommentItem.displayName = 'CommentItem';

const CommentThread = React.memo(({
  comments,
  showReplyForm,
  setShowReplyForm,
  replyText,
  setReplyText,
  isAuthenticated,
  handleReplyButtonClick,
  handleReplySubmit,
  isSubmittingReply,
  processCommentContent,
  openCommentJson,
  depth = 0,
}: CommentThreadProps) => {
  const maxDepth = 4;

  return (
    <div className={styles.commentThread}>
      {comments.map((comment) => (
        <div key={comment.id} className={depth === 0 ? styles.commentItem : ''} data-depth={depth}>
          <CommentItem
            comment={comment}
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
            depth={depth}
          />

          {depth < maxDepth && comment.children.length > 0 && (
            <div className={styles.commentChildren}>
              <CommentThread
                comments={comment.children}
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
                depth={depth + 1}
              />
            </div>
          )}

          {depth >= maxDepth && comment.children.length > 0 && (
            <div className={styles.collapsedThread}>
              <span className={styles.collapsedIndicator}>+{comment.children.length} more replies</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

CommentThread.displayName = 'CommentThread';

export default CommentThread;
