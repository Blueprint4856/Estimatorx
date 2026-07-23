import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import stripeRouter from "./stripe";
import estimatesRouter from "./estimates";
import plansRouter from "./plans";
import sharedRouter from "./shared";
const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(estimatesRouter);
router.use(plansRouter);
router.use(sharedRouter);

export default router;
