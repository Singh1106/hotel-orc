import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { logger } from "../logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPORAL_ADDRESS = process.env.TEMPORAL_URL || "localhost:7233";
const TASK_QUEUE = "hotel-offers";

export async function startWorker(): Promise<Worker> {
  logger.info("Starting Temporal worker", { address: TEMPORAL_ADDRESS, taskQueue: TASK_QUEUE });
  
  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

  logger.debug("Connected to Temporal server");

  const worker = await Worker.create({
    connection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: resolve(__dirname, "./workflows.ts"),
    activities,
  });

  logger.info("Temporal worker created successfully", { taskQueue: TASK_QUEUE });
  return worker;
}

export { TASK_QUEUE };
