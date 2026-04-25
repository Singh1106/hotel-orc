import express from 'express'
import type { Request, Response } from 'express'
import supplierARouter from "./suppliers/supplierA";
import supplierBRouter from "./suppliers/supplierB";

const app = express()
app.use(express.json())

app.use("/supplierA", supplierARouter);
app.use("/supplierB", supplierBRouter);

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'hello' })
})

app.listen(3000, () => console.log('http://localhost:3000'))