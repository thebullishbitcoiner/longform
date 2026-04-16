import React from 'react';
import { EllipsisVerticalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import styles from './page.module.css';
import type { ReactionData, RepostData, ZapData } from './interactionTypes';

const FallbackAvatar = ({ name, pubkey }: { name?: string; pubkey: string }) => {
  const initials = name ? name.slice(0, 2).toUpperCase() : pubkey.slice(0, 2).toUpperCase();
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const colorIndex = pubkey.charCodeAt(0) % colors.length;

  return (
    <div className={styles.modalFallbackAvatar} style={{ backgroundColor: colors[colorIndex] }}>
      {initials}
    </div>
  );
};

interface InteractionModalsProps {
  showZapsModal: boolean;
  setShowZapsModal: (open: boolean) => void;
  isLoadingZaps: boolean;
  zapData: ZapData[];
  openZapMenuId: string | null;
  handleZapMenuToggle: (zapId: string) => void;
  onZapJson: (zap: ZapData) => void;

  showReactionsModal: boolean;
  setShowReactionsModal: (open: boolean) => void;
  isLoadingReactions: boolean;
  reactionData: ReactionData[];
  openReactionMenuId: string | null;
  handleReactionMenuToggle: (id: string) => void;
  onReactionJson: (reaction: ReactionData) => void;
  renderReactionContentJSX: (content: string, event?: ReactionData['event']) => React.ReactNode;

  showRepostsModal: boolean;
  setShowRepostsModal: (open: boolean) => void;
  isLoadingReposts: boolean;
  repostData: RepostData[];
  onRepostJson: (repost: RepostData) => void;
}

export default function InteractionModals({
  showZapsModal,
  setShowZapsModal,
  isLoadingZaps,
  zapData,
  openZapMenuId,
  handleZapMenuToggle,
  onZapJson,
  showReactionsModal,
  setShowReactionsModal,
  isLoadingReactions,
  reactionData,
  openReactionMenuId,
  handleReactionMenuToggle,
  onReactionJson,
  renderReactionContentJSX,
  showRepostsModal,
  setShowRepostsModal,
  isLoadingReposts,
  repostData,
  onRepostJson,
}: InteractionModalsProps) {
  return (
    <>
      {showZapsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowZapsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Zaps</h2>
              <button className={styles.modalCloseButton} onClick={() => setShowZapsModal(false)}>
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {isLoadingZaps ? (
                <div className={styles.modalLoading}>Loading zaps...</div>
              ) : zapData.length === 0 ? (
                <div className={styles.modalEmpty}>No zaps yet</div>
              ) : (
                <div className={styles.zapList}>
                  {zapData.map((zap) => (
                    <div key={zap.id} className={styles.zapItem}>
                      <div className={styles.zapItemAuthor}>
                        {zap.authorPicture ? (
                          <Image
                            src={zap.authorPicture}
                            alt="Author"
                            width={28}
                            height={28}
                            className={styles.modalAuthorAvatar}
                          />
                        ) : (
                          <FallbackAvatar name={zap.authorName} pubkey={zap.pubkey} />
                        )}
                        <span className={styles.zapAuthorName}>
                          {zap.authorName || `${zap.pubkey.slice(0, 8)}...`}
                        </span>
                      </div>
                      <span className={styles.zapAmount}>⚡ {zap.amount} sats</span>
                      <div className={styles.reactionRight}>
                        <div className={styles.reactionMenuWrapper}>
                          <button
                            className={styles.reactionMenuButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleZapMenuToggle(zap.id);
                            }}
                          >
                            <EllipsisVerticalIcon className={styles.reactionMenuIcon} />
                          </button>
                          <div
                            className={styles.reactionMenu}
                            style={{ display: openZapMenuId === zap.id ? 'block' : 'none' }}
                            data-zap-menu={zap.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button className={styles.reactionMenuItem} onClick={() => onZapJson(zap)}>
                              View JSON
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showReactionsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowReactionsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Reactions</h2>
              <button className={styles.modalCloseButton} onClick={() => setShowReactionsModal(false)}>
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {isLoadingReactions ? (
                <div className={styles.modalLoading}>Loading reactions...</div>
              ) : reactionData.length === 0 ? (
                <div className={styles.modalEmpty}>No reactions yet</div>
              ) : (
                <div className={styles.reactionList}>
                  {reactionData.map((reaction) => (
                    <div key={reaction.id} className={styles.reactionItem}>
                      <div className={styles.reactionLeft}>
                        {reaction.authorPicture ? (
                          <Image
                            src={reaction.authorPicture}
                            alt="Author"
                            width={28}
                            height={28}
                            className={styles.modalAuthorAvatar}
                          />
                        ) : (
                          <FallbackAvatar name={reaction.authorName} pubkey={reaction.pubkey} />
                        )}
                        <span className={styles.reactionAuthorName}>
                          {reaction.authorName || `${reaction.pubkey.slice(0, 8)}...`}
                        </span>
                      </div>
                      <span className={styles.reactionItemContent}>
                        <span className={styles.reactionIcon}>
                          {renderReactionContentJSX(reaction.content, reaction.event)}
                        </span>
                      </span>
                      <div className={styles.reactionRight}>
                        <div className={styles.reactionMenuWrapper}>
                          <button
                            className={styles.reactionMenuButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReactionMenuToggle(reaction.id);
                            }}
                          >
                            <EllipsisVerticalIcon className={styles.reactionMenuIcon} />
                          </button>
                          <div
                            className={styles.reactionMenu}
                            style={{ display: openReactionMenuId === reaction.id ? 'block' : 'none' }}
                            data-reaction-menu={reaction.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button className={styles.reactionMenuItem} onClick={() => onReactionJson(reaction)}>
                              View JSON
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRepostsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRepostsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Reposts</h2>
              <button className={styles.modalCloseButton} onClick={() => setShowRepostsModal(false)}>
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {isLoadingReposts ? (
                <div className={styles.modalLoading}>Loading reposts...</div>
              ) : repostData.length === 0 ? (
                <div className={styles.modalEmpty}>No reposts yet</div>
              ) : (
                <div className={styles.reactionList}>
                  {repostData.map((repost) => (
                    <div key={repost.id} className={styles.reactionItem}>
                      <div className={styles.reactionLeft}>
                        {repost.authorPicture ? (
                          <Image
                            src={repost.authorPicture}
                            alt="Author"
                            width={28}
                            height={28}
                            className={styles.modalAuthorAvatar}
                          />
                        ) : (
                          <FallbackAvatar name={repost.authorName} pubkey={repost.pubkey} />
                        )}
                        <span className={styles.reactionAuthorName}>
                          {repost.authorName || `${repost.pubkey.slice(0, 8)}...`}
                        </span>
                      </div>
                      <span className={styles.reactionItemContent}>
                        <span className={styles.reactionIcon}>{repost.kind === 1 ? '💬' : '🔄'}</span>
                      </span>
                      <div className={styles.reactionRight}>
                        <div className={styles.reactionMenuWrapper}>
                          <button
                            className={styles.reactionMenuButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReactionMenuToggle(repost.id);
                            }}
                          >
                            <EllipsisVerticalIcon className={styles.reactionMenuIcon} />
                          </button>
                          <div
                            className={styles.reactionMenu}
                            style={{ display: openReactionMenuId === repost.id ? 'block' : 'none' }}
                            data-reaction-menu={repost.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button className={styles.reactionMenuItem} onClick={() => onRepostJson(repost)}>
                              View JSON
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
