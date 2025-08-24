"use client";

import React, { useState, useEffect, useCallback } from 'react';

import { useNostr } from '@/contexts/NostrContext';
import { BlogPost } from '@/contexts/BlogContext';
import { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk';
import { ChatBubbleLeftIcon, BoltIcon, ArrowPathIcon, DocumentTextIcon, HandThumbUpIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { AuthGuard } from '@/components/AuthGuard';
import styles from './page.module.css';


interface ArticleStats {
  id: string;
  title: string;
  created_at: number;
  zaps: number;
  zapAmount: number;
  reactions: number;
  comments: number;
  reposts: number;
  totalEngagement: number;
}

interface HashtagStats {
  tag: string;
  count: number;
  fontSize: number;
}

interface DashboardStats {
  totalArticles: number;
  totalZaps: number;
  totalZapAmount: number;
  averageZapAmount: number;
  totalReactions: number;
  totalComments: number;
  totalReposts: number;
  bestPerformingArticles: ArticleStats[];
  hashtags: HashtagStats[];
}

const DashboardPage: React.FC = () => {
  const { ndk, isAuthenticated, currentUser } = useNostr();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [, setUserArticles] = useState<BlogPost[]>([]);

  // Fetch user's articles
  const fetchUserArticles = useCallback(async () => {
    if (!ndk || !currentUser) return [];

    try {
      console.log('Dashboard: Fetching user articles for:', currentUser.pubkey);
      
      return new Promise<BlogPost[]>((resolve) => {
        const articles: BlogPost[] = [];
        const seenArticleIds = new Set<string>(); // Track seen article IDs to prevent duplicates
        const deletionEventsRef: NDKEvent[] = []; // Track deletion events
        
        // Subscribe to deletion events (kind 5) first
        const deletionSubscription = ndk.subscribe(
          { 
            kinds: [5], 
            authors: [currentUser.pubkey]
          },
          { closeOnEose: true }
        );

        deletionSubscription.on('event', (event: NDKEvent) => {
          deletionEventsRef.push(event);
        });

        // Subscribe to published articles (kind 30023)
        const subscription = ndk.subscribe(
          { 
            kinds: [30023], 
            authors: [currentUser.pubkey],
            limit: 100 
          },
          { closeOnEose: true }
        );

        subscription.on('event', (event: NDKEvent) => {
          try {
            // Check if we've already seen this article
            if (seenArticleIds.has(event.id)) {
              return; // Skip duplicate
            }
            seenArticleIds.add(event.id);
            
            const content = event.content;
            const tags = event.tags;
            // Extract title from tags or content
            const titleTag = tags.find((tag: string[]) => tag[0] === 'title');
            const title = titleTag?.[1] || 'Untitled';
            // Extract summary from tags or generate from content
            const summaryTag = tags.find((tag: string[]) => tag[0] === 'summary');
            const summary = summaryTag?.[1] || content.substring(0, 150) + '...';
            // Extract image from tags
            const imageTag = tags.find((tag: string[]) => tag[0] === 'image');
            const image = imageTag?.[1];
            // Extract d-tag for versioning
            const dTag = tags.find((tag: string[]) => tag[0] === 'd')?.[1];

            // Extract hashtags from 't' tags
            const hashtags = tags
              .filter((tag: string[]) => tag[0] === 't')
              .map((tag: string[]) => tag[1])
              .filter(Boolean);
            
            // Extract other tags (excluding hashtags and metadata tags) - keeping for potential future use
            // const otherTags = tags
            //   .filter((tag: string[]) => !['title', 'summary', 'image', 'd', 't'].includes(tag[0]))
            //   .map((tag: string[]) => tag[1])
            //   .filter(Boolean);
            
            const article: BlogPost = {
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at!,
              content,
              title,
              summary,
              published_at: event.created_at!,
              image,
              tags: hashtags, // Use hashtags instead of otherTags
              dTag, // Add d-tag for versioning
              author: {
                name: currentUser.name,
                displayName: currentUser.displayName
              }
            };
            articles.push(article);
          } catch (error: unknown) {
            console.error('Dashboard: Error parsing article event:', error);
          }
        });

        subscription.on('eose', () => {
          console.log('Dashboard: Found', articles.length, 'articles');
          
          // Process deletion events to filter out deleted articles
          const deletedEventIds = new Set<string>();
          deletionEventsRef.forEach(deletionEvent => {
            deletionEvent.tags.forEach((tag: string[]) => {
              if (tag[0] === 'e') {
                deletedEventIds.add(tag[1]);
              }
            });
          });
          
          console.log(`Dashboard: Deleted event IDs processed: ${Array.from(deletedEventIds).length}`);
          
          // Filter out deleted articles
          const nonDeletedArticles = articles.filter(article => {
            const isDeleted = deletedEventIds.has(article.id);
            if (isDeleted) {
              console.log(`Dashboard: Removing deleted article: ${article.id} with title: ${article.title}`);
            }
            return !isDeleted;
          });
          
          console.log(`Dashboard: Articles after filtering deletions: ${nonDeletedArticles.length}`);
          
          // Handle versioning - keep only the latest version of each article
          const finalArticles = nonDeletedArticles.filter(article => {
            // If this article has a d-tag, check if there's a newer version
            if (article.dTag) {
              const articlesWithSameDTag = nonDeletedArticles.filter(otherArticle => 
                otherArticle.dTag === article.dTag
              );
              
              if (articlesWithSameDTag.length > 1) {
                const mostRecentArticle = articlesWithSameDTag.reduce((latest, current) => 
                  current.created_at > latest.created_at ? current : latest
                );
                
                if (mostRecentArticle.id !== article.id) {
                  console.log(`Dashboard: Removing older article ${article.id} keeping newer version ${mostRecentArticle.id} with d tag ${article.dTag}`);
                  return false;
                }
              }
            }
            
            // Check for articles with same title but different d tags (edge case handling)
            const articlesWithSameTitle = nonDeletedArticles.filter(otherArticle => 
              otherArticle.title === article.title
            );
            
            if (articlesWithSameTitle.length > 1) {
              const articlesWithDTags = articlesWithSameTitle.filter(a => a.dTag);
              const articlesWithoutDTags = articlesWithSameTitle.filter(a => !a.dTag);
              
              if (articlesWithDTags.length > 0) {
                // If some articles have d tags, prefer the most recent one with a d tag
                const mostRecentWithDTag = articlesWithDTags.reduce((latest, current) => 
                  current.created_at > latest.created_at ? current : latest
                );
                
                if (mostRecentWithDTag.id !== article.id) {
                  console.log(`Dashboard: Removing article with same title but different d tag ${article.id} keeping version with d tag ${mostRecentWithDTag.id}`);
                  return false;
                }
              } else if (articlesWithoutDTags.length > 1) {
                // If no articles have d tags, keep the most recent one
                const mostRecentArticle = articlesWithoutDTags.reduce((latest, current) => 
                  current.created_at > latest.created_at ? current : latest
                );
                
                if (mostRecentArticle.id !== article.id) {
                  console.log(`Dashboard: Removing older article with same title ${article.id} keeping newer version ${mostRecentArticle.id}`);
                  return false;
                }
              }
            }
            
            return true;
          });
          
          console.log(`Dashboard: Final articles after versioning cleanup: ${finalArticles.length}`);
          
          // Close subscriptions
          deletionSubscription.stop();
          resolve(finalArticles);
        });

        subscription.on('close', () => {
          console.log('Dashboard: Articles subscription closed');
        });

      });
    } catch (error: unknown) {
      console.error('Dashboard: Error fetching user articles:', error);
      toast.error('Failed to fetch articles');
      return [];
    }
  }, [ndk, currentUser]);

  // Fetch interactions for articles
  const fetchArticleInteractions = useCallback(async (articles: BlogPost[]): Promise<Map<string, ArticleStats>> => {
    if (!ndk || articles.length === 0) return new Map();

    const articleStats = new Map<string, ArticleStats>();
    const articleIds = articles.map(article => article.id);
    
          // Initialize stats for each article
      articles.forEach(article => {
        articleStats.set(article.id, {
          id: article.id,
          title: article.title,
          created_at: article.created_at,
          zaps: 0,
          zapAmount: 0,
          reactions: 0,
          comments: 0,
          reposts: 0,
          totalEngagement: 0
        });
      });

          try {
        return new Promise<Map<string, ArticleStats>>((resolve) => {
          // Build article coordinates for comment fetching
          const articleCoordinates = articles.map(article => {
            if (article.dTag) {
              return `30023:${article.pubkey}:${article.dTag}`;
            }
            return null;
          }).filter(Boolean) as string[];

          let completedSubscriptions = 0;
          const totalSubscriptions = articleCoordinates.length > 0 ? 15 : 10; // Extra subscriptions if we have article coordinates (reactions + comments + zaps + reposts)
          const subscriptions: NDKSubscription[] = [];

          const checkComplete = () => {
            completedSubscriptions++;
            console.log(`Dashboard: Subscription ${completedSubscriptions}/${totalSubscriptions} completed`);
            if (completedSubscriptions === totalSubscriptions) {
              console.log('Dashboard: All subscriptions completed, resolving stats');
              clearTimeout(timeout);
              // Close all subscriptions
              subscriptions.forEach(sub => sub.stop());
              resolve(articleStats);
            }
          };

          // Add timeout to prevent hanging
          const timeout = setTimeout(() => {
            console.log('Dashboard: Interaction fetch timeout, resolving with current stats');
            // Close any remaining subscriptions
            subscriptions.forEach(sub => sub.stop());
            resolve(articleStats);
          }, 30000); // 30 second timeout

          // Fetch reactions (kind 7 - likes, hearts, etc.) by event ID
          const reactionsByESubscription = ndk.subscribe(
            { 
              kinds: [7], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );
          subscriptions.push(reactionsByESubscription);

          // Fetch reactions by article coordinate (#a tags)
          const reactionsByASubscription = articleCoordinates.length > 0 ? ndk.subscribe(
            { 
              kinds: [7], 
              '#a': articleCoordinates,
              limit: 1000 
            },
            { closeOnEose: true }
          ) : null;
          
          if (reactionsByASubscription) {
            subscriptions.push(reactionsByASubscription);
          }

          // Track reaction IDs to avoid duplicates
          const reactionIds = new Set<string>();

          const processReaction = (event: NDKEvent) => {
            // Skip if we've already counted this reaction
            if (reactionIds.has(event.id)) {
              return;
            }
            reactionIds.add(event.id);
            
            // Filter out empty reactions (same as blog post page)
            if (event.content.trim() === '') {
              return;
            }
            
            // Try to find article by event ID first
            let articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            let targetArticle: BlogPost | undefined;
            
            if (articleId && articleStats.has(articleId)) {
              targetArticle = articles.find(article => article.id === articleId);
            } else {
              // Try to find article by coordinate
              const aTag = event.tags.find((tag: string[]) => tag[0] === 'a')?.[1];
              if (aTag) {
                targetArticle = articles.find(article => 
                  article.dTag && `30023:${article.pubkey}:${article.dTag}` === aTag
                );
                if (targetArticle) {
                  articleId = targetArticle.id;
                }
              }
            }
            
            if (articleId && targetArticle && articleStats.has(articleId)) {
              const stats = articleStats.get(articleId)!;
              stats.reactions++;
              stats.totalEngagement = stats.reactions + stats.comments + stats.zaps + stats.reposts;
            }
          };

          reactionsByESubscription.on('event', processReaction);
          if (reactionsByASubscription) {
            reactionsByASubscription.on('event', processReaction);
          }

          reactionsByESubscription.on('eose', () => {
            console.log('Dashboard: Reactions by E subscription EOSE');
            checkComplete();
          });

          reactionsByESubscription.on('close', () => {
            console.log('Dashboard: Reactions by E subscription closed');
          });

          if (reactionsByASubscription) {
            reactionsByASubscription.on('eose', () => {
              console.log('Dashboard: Reactions by A subscription EOSE');
              checkComplete();
            });

            reactionsByASubscription.on('close', () => {
              console.log('Dashboard: Reactions by A subscription closed');
            });
          }



          // Fetch zap requests (kind 9734 - contains amount) by event ID
          const zapRequestsByESubscription = ndk.subscribe(
            { 
              kinds: [9734], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );
          subscriptions.push(zapRequestsByESubscription);

          // Fetch zap requests by article coordinate (#a tags)
          const zapRequestsByASubscription = articleCoordinates.length > 0 ? ndk.subscribe(
            { 
              kinds: [9734], 
              '#a': articleCoordinates,
              limit: 1000 
            },
            { closeOnEose: true }
          ) : null;
          
          if (zapRequestsByASubscription) {
            subscriptions.push(zapRequestsByASubscription);
          }

          // Fetch zap receipts (kind 9735) by event ID
          const zapReceiptsByESubscription = ndk.subscribe(
            { 
              kinds: [9735], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );
          subscriptions.push(zapReceiptsByESubscription);

          // Fetch zap receipts by article coordinate (#a tags)
          const zapReceiptsByASubscription = articleCoordinates.length > 0 ? ndk.subscribe(
            { 
              kinds: [9735], 
              '#a': articleCoordinates,
              limit: 1000 
            },
            { closeOnEose: true }
          ) : null;
          
          if (zapReceiptsByASubscription) {
            subscriptions.push(zapReceiptsByASubscription);
          }

          // Track zap amounts from requests
          const zapAmounts = new Map<string, number>();
          const zapRequestIds = new Set<string>();

          const processZapRequest = (event: NDKEvent) => {
            // Skip if we've already processed this zap request
            if (zapRequestIds.has(event.id)) {
              return;
            }
            zapRequestIds.add(event.id);
            
            // Try to find article by event ID first
            let articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            let targetArticle: BlogPost | undefined;
            
            if (articleId && articleStats.has(articleId)) {
              targetArticle = articles.find(article => article.id === articleId);
            } else {
              // Try to find article by coordinate
              const aTag = event.tags.find((tag: string[]) => tag[0] === 'a')?.[1];
              if (aTag) {
                targetArticle = articles.find(article => 
                  article.dTag && `30023:${article.pubkey}:${article.dTag}` === aTag
                );
                if (targetArticle) {
                  articleId = targetArticle.id;
                }
              }
            }
            
            if (articleId) {
              // Extract zap amount from the amount tag (NIP-57)
              try {
                const amountTag = event.tags.find((tag: string[]) => tag[0] === 'amount');
                if (amountTag && amountTag[1]) {
                  // Convert from millisatoshis to satoshis
                  const zapAmount = parseInt(amountTag[1]) / 1000;
                  zapAmounts.set(articleId, (zapAmounts.get(articleId) || 0) + zapAmount);
                }
              } catch (error) {
                console.error('Error parsing zap amount:', error);
              }
            }
          };

          const zapReceiptIds = new Set<string>();

          const processZapReceipt = (event: NDKEvent) => {
            // Skip if we've already processed this zap receipt
            if (zapReceiptIds.has(event.id)) {
              return;
            }
            zapReceiptIds.add(event.id);
            
            // Try to find article by event ID first
            let articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            let targetArticle: BlogPost | undefined;
            
            if (articleId && articleStats.has(articleId)) {
              targetArticle = articles.find(article => article.id === articleId);
            } else {
              // Try to find article by coordinate
              const aTag = event.tags.find((tag: string[]) => tag[0] === 'a')?.[1];
              if (aTag) {
                targetArticle = articles.find(article => 
                  article.dTag && `30023:${article.pubkey}:${article.dTag}` === aTag
                );
                if (targetArticle) {
                  articleId = targetArticle.id;
                }
              }
            }
            
            if (articleId && targetArticle && articleStats.has(articleId)) {
              const stats = articleStats.get(articleId)!;
              stats.zaps++;
              
              // Add the accumulated zap amount for this article
              const totalZapAmount = zapAmounts.get(articleId) || 0;
              stats.zapAmount = totalZapAmount;
              
              stats.totalEngagement = stats.reactions + stats.comments + stats.zaps + stats.reposts;
            }
          };

          // Set up event handlers for zap requests
          zapRequestsByESubscription.on('event', processZapRequest);
          if (zapRequestsByASubscription) {
            zapRequestsByASubscription.on('event', processZapRequest);
          }

          zapRequestsByESubscription.on('eose', () => {
            console.log('Dashboard: Zap requests by E subscription EOSE');
            checkComplete();
          });

          zapRequestsByESubscription.on('close', () => {
            console.log('Dashboard: Zap requests by E subscription closed');
          });

          if (zapRequestsByASubscription) {
            zapRequestsByASubscription.on('eose', () => {
              console.log('Dashboard: Zap requests by A subscription EOSE');
              checkComplete();
            });

            zapRequestsByASubscription.on('close', () => {
              console.log('Dashboard: Zap requests by A subscription closed');
            });
          }

          // Set up event handlers for zap receipts
          zapReceiptsByESubscription.on('event', processZapReceipt);
          if (zapReceiptsByASubscription) {
            zapReceiptsByASubscription.on('event', processZapReceipt);
          }

          zapReceiptsByESubscription.on('eose', () => {
            console.log('Dashboard: Zap receipts by E subscription EOSE');
            checkComplete();
          });

          zapReceiptsByESubscription.on('close', () => {
            console.log('Dashboard: Zap receipts by E subscription closed');
          });

          if (zapReceiptsByASubscription) {
            zapReceiptsByASubscription.on('eose', () => {
              console.log('Dashboard: Zap receipts by A subscription EOSE');
              checkComplete();
            });

            zapReceiptsByASubscription.on('close', () => {
              console.log('Dashboard: Zap receipts by A subscription closed');
            });
          }

          // Fetch comments (kind 1 and kind 1111 that reference articles by event ID)
          const commentsByESubscription = ndk.subscribe(
            { 
              kinds: [1, 1111], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );
          subscriptions.push(commentsByESubscription);

          // Fetch comments that reference articles by coordinate (#a tags)
          const commentsByASubscription = articleCoordinates.length > 0 ? ndk.subscribe(
            { 
              kinds: [1, 1111], 
              '#a': articleCoordinates,
              limit: 1000 
            },
            { closeOnEose: true }
          ) : null;
          
          if (commentsByASubscription) {
            subscriptions.push(commentsByASubscription);
          }

          // Track comment IDs to avoid duplicates
          const commentIds = new Set<string>();

          const processComment = (event: NDKEvent) => {
            // Skip if we've already counted this comment
            if (commentIds.has(event.id)) {
              return;
            }
            commentIds.add(event.id);
            
            // Try to find article by event ID first
            let articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            let targetArticle: BlogPost | undefined;
            
            if (articleId && articleStats.has(articleId)) {
              targetArticle = articles.find(article => article.id === articleId);
            } else {
              // Try to find article by coordinate
              const aTag = event.tags.find((tag: string[]) => tag[0] === 'a')?.[1];
              if (aTag) {
                targetArticle = articles.find(article => 
                  article.dTag && `30023:${article.pubkey}:${article.dTag}` === aTag
                );
                if (targetArticle) {
                  articleId = targetArticle.id;
                }
              }
            }
            
            if (articleId && targetArticle && articleStats.has(articleId)) {
              const stats = articleStats.get(articleId)!;
              stats.comments++;
              stats.totalEngagement = stats.reactions + stats.comments + stats.zaps + stats.reposts;
            }
          };

          commentsByESubscription.on('event', processComment);
          if (commentsByASubscription) {
            commentsByASubscription.on('event', processComment);
          }

          commentsByESubscription.on('eose', () => {
            console.log('Dashboard: Comments by E subscription EOSE');
            checkComplete();
          });

          commentsByESubscription.on('close', () => {
            console.log('Dashboard: Comments by E subscription closed');
          });

          if (commentsByASubscription) {
            commentsByASubscription.on('eose', () => {
              console.log('Dashboard: Comments by A subscription EOSE');
              checkComplete();
            });

            commentsByASubscription.on('close', () => {
              console.log('Dashboard: Comments by A subscription closed');
            });
          }

          // Fetch reposts (kind 6 - standard reposts, kind 16 - generic reposts) by event ID
          const repostsByESubscription = ndk.subscribe(
            { 
              kinds: [6, 16], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );
          subscriptions.push(repostsByESubscription);

          // Fetch reposts by article coordinate (#a tags)
          const repostsByASubscription = articleCoordinates.length > 0 ? ndk.subscribe(
            { 
              kinds: [6, 16], 
              '#a': articleCoordinates,
              limit: 1000 
            },
            { closeOnEose: true }
          ) : null;
          
          if (repostsByASubscription) {
            subscriptions.push(repostsByASubscription);
          }

          // Fetch quote reposts (kind 1 with q tags) by event ID
          const quoteRepostsByESubscription = ndk.subscribe(
            { 
              kinds: [1], 
              '#q': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );
          subscriptions.push(quoteRepostsByESubscription);

          // Fetch quote reposts by article coordinate (#a tags)
          const quoteRepostsByASubscription = articleCoordinates.length > 0 ? ndk.subscribe(
            { 
              kinds: [1], 
              '#q': articleCoordinates,
              limit: 1000 
            },
            { closeOnEose: true }
          ) : null;
          
          if (quoteRepostsByASubscription) {
            subscriptions.push(quoteRepostsByASubscription);
          }

          // Track repost IDs to avoid duplicates
          const repostIds = new Set<string>();

          const processRepost = (event: NDKEvent) => {
            // Skip if we've already counted this repost
            if (repostIds.has(event.id)) {
              return;
            }
            repostIds.add(event.id);
            
            // Try to find article by event ID first (e tag for standard reposts, q tag for quote reposts)
            let articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            if (!articleId) {
              articleId = (event.tags.find((tag: string[]) => tag[0] === 'q')?.[1]) as string | undefined;
            }
            
            let targetArticle: BlogPost | undefined;
            
            if (articleId && articleStats.has(articleId)) {
              targetArticle = articles.find(article => article.id === articleId);
            } else {
              // Try to find article by coordinate
              const aTag = event.tags.find((tag: string[]) => tag[0] === 'a')?.[1];
              if (aTag) {
                targetArticle = articles.find(article => 
                  article.dTag && `30023:${article.pubkey}:${article.dTag}` === aTag
                );
                if (targetArticle) {
                  articleId = targetArticle.id;
                }
              }
            }
            
            if (articleId && targetArticle && articleStats.has(articleId)) {
              const stats = articleStats.get(articleId)!;
              stats.reposts++;
              stats.totalEngagement = stats.reactions + stats.comments + stats.zaps + stats.reposts;
            }
          };

          repostsByESubscription.on('event', processRepost);
          if (repostsByASubscription) {
            repostsByASubscription.on('event', processRepost);
          }
          quoteRepostsByESubscription.on('event', processRepost);
          if (quoteRepostsByASubscription) {
            quoteRepostsByASubscription.on('event', processRepost);
          }

          repostsByESubscription.on('eose', () => {
            console.log('Dashboard: Reposts by E subscription EOSE');
            checkComplete();
          });

          repostsByESubscription.on('close', () => {
            console.log('Dashboard: Reposts by E subscription closed');
          });

          if (repostsByASubscription) {
            repostsByASubscription.on('eose', () => {
              console.log('Dashboard: Reposts by A subscription EOSE');
              checkComplete();
            });

            repostsByASubscription.on('close', () => {
              console.log('Dashboard: Reposts by A subscription closed');
            });
          }

          quoteRepostsByESubscription.on('eose', () => {
            console.log('Dashboard: Quote reposts by E subscription EOSE');
            checkComplete();
          });

          quoteRepostsByESubscription.on('close', () => {
            console.log('Dashboard: Quote reposts by E subscription closed');
          });

          if (quoteRepostsByASubscription) {
            quoteRepostsByASubscription.on('eose', () => {
              console.log('Dashboard: Quote reposts by A subscription EOSE');
              checkComplete();
            });

            quoteRepostsByASubscription.on('close', () => {
              console.log('Dashboard: Quote reposts by A subscription closed');
            });
          }
        });
    } catch (error: unknown) {
      console.error('Dashboard: Error fetching interactions:', error);
      toast.error('Failed to fetch article interactions');
      return articleStats;
    }
  }, [ndk]);



  // Calculate dashboard stats
  const calculateStats = useCallback((articleStats: Map<string, ArticleStats>, articles: BlogPost[]): DashboardStats => {
    const statsArray = Array.from(articleStats.values());
    const totalArticles = statsArray.length;
    const totalZaps = statsArray.reduce((sum, article) => sum + article.zaps, 0);
    const totalZapAmount = statsArray.reduce((sum, article) => sum + article.zapAmount, 0);
    const averageZapAmount = totalZaps > 0 ? totalZapAmount / totalZaps : 0;
    const totalReactions = statsArray.reduce((sum, article) => sum + article.reactions, 0);
    const totalComments = statsArray.reduce((sum, article) => sum + article.comments, 0);
    const totalReposts = statsArray.reduce((sum, article) => sum + article.reposts, 0);
    
    // Sort by total engagement to get best performing articles
    // Use creation date as secondary sort criterion to break ties
    const bestPerformingArticles = statsArray
      .sort((a, b) => {
        // Primary sort: total engagement (descending)
        if (b.totalEngagement !== a.totalEngagement) {
          return b.totalEngagement - a.totalEngagement;
        }
        // Secondary sort: creation date (newer first)
        return b.created_at - a.created_at;
      })
      .slice(0, 5);
    
    // Process hashtags from all articles
    const hashtagCounts = new Map<string, number>();
    articles.forEach(article => {
      article.tags.forEach(tag => {
        if (tag && tag.trim()) {
          const normalizedTag = tag.toLowerCase().trim();
          hashtagCounts.set(normalizedTag, (hashtagCounts.get(normalizedTag) || 0) + 1);
        }
      });
    });
    
    // Convert to hashtag stats with font sizes
    const maxCount = Math.max(...hashtagCounts.values(), 1);
    const minFontSize = 12;
    const maxFontSize = 30;
    
    const hashtags: HashtagStats[] = Array.from(hashtagCounts.entries())
      .map(([tag, count]) => ({
        tag,
        count,
        fontSize: minFontSize + ((count / maxCount) * (maxFontSize - minFontSize))
      }))
      .sort((a, b) => b.count - a.count)
      //.slice(0, 30); // Limit to top 21 hashtags
    
    return {
      totalArticles,
      totalZaps,
      totalZapAmount,
      averageZapAmount,
      totalReactions,
      totalComments,
      totalReposts,
      bestPerformingArticles,
      hashtags
    };
  }, []);

  // Load dashboard data
  useEffect(() => {
    const loadDashboard = async () => {
      if (!isAuthenticated || !currentUser) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch user articles
        const articles = await fetchUserArticles();
        setUserArticles(articles);

        if (articles.length > 0) {
          // Fetch interactions for articles
          const articleStats = await fetchArticleInteractions(articles);
          // Calculate dashboard stats
          const dashboardStats = calculateStats(articleStats, articles);
          setStats(dashboardStats);
        } else {
          // No articles found, create empty stats
          setStats({
            totalArticles: 0,
            totalZaps: 0,
            totalZapAmount: 0,
            averageZapAmount: 0,
            totalReactions: 0,
            totalComments: 0,
            totalReposts: 0,
            bestPerformingArticles: [],
            hashtags: []
          });
        }
      } catch (error: unknown) {
        console.error('Dashboard: Error loading dashboard:', error);
        toast.error('Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [isAuthenticated, currentUser, fetchUserArticles, fetchArticleInteractions, calculateStats]);



  return (
    <AuthGuard>
      {isLoading ? (
        <main>
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading your dashboard...</p>
          </div>
        </main>
      ) : !stats ? (
        <main>
          <div className={styles['dashboard-error']}>
            <p>Failed to load dashboard data.</p>
          </div>
        </main>
      ) : (
      <main>
        <div className={styles.dashboard}>
        <div className={styles['dashboard-header']}>
          <h1 className={styles['dashboard-title']}>Dashboard</h1>
          <p className={styles['dashboard-subtitle']}>
            Analytics for your longform articles
          </p>
        </div>
        {/* Stats Overview */}
        <div className={styles['stats-grid']}>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <DocumentTextIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.totalArticles}</h3>
              <p className={styles['stat-label']}>Total Articles</p>
            </div>
          </div>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <BoltIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.totalZaps}</h3>
              <p className={styles['stat-label']}>Total Zaps</p>
              <p className={styles['stat-subtext']}>⚡ {stats.totalZapAmount.toLocaleString()} sats</p>
            </div>
          </div>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <HandThumbUpIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.totalReactions}</h3>
              <p className={styles['stat-label']}>Total Reactions</p>
            </div>
          </div>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <ChatBubbleLeftIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.totalComments}</h3>
              <p className={styles['stat-label']}>Total Comments</p>
            </div>
          </div>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <ArrowPathIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.totalReposts}</h3>
              <p className={styles['stat-label']}>Total Reposts</p>
            </div>
          </div>


        </div>
        {/* Best Performing Articles */}
        <div className={styles['best-performing-section']}>
          <h2 className={styles['section-title']}>Best Performing Articles</h2>
          {stats.bestPerformingArticles.length > 0 ? (
            <div className={styles['articles-list']}>
              {stats.bestPerformingArticles.map((article: ArticleStats) => (
                <div 
                  key={article.id} 
                  className={styles['article-card']}
                >
                  <div className={styles['article-header']}>
                    <h3 className={styles['article-title']}>{article.title}</h3>
                    <div className={styles['article-date']}>
                      {new Date(article.created_at * 1000).toLocaleDateString()}
                    </div>
                  </div>
                  <div className={styles['article-stats']}>
                    <div className={styles['stat-item']}>
                      <BoltIcon className={styles['stat-icon-small']} />
                      <span>{article.zaps}</span>
                    </div>
                    <div className={styles['stat-item']}>
                      <HandThumbUpIcon className={styles['stat-icon-small']} />
                      <span>{article.reactions}</span>
                    </div>
                    <div className={styles['stat-item']}>
                      <ChatBubbleLeftIcon className={styles['stat-icon-small']} />
                      <span>{article.comments}</span>
                    </div>
                    <div className={styles['stat-item']}>
                      <ArrowPathIcon className={styles['stat-icon-small']} />
                      <span>{article.reposts}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles['no-articles']}>
              <p>No articles found. Start writing to see your stats!</p>
            </div>
          )}
        </div>

        {/* Hashtags Section */}
        <div className={styles['hashtags-section']}>
          <h2 className={styles['section-title']}>Hashtags</h2>
          {stats.hashtags.length > 0 ? (
            <div className={styles['hashtags-cloud']}>
              {stats.hashtags.map((hashtag) => (
                <span
                  key={hashtag.tag}
                  className={styles['hashtag-tag']}
                  style={{
                    fontSize: `${hashtag.fontSize}px`,
                    opacity: 0.6 + (hashtag.count / Math.max(...stats.hashtags.map(h => h.count))) * 0.4
                  }}
                  title={`${hashtag.tag} (used ${hashtag.count} time${hashtag.count !== 1 ? 's' : ''})`}
                >
                  {hashtag.tag} ({hashtag.count})
                </span>
              ))}
            </div>
          ) : (
            <div className={styles['no-hashtags']}>
              <p>No hashtags found. Add hashtags to your articles to see them here!</p>
            </div>
          )}
        </div>


      </div>
    </main>
      )}
    </AuthGuard>
  );
};

export default DashboardPage; 