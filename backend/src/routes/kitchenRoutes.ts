import { Router } from "express";
import { verifyToken } from "../middlewares/authMiddleware";
import { authorizeRoles } from "../middlewares/roleMiddleware";
import { validate } from "../middlewares/validate";
import * as s from "../validation/schemas";
import * as k from "../controllers/kitchenController";

const r = Router();
r.use(verifyToken, authorizeRoles("donor", "admin")); // donors act as kitchen managers

r.get("/dishes", k.listDishes);
r.post("/dishes", validate(s.dishSchema), k.createDish);
r.patch("/dishes/:id", validate(s.dishUpdateSchema), k.updateDish);
r.delete("/dishes/:id", k.deleteDish);
r.post("/menu", validate(s.menuSchema), k.saveMenu);
r.post("/waste/analyze", validate(s.analyzeSchema), k.analyze);
r.post("/waste", validate(s.wasteSaveSchema), k.saveWaste);
r.get("/waste/fingerprint/:dishId", k.fingerprint);
r.get("/forecast", k.getForecast);
r.post("/forecast/decision", validate(s.decisionSchema), k.decide);
r.post("/surplus", validate(s.surplusSchema), k.createSurplus);
r.get("/impact", validate(s.impactQuery, "query"), k.impact);
r.post("/simulate", validate(s.simulateSchema), k.runSimulation);
r.post("/demo-seed", k.demoSeed);
export default r;
