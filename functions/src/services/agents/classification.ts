export type TransactionType =
  | "purchase"
  | "incoming"
  | "outgoing"
  | "transfer"
  | "payment";

export type PaymentMethod = "llave" | "PSE" | "card" | "ACH" | "other";

export interface ClassifiedTransaction {
  type: TransactionType;
  amount: number;
  description: string;
  date: string;
  method: PaymentMethod;
}

export interface TransactionClassificationResponse {
  should_track: boolean;
  transaction: ClassifiedTransaction | null;
  exclusion_reason: string | null;
}
