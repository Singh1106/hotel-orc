import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import path from "path";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || "localhost:7233";
const TASK_QUEUE = "hotel-offers";

export async function startWorker(): Promise<Worker> {
  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: path.resolve(__dirname, "./workflows"),
    activities,
  });

  console.log(`Temporal worker started on task queue: ${TASK_QUEUE}`);
  return worker;
}

export { TASK_QUEUE };
