export type TransactionCategory =
  | "food_dining"
  | "transportation"
  | "housing"
  | "shopping"
  | "entertainment"
  | "health"
  | "financial"
  | "education"
  | "travel"
  | "income"
  | "other";

export type TransactionSubcategory =
  | "groceries"
  | "restaurants"
  | "delivery"
  | "coffee_bakery"
  | "bars_alcohol"
  | "fuel"
  | "public_transit"
  | "rideshare"
  | "parking_tolls"
  | "vehicle_maintenance"
  | "rent_mortgage"
  | "utilities_electric"
  | "utilities_water"
  | "utilities_gas"
  | "internet_tv"
  | "phone_plan"
  | "home_maintenance"
  | "clothing_accessories"
  | "electronics"
  | "home_furniture"
  | "personal_care"
  | "pets"
  | "gifts"
  | "streaming"
  | "gaming"
  | "movies_events"
  | "books_magazines"
  | "hobbies"
  | "medical_appointments"
  | "pharmacy_medications"
  | "gym_fitness"
  | "insurance_health"
  | "bank_fees"
  | "loan_payment"
  | "credit_card_payment"
  | "insurance_other"
  | "investments"
  | "taxes"
  | "tuition_courses"
  | "books_supplies"
  | "subscriptions_learning"
  | "flights"
  | "hotels_lodging"
  | "travel_activities"
  | "salary"
  | "freelance"
  | "reimbursement"
  | "gift_received"
  | "investment_return"
  | "uncategorized";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface TransactionCategorizationResponse {
  category: TransactionCategory;
  subcategory: TransactionSubcategory;
  confidence: ConfidenceLevel;
  notes: string | null;
}
