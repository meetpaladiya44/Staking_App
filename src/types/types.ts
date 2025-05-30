export interface Influencer {
  id: number;
  name: string;
  image: string;
  subscribers?: string[];
  // followers: number;
  // avatar: string;
  // recentWeekSignals: number;
  // recentWeekTokens: number;
  // subscriptionPrice: number;
  // specialties: string[];
}

export interface TopInfluencersResponse {
  influencers: Influencer[];
}