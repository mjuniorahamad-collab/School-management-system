import { Router } from "express"
import { authRouter } from "./auth.route.js"
import { healthRouter } from "./health.route.js"
import { studentsRouter } from "../modules/students/student.route.js"

// Feature modules register their routers here (e.g. apiRouter.use(studentsRouter)).
export const apiRouter: Router = Router()

apiRouter.use(healthRouter)
apiRouter.use("/auth", authRouter)
apiRouter.use("/students", studentsRouter)