import OpenAI from "openai";

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

export interface TransactionTimeExtractionResponse {
  transaction_datetime: string | null;
  transaction_date: string | null;
  transaction_time: string | null;
  extraction_successful: boolean;
  notes: string | null;
}

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

export interface TransactionProcessingResult {
  classification: TransactionClassificationResponse;
  categorization: TransactionCategorizationResponse;
  timeExtraction: TransactionTimeExtractionResponse;
}

const CLASSIFICATION_SYSTEM_PROMPT = `Transaction Classification Agent
You are a transaction classifier for a Colombian bank (Davivienda). Your task is to analyze transaction notifications and determine if they should be tracked.

TERMINOLOGY:
- "Abono" = money entered/credited to the account
- "Descuento" = money exited/debited from the account

INCLUDE these transaction types:
- Purchases at merchants (successful only)
- Incoming money via "llave"
- Outgoing money via "llave"
- Incoming money via other banks
- Transfers to other banks (PSE, ACH, etc.)
- Bill payments

EXCLUDE these transaction types:
- Failed or declined transactions
- Internal account movements containing "Bolsillo" ("Descuento Transferencia Bolsillo a Cuenta")

Input: Raw transaction notification text`;

const CLASSIFICATION_SCHEMA = {
  name: "transaction_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["should_track", "transaction", "exclusion_reason"],
    properties: {
      should_track: {
        type: "boolean",
      },
      transaction: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "amount", "description", "date", "method"],
            properties: {
              type: {
                type: "string",
                enum: [
                  "purchase",
                  "incoming",
                  "outgoing",
                  "transfer",
                  "payment",
                ],
              },
              amount: {
                type: "number",
              },
              description: {
                type: "string",
              },
              date: {
                type: "string",
              },
              method: {
                type: "string",
                enum: ["llave", "PSE", "card", "ACH", "other"],
              },
            },
          },
          {
            type: "null",
          },
        ],
      },
      exclusion_reason: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  },
};

const CATEGORIZATION_SYSTEM_PROMPT = `You are a transaction categorizer. Given a transaction description, classify it into the appropriate category and subcategory.

**Categories and Subcategories:**

- **food_dining**
  - groceries (supermarkets, markets)
  - restaurants (dine-in, fast food)
  - delivery (Rappi, iFood, UberEats)
  - coffee_bakery (cafes, bakeries)
  - bars_alcohol

- **transportation**
  - fuel (gas stations)
  - public_transit (metro, bus)
  - rideshare (Uber, Didi, taxi)
  - parking_tolls
  - vehicle_maintenance (repairs, car wash)

- **housing**
  - rent_mortgage
  - utilities_electric
  - utilities_water
  - utilities_gas
  - internet_tv
  - phone_plan
  - home_maintenance

- **shopping**
  - clothing_accessories
  - electronics
  - home_furniture
  - personal_care (pharmacy, cosmetics)
  - pets
  - gifts

- **entertainment**
  - streaming (Netflix, Spotify, YouTube)
  - gaming
  - movies_events
  - books_magazines
  - hobbies

- **health**
  - medical_appointments
  - pharmacy_medications
  - gym_fitness
  - insurance_health

- **financial**
  - bank_fees
  - loan_payment
  - credit_card_payment
  - insurance_other
  - investments
  - taxes

- **education**
  - tuition_courses
  - books_supplies
  - subscriptions_learning (Coursera, Udemy)

- **travel**
  - flights
  - hotels_lodging
  - travel_activities

- **income**
  - salary
  - freelance
  - reimbursement
  - gift_received
  - investment_return

- **other**
  - uncategorized

Analyze the transaction and assign the most appropriate category and subcategory.`;

const CATEGORIZATION_SCHEMA = {
  name: "transaction_categorization",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["category", "subcategory", "confidence", "notes"],
    properties: {
      category: {
        type: "string",
        enum: [
          "food_dining",
          "transportation",
          "housing",
          "shopping",
          "entertainment",
          "health",
          "financial",
          "education",
          "travel",
          "income",
          "other",
        ],
      },
      subcategory: {
        type: "string",
        enum: [
          "groceries",
          "restaurants",
          "delivery",
          "coffee_bakery",
          "bars_alcohol",
          "fuel",
          "public_transit",
          "rideshare",
          "parking_tolls",
          "vehicle_maintenance",
          "rent_mortgage",
          "utilities_electric",
          "utilities_water",
          "utilities_gas",
          "internet_tv",
          "phone_plan",
          "home_maintenance",
          "clothing_accessories",
          "electronics",
          "home_furniture",
          "personal_care",
          "pets",
          "gifts",
          "streaming",
          "gaming",
          "movies_events",
          "books_magazines",
          "hobbies",
          "medical_appointments",
          "pharmacy_medications",
          "gym_fitness",
          "insurance_health",
          "bank_fees",
          "loan_payment",
          "credit_card_payment",
          "insurance_other",
          "investments",
          "taxes",
          "tuition_courses",
          "books_supplies",
          "subscriptions_learning",
          "flights",
          "hotels_lodging",
          "travel_activities",
          "salary",
          "freelance",
          "reimbursement",
          "gift_received",
          "investment_return",
          "uncategorized",
        ],
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
      notes: {
        type: ["string", "null"],
      },
    },
  },
};

