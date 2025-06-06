export interface Influencer {
  id: number;
  name: string;
  image: string;
  subscribers?: Subscriber[];
  // followers: number;
  // avatar: string;
  // recentWeekSignals: number;
  // recentWeekTokens: number;
  // subscriptionPrice: number;
  // specialties: string[];
}

export interface Subscriber {
  username: string
  address: string
  subscribedAt: Date
}

export interface InfluencerWithSubscription extends Influencer {
  isSubscribed?: boolean
  subscribers?: Subscriber[]
}

export interface TopInfluencersResponse {
  influencers: Influencer[];
}