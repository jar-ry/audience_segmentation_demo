export interface Filters {
  retailer: string;
  ageRange: [number, number];
  states: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  minSpend: number;
  recencyDays: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'Active' | 'Paused' | 'Completed' | 'Draft' | 'Activated' | 'Cancelled';
  channel: string;
  audience: string;
  audienceSize: number;
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  destination?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  data?: Record<string, unknown>[];
  suggested?: string[];
}

export interface BreakdownRow {
  label: string;
  count: number;
}

export interface Offer {
  id: string;
  name: string;
  type: 'Points Multiplier' | 'Discount' | 'Cashback' | 'Partner' | 'Reward';
  description: string;
  costPerRedemption: number;
  avgRedemptionRate: number;
  partner?: string;
  active: boolean;
}
