import { Router } from "express";
import * as userController from "../controllers/userController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createUserSchema,
  updateMyProfileSchema,
  updateUserSchema,
  userIdParamSchema,
  userListQuerySchema,
} from "../validators/userValidators.js";

const router = Router();

router.use(authenticate);

router.get("/me", asyncHandler(userController.getMyProfile));

router.patch(
  "/me",
  validate({ body: updateMyProfileSchema }),
  asyncHandler(userController.updateMyProfile)
);

router.get(
  "/",
  adminOnly,
  validate({ query: userListQuerySchema }),
  asyncHandler(userController.getAllUsers)
);

router.post(
  "/",
  adminOnly,
  validate({ body: createUserSchema }),
  asyncHandler(userController.createUser)
);

router.patch(
  "/:userId",
  adminOnly,
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler(userController.updateUser)
);

router.delete(
  "/:userId",
  adminOnly,
  validate({ params: userIdParamSchema }),
  asyncHandler(userController.deleteUser)
);

export default router;
