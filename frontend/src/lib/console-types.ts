export interface JourneyRow {
  journey_id: string;
  user_segment?: string;
  n_touchpoints: number;
  converted: boolean;
  revenue: number;
  last_channel: string | null;
  touchpoints?: TouchpointCredit[];
}

export type AttribStatus = "pending" | "attributing" | "attributed";

export interface TouchpointCredit {
  index: number;
  channel: string;
  minutes_offset: number;
  content_hint?: string;
  credit?: number;
  confidence?: number;
  low_confidence?: boolean;
  reason?: string;
}

// Full per-journey detail assembled from journey_loaded / credit_assigned.
export interface JourneyDetail {
  journey_id: string;
  user_segment?: string;
  converted: boolean;
  revenue_if_converted?: number;
  touchpoints: TouchpointCredit[];
  top_credit_channel?: string | null;
  is_uncertain?: boolean;
  attributed: boolean;
}
