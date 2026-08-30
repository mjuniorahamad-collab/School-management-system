import { Router } from "express"
import { authRouter } from "./auth.route.js"
import { healthRouter } from "./health.route.js"

// Future feature modules register their routers here (e.g. apiRouter.use(studentsRouter)).
export const apiRouter: Router = Router()

apiRouter.use(healthRouter)
apiRouter.use("/auth", authRouter)