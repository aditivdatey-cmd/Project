import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import analyzeRouter from "./analyze.js";
import chatRouter from "./chat.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/analyze", analyzeRouter);
router.use("/chat", chatRouter);

export default router;