const TIME_EXTRACTION_SYSTEM_PROMPT = `Transaction Time Extraction Agent
You are a time extraction agent for Colombian bank transaction notifications. Your task is to extract the exact date and time when the transaction occurred according to the bank notification.

IMPORTANT: Extract the transaction time from the EMAIL BODY, NOT the email arrival time.
All times in these notifications are in Colombia timezone (UTC-5).

Common patterns in Davivienda notifications:
- "Fecha: 2026/01/03 Hora: 18:26:40" -> date: 2026-01-03, time: 18:26:40
- "Fecha: 03/01/2026 Hora: 6:30:00 PM" -> date: 2026-01-03, time: 18:30:00

OUTPUT FORMAT:
- transaction_datetime: Combined ISO 8601 format WITH Colombia timezone offset (e.g., "2026-01-03T18:26:40-05:00")
- transaction_date: Date in YYYY-MM-DD format (e.g., "2026-01-03")
- transaction_time: Time in HH:MM:SS 24-hour format (e.g., "18:26:40")
- extraction_successful: true if you found a valid date/time, false otherwise
- notes: Any relevant notes about the extraction (e.g., "Time was in 12-hour format, converted to 24-hour")

IMPORTANT: Always include the Colombia timezone offset (-05:00) in transaction_datetime.

If no transaction time is found, set all date/time fields to null and extraction_successful to false.

Input: Raw transaction notification text`;

const TIME_EXTRACTION_SCHEMA = {
  name: "transaction_time_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "transaction_datetime",
      "transaction_date",
      "transaction_time",
      "extraction_successful",
      "notes",
    ],
    properties: {
      transaction_datetime: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      transaction_date: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      transaction_time: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      extraction_successful: {
        type: "boolean",
      },
      notes: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  },
};

let openaiClient: OpenAI | null = null;
const OPENAI_REQUEST_TIMEOUT_MS = 30000;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

async function createChatCompletionWithTimeout(
  client: OpenAI,
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.ChatCompletion> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OPENAI_REQUEST_TIMEOUT_MS
  );
  try {
    return await client.chat.completions.create(params, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyTransaction(
  subject: string,
  body: string
): Promise<TransactionClassificationResponse> {
  const client = getOpenAIClient();
  const userMessage = JSON.stringify({ subject, body });

  const response = await createChatCompletionWithTimeout(client, {
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: CLASSIFICATION_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response content from OpenAI (classification)");
  }

  return JSON.parse(content) as TransactionClassificationResponse;
}

export async function categorizeTransaction(
  subject: string,
  body: string
): Promise<TransactionCategorizationResponse> {
  const client = getOpenAIClient();
  const userMessage = JSON.stringify({ subject, body });

  const response = await createChatCompletionWithTimeout(client, {
    model: "gpt-5.2",
    messages: [
      { role: "system", content: CATEGORIZATION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: CATEGORIZATION_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response content from OpenAI (categorization)");
  }

  return JSON.parse(content) as TransactionCategorizationResponse;
}

export async function extractTransactionTime(
  subject: string,
  body: string
): Promise<TransactionTimeExtractionResponse> {
  const client = getOpenAIClient();
  const userMessage = JSON.stringify({ subject, body });

  const response = await createChatCompletionWithTimeout(client, {
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: TIME_EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: TIME_EXTRACTION_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response content from OpenAI (time extraction)");
  }

  return JSON.parse(content) as TransactionTimeExtractionResponse;
}

const INTERNAL_MOVEMENT_SYSTEM_PROMPT = `Internal Movement Detection Agent
You are an agent that detects internal transfers between a user's own bank accounts.

You will receive an array of transactions, each with:
- id: unique transaction identifier
- amount: transaction amount
- type: "incoming" or "outgoing"
- transaction_datetime: when the transaction occurred
- emailBody: the original bank notification content

Your task is to identify pairs of transactions that represent money moving between the user's OWN accounts (internal movements).

CRITERIA FOR INTERNAL MOVEMENTS:
1. Same amount (exactly)
2. Same date and time (or within a few seconds/minutes)
3. One must be "outgoing" (Descuento) and one must be "incoming" (Abono)
4. Both should be transfers (look for "Transferencia" in the email body)
5. Both should be from the same bank's app (e.g., "App Davivienda")

IMPORTANT:
- Only flag transactions that are clearly internal movements between the user's own accounts
- If in doubt, DO NOT flag the transaction
- Return the IDs of ALL transactions that are part of internal movements (both the outgoing and incoming)

Output the IDs of transactions that are internal movements, along with the pairs you identified.`;

const INTERNAL_MOVEMENT_SCHEMA = {
  name: "internal_movement_detection",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["internal_movement_ids", "pairs", "notes"],
    properties: {
      internal_movement_ids: {
        type: "array",
        items: { type: "string" },
      },
      pairs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "outgoing_id",
            "incoming_id",
            "amount",
            "datetime",
            "reason",
          ],
          properties: {
            outgoing_id: { type: "string" },
            incoming_id: { type: "string" },
            amount: { type: "number" },
            datetime: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      notes: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  },
};

export async function detectInternalMovements(
  transactions: TransactionSummary[]
): Promise<InternalMovementDetectionResponse> {
  if (transactions.length === 0) {
    return {
      internal_movement_ids: [],
      pairs: [],
      notes: "No transactions to analyze",
    };
  }

  const client = getOpenAIClient();
  const userMessage = JSON.stringify(transactions);

  const response = await createChatCompletionWithTimeout(client, {
    model: "gpt-5.2",
    messages: [
      { role: "system", content: INTERNAL_MOVEMENT_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: INTERNAL_MOVEMENT_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(
      "No response content from OpenAI (internal movement detection)"
    );
  }

  return JSON.parse(content) as InternalMovementDetectionResponse;
}

export async function processTransactionWithAgents(
  subject: string,
  body: string
): Promise<TransactionProcessingResult> {
  const [classification, categorization, timeExtraction] = await Promise.all([
    classifyTransaction(subject, body),
    categorizeTransaction(subject, body),
    extractTransactionTime(subject, body),
  ]);

  return {
    classification,
    categorization,
    timeExtraction,
  };
}
