import OpenAI from "openai";
import { ASSISTANT_IDS } from "../config/constants";
import { TransactionClassificationResponse } from "./agents/classification";
import { TransactionCategorizationResponse } from "./agents/categorization";
import { TransactionTimeExtractionResponse } from "./agents/timeExtraction";
import {
  InternalMovementDetectionResponse,
  TransactionSummary,
} from "./agents/internalMovement";

// Re-export types for consumers
export * from "./agents/classification";
export * from "./agents/categorization";
export * from "./agents/timeExtraction";
export * from "./agents/internalMovement";

export interface TransactionProcessingResult {
  classification: TransactionClassificationResponse;
  categorization: TransactionCategorizationResponse;
  timeExtraction: TransactionTimeExtractionResponse;
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const POLLING_INTERVAL_MS = 500; // Reduced from 1000ms for faster response

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey,
      timeout: 30000, // 30 second timeout for individual API calls
      maxRetries: 2, // Built-in retries for connection issues
    });
  }
  return openaiClient;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("connection") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("enotfound") ||
      message.includes("socket") ||
      message.includes("network") ||
      message.includes("rate limit") ||
      message.includes("429") ||
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    );
  }
  return false;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(
          `[OpenAI] ${operationName} - Retry attempt ${attempt}/${MAX_RETRIES}`
        );
      }
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRetryable = isRetryableError(error);

      console.error(
        `[OpenAI] ${operationName} - Error on attempt ${attempt}/${MAX_RETRIES}:`,
        {
          message: lastError.message,
          isRetryable,
          willRetry: isRetryable && attempt < MAX_RETRIES,
        }
      );

      if (!isRetryable || attempt === MAX_RETRIES) {
        console.error(
          `[OpenAI] ${operationName} - Giving up after ${attempt} attempts`
        );
        throw lastError;
      }

      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[OpenAI] ${operationName} - Retrying in ${delayMs}ms...`);
      await delay(delayMs);
    }
  }

  throw lastError;
}

async function runAssistant(
  assistantId: string,
  userMessage: string
): Promise<string> {
  const assistantShortId = assistantId.slice(-6);
  const msgPreview =
    userMessage.length > 100 ? userMessage.slice(0, 100) + "..." : userMessage;

  console.log(`[OpenAI] Starting assistant ${assistantShortId}`, {
    messageLength: userMessage.length,
    preview: msgPreview,
  });

  const overallStartTime = Date.now();

  return withRetry(async () => {
    const client = getOpenAIClient();

    // Create thread and run without polling initially
    console.log(`[OpenAI] ${assistantShortId} - Creating thread and run...`);
    const createStartTime = Date.now();

    const run = await client.beta.threads.createAndRun({
      assistant_id: assistantId,
      thread: {
        messages: [{ role: "user", content: userMessage }],
      },
    });

    console.log(
      `[OpenAI] ${assistantShortId} - Thread created in ${
        Date.now() - createStartTime
      }ms`,
      {
        runId: run.id,
        threadId: run.thread_id,
        initialStatus: run.status,
      }
    );

    // Manual polling with timeout safety
    const startTime = Date.now();
    const TIMEOUT_MS = 45000; // Reduced to 45 seconds for faster failure detection
    let pollCount = 0;

    let runStatus = await client.beta.threads.runs.retrieve(run.id, {
      thread_id: run.thread_id,
    });

    while (runStatus.status !== "completed") {
      pollCount++;
      const elapsedMs = Date.now() - startTime;

      if (elapsedMs > TIMEOUT_MS) {
        console.error(
          `[OpenAI] ${assistantShortId} - TIMEOUT after ${elapsedMs}ms (${pollCount} polls)`,
          {
            lastStatus: runStatus.status,
            runId: run.id,
          }
        );
        // Try to cancel the run if possible so it doesn't continue consuming resources
        try {
          await client.beta.threads.runs.cancel(run.id, {
            thread_id: run.thread_id,
          });
        } catch {
          // Ignore cancel errors
        }
        throw new Error(`Assistant run timed out after ${TIMEOUT_MS}ms`);
      }

      if (runStatus.status === "failed") {
        console.error(`[OpenAI] ${assistantShortId} - Run FAILED`, {
          error: runStatus.last_error,
          elapsedMs,
          pollCount,
        });
        throw new Error(
          `Assistant run failed: ${
            runStatus.last_error?.message || "Unknown error"
          }`
        );
      }
      if (
        runStatus.status === "cancelled" ||
        runStatus.status === "expired" ||
        runStatus.status === "incomplete"
      ) {
        console.error(`[OpenAI] ${assistantShortId} - Run ended unexpectedly`, {
          status: runStatus.status,
          elapsedMs,
          pollCount,
        });
        throw new Error(`Assistant run ended with status: ${runStatus.status}`);
      }
      if (runStatus.status === "requires_action") {
        console.error(
          `[OpenAI] ${assistantShortId} - Unexpected requires_action state`
        );
        // In case the assistant is trying to call a tool, we fail fast
        try {
          await client.beta.threads.runs.cancel(run.id, {
            thread_id: run.thread_id,
          });
        } catch {
          // Ignore cancel errors
        }
        throw new Error(
          "Assistant entered 'requires_action' state (tool calls not supported in this implementation)"
        );
      }

      // Log status every 5 polls (2.5 seconds) to avoid log spam
      if (pollCount % 5 === 0) {
        console.log(
          `[OpenAI] ${assistantShortId} - Polling... status=${runStatus.status}, elapsed=${elapsedMs}ms, polls=${pollCount}`
        );
      }

      // Wait before polling again (reduced interval for faster response)
      await delay(POLLING_INTERVAL_MS);

      try {
        runStatus = await client.beta.threads.runs.retrieve(run.id, {
          thread_id: run.thread_id,
        });
      } catch (pollError) {
        // Log polling errors but continue - transient network issues shouldn't fail the whole run
        console.warn(
          `[OpenAI] ${assistantShortId} - Polling error (will retry):`,
          pollError instanceof Error ? pollError.message : "Unknown"
        );
        await delay(POLLING_INTERVAL_MS * 2);
        runStatus = await client.beta.threads.runs.retrieve(run.id, {
          thread_id: run.thread_id,
        });
      }
    }

    const pollingDuration = Date.now() - startTime;
    console.log(
      `[OpenAI] ${assistantShortId} - Run completed in ${pollingDuration}ms (${pollCount} polls)`
    );

    // Retrieve messages
    const messages = await client.beta.threads.messages.list(run.thread_id);

    // Get the last message from the assistant
    const lastMessage = messages.data
      .filter((message) => message.role === "assistant")
      .shift();

    if (
      !lastMessage ||
      !lastMessage.content ||
      lastMessage.content.length === 0
    ) {
      console.error(
        `[OpenAI] ${assistantShortId} - No response content from assistant`
      );
      throw new Error("No response from assistant");
    }

    const textContent = lastMessage.content[0];
    if (textContent.type !== "text") {
      console.error(
        `[OpenAI] ${assistantShortId} - Response is not text, type: ${textContent.type}`
      );
      throw new Error("Assistant response is not text");
    }

    const totalDuration = Date.now() - overallStartTime;
    const responsePreview =
      textContent.text.value.length > 200
        ? textContent.text.value.slice(0, 200) + "..."
        : textContent.text.value;

    console.log(
      `[OpenAI] ${assistantShortId} - SUCCESS in ${totalDuration}ms`,
      {
        responseLength: textContent.text.value.length,
        preview: responsePreview,
      }
    );

    return textContent.text.value;
  }, `runAssistant(${assistantShortId})`);
}

function parseJSONResponse<T>(responseText: string): T {
  // Remove markdown code blocks if present
  const cleanText = responseText.replace(/```json\n?|\n?```/g, "").trim();
  try {
    return JSON.parse(cleanText) as T;
  } catch (e: any) {
    throw new Error(
      `Failed to parse JSON response from assistant: ${e.message}. Response: ${responseText}`
    );
  }
}

export async function classifyTransaction(
  subject: string,
  body: string
): Promise<TransactionClassificationResponse> {
  const userMessage = JSON.stringify({ subject, body });
  const responseText = await runAssistant(
    ASSISTANT_IDS.classification,
    userMessage
  );
  return parseJSONResponse<TransactionClassificationResponse>(responseText);
}

export async function categorizeTransaction(
  subject: string,
  body: string
): Promise<TransactionCategorizationResponse> {
  const userMessage = JSON.stringify({ subject, body });
  const responseText = await runAssistant(
    ASSISTANT_IDS.categorization,
    userMessage
  );
  return parseJSONResponse<TransactionCategorizationResponse>(responseText);
}

export async function extractTransactionTime(
  subject: string,
  body: string
): Promise<TransactionTimeExtractionResponse> {
  const userMessage = JSON.stringify({ subject, body });
  const responseText = await runAssistant(
    ASSISTANT_IDS.timeExtraction,
    userMessage
  );
  return parseJSONResponse<TransactionTimeExtractionResponse>(responseText);
}

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

  const userMessage = JSON.stringify(transactions);
  const responseText = await runAssistant(
    ASSISTANT_IDS.internalMovement,
    userMessage
  );
  return parseJSONResponse<InternalMovementDetectionResponse>(responseText);
}

export async function processTransactionWithAgents(
  subject: string,
  body: string
): Promise<TransactionProcessingResult> {
  const startTime = Date.now();
  const subjectPreview =
    subject.length > 50 ? subject.slice(0, 50) + "..." : subject;

  console.log(
    `[OpenAI] processTransactionWithAgents - Starting parallel agent calls`,
    {
      subject: subjectPreview,
      bodyLength: body.length,
    }
  );

  try {
    const [classification, categorization, timeExtraction] = await Promise.all([
      classifyTransaction(subject, body),
      categorizeTransaction(subject, body),
      extractTransactionTime(subject, body),
    ]);

    const duration = Date.now() - startTime;
    console.log(
      `[OpenAI] processTransactionWithAgents - All agents completed in ${duration}ms`,
      {
        shouldTrack: classification.should_track,
        category: categorization.category,
        transactionDatetime: timeExtraction.transaction_datetime,
      }
    );

    return {
      classification,
      categorization,
      timeExtraction,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[OpenAI] processTransactionWithAgents - FAILED after ${duration}ms`,
      {
        error: error instanceof Error ? error.message : String(error),
        subject: subjectPreview,
      }
    );
    throw error;
  }
}
