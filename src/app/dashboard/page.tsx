"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { BlogPost } from '@/contexts/BlogContext';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ChartBarIcon, HeartIcon, ChatBubbleLeftIcon, BoltIcon, FireIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import styles from './page.module.css';

interface ArticleStats {
  id: string;
  title: string;
  created_at: number;
  zaps: number;
  zapAmount: number;
  reactions: number;
  comments: number;
  totalEngagement: number;
}

interface DashboardStats {
  totalArticles: number;
  totalZaps: number;
  totalZapAmount: number;
  averageZapAmount: number;
  totalReactions: number;
  totalComments: number;
  totalEngagement: number;
  averageEngagement: number;
  bestPerformingArticles: ArticleStats[];
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
            // Extract other tags
            const otherTags = tags
              .filter((tag: string[]) => !['title', 'summary', 'image', 'd', 't'].includes(tag[0]))
              .map((tag: string[]) => tag[1])
              .filter(Boolean);
            
            const article: BlogPost = {
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at!,
              content,
              title,
              summary,
              published_at: event.created_at!,
              image,
              tags: otherTags,
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
          resolve(articles);
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
          totalEngagement: 0
        });
      });

          try {
        return new Promise<Map<string, ArticleStats>>((resolve) => {
          let completedSubscriptions = 0;
          const totalSubscriptions = 4;

          const checkComplete = () => {
            completedSubscriptions++;
            if (completedSubscriptions === totalSubscriptions) {
              resolve(articleStats);
            }
          };

          // Fetch reactions (kind 7 - likes, hearts, etc.)
          const reactionsSubscription = ndk.subscribe(
            { 
              kinds: [7], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );

          reactionsSubscription.on('event', (event: NDKEvent) => {
            const articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            if (articleId && articleStats.has(articleId)) {
              const stats = articleStats.get(articleId)!;
              stats.reactions++;
              stats.totalEngagement = stats.reactions + stats.comments + stats.zaps;
            }
          });

          reactionsSubscription.on('eose', () => {
            checkComplete();
          });

          // Fetch zap requests (kind 9734 - contains amount) and receipts (kind 9735)
          const zapRequestsSubscription = ndk.subscribe(
            { 
              kinds: [9734], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );

          const zapReceiptsSubscription = ndk.subscribe(
            { 
              kinds: [9735], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );

          // Track zap amounts from requests
          const zapAmounts = new Map<string, number>();

          zapRequestsSubscription.on('event', (event: NDKEvent) => {
            const articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
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
          });

          zapReceiptsSubscription.on('event', (event: NDKEvent) => {
            const articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            if (articleId && articleStats.has(articleId)) {
              const stats = articleStats.get(articleId)!;
              stats.zaps++;
              
              // Add the accumulated zap amount for this article
              const totalZapAmount = zapAmounts.get(articleId) || 0;
              stats.zapAmount = totalZapAmount;
              
              stats.totalEngagement = stats.reactions + stats.comments + stats.zaps;
            }
          });

          zapRequestsSubscription.on('eose', () => {
            checkComplete();
          });

          zapReceiptsSubscription.on('eose', () => {
            checkComplete();
          });

          // Fetch comments (kind 1 that reference articles)
          const commentsSubscription = ndk.subscribe(
            { 
              kinds: [1], 
              '#e': articleIds,
              limit: 1000 
            },
            { closeOnEose: true }
          );

          commentsSubscription.on('event', (event: NDKEvent) => {
            const articleId = (event.tags.find((tag: string[]) => tag[0] === 'e')?.[1]) as string | undefined;
            if (articleId && articleStats.has(articleId)) {
              const stats = articleStats.get(articleId)!;
              stats.comments++;
              stats.totalEngagement = stats.reactions + stats.comments + stats.zaps;
            }
          });

          commentsSubscription.on('eose', () => {
            checkComplete();
          });
        });
    } catch (error: unknown) {
      console.error('Dashboard: Error fetching interactions:', error);
      toast.error('Failed to fetch article interactions');
      return articleStats;
    }
  }, [ndk]);

  // Calculate dashboard stats
  const calculateStats = useCallback((articleStats: Map<string, ArticleStats>): DashboardStats => {
    const statsArray = Array.from(articleStats.values());
    const totalArticles = statsArray.length;
    const totalZaps = statsArray.reduce((sum, article) => sum + article.zaps, 0);
    const totalZapAmount = statsArray.reduce((sum, article) => sum + article.zapAmount, 0);
    const averageZapAmount = totalZaps > 0 ? totalZapAmount / totalZaps : 0;
    const totalReactions = statsArray.reduce((sum, article) => sum + article.reactions, 0);
    const totalComments = statsArray.reduce((sum, article) => sum + article.comments, 0);
    const totalEngagement = statsArray.reduce((sum, article) => sum + article.totalEngagement, 0);
    const averageEngagement = totalArticles > 0 ? totalEngagement / totalArticles : 0;
    
    // Sort by total engagement to get best performing articles
    const bestPerformingArticles = statsArray
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, 5);
    
    return {
      totalArticles,
      totalZaps,
      totalZapAmount,
      averageZapAmount,
      totalReactions,
      totalComments,
      totalEngagement,
      averageEngagement,
      bestPerformingArticles
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
          const dashboardStats = calculateStats(articleStats);
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
            totalEngagement: 0,
            averageEngagement: 0,
            bestPerformingArticles: []
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

  if (!isAuthenticated) {
    return (
      <main>
        <div className={styles['welcome-section']}>
          <div className={styles['welcome-content']}>
            <h1 className={styles['welcome-title']}>Dashboard</h1>
            <p className={styles['welcome-description']}>
              Please log in to view your article statistics.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main>
        <div className={styles['dashboard-loading']}>
          <div className={styles['loading-spinner']}></div>
          <p>Loading your dashboard...</p>
        </div>
      </main>
    );
  }

  if (!stats) {
    return (
      <main>
        <div className={styles['dashboard-error']}>
          <p>Failed to load dashboard data.</p>
        </div>
      </main>
    );
  }

  return (
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
              <ChartBarIcon className={styles.icon} />
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
            </div>
          </div>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <BoltIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.averageZapAmount.toFixed(0)}</h3>
              <p className={styles['stat-label']}>Avg. Zap Amount</p>
            </div>
          </div>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <HeartIcon className={styles.icon} />
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
              <FireIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.totalEngagement}</h3>
              <p className={styles['stat-label']}>Total Engagement</p>
            </div>
          </div>
          <div className={styles['stat-card']}>
            <div className={styles['stat-icon']}>
              <ChartBarIcon className={styles.icon} />
            </div>
            <div className={styles['stat-content']}>
              <h3 className={styles['stat-number']}>{stats.averageEngagement.toFixed(1)}</h3>
              <p className={styles['stat-label']}>Avg. Engagement</p>
            </div>
          </div>
        </div>
        {/* Best Performing Articles */}
        <div className={styles['best-performing-section']}>
          <h2 className={styles['section-title']}>Best Performing Articles</h2>
          {stats.bestPerformingArticles.length > 0 ? (
            <div className={styles['articles-list']}>
              {stats.bestPerformingArticles.map((article: ArticleStats) => (
                <div key={article.id} className={styles['article-card']}>
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
                      <HeartIcon className={styles['stat-icon-small']} />
                      <span>{article.reactions}</span>
                    </div>
                    <div className={styles['stat-item']}>
                      <ChatBubbleLeftIcon className={styles['stat-icon-small']} />
                      <span>{article.comments}</span>
                    </div>
                    <div className={styles['stat-item']}>
                      <FireIcon className={styles['stat-icon-small']} />
                      <span>{article.totalEngagement}</span>
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
      </div>
    </main>
  );
};

export default DashboardPage; 