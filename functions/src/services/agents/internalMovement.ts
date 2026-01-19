export interface TransactionSummary {
  id: string;
  amount: number;
  type: string;
  transaction_datetime: string | null;
  emailBody: string;
}

export interface InternalMovementDetectionResponse {
  internal_movement_ids: string[];
  pairs: Array<{
    outgoing_id: string;
    incoming_id: string;
    amount: number;
    datetime: string;
    reason: string;
  }>;
  notes: string | null;
}
