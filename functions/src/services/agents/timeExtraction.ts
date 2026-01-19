export interface TransactionTimeExtractionResponse {
  transaction_datetime: string | null;
  transaction_date: string | null;
  transaction_time: string | null;
  extraction_successful: boolean;
  notes: string | null;
}
