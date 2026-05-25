import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import stripeRouter from "./stripe";
import estimatesRouter from "./estimates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(estimatesRouter);

export default router;
