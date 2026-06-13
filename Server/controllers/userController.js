import * as userService from "../services/userService.js";
import { assertAdmin } from "../utils/accessControl.js";
import { auditContextFromRequest } from "../utils/auditHelper.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * GET /api/users/me — Own profile + vendor info.
 * @type {import('express').RequestHandler}
 */
export async function getMyProfile(req, res) {
  const profile = await userService.getProfile(req.user);

  return ApiResponse.success(res, { profile });
}

/**
 * PATCH /api/users/me — Update own contact info only.
 * @type {import('express').RequestHandler}
 */
export async function updateMyProfile(req, res) {
  const profile = await userService.updateMyProfile(req, req.body);

  return ApiResponse.success(res, { profile }, "Profile updated successfully");
}

/**
 * GET /api/users — Admin paginated user list.
 * @type {import('express').RequestHandler}
 */
export async function getAllUsers(req, res) {
  assertAdmin(req.user);

  const result = await userService.listUsers(req.query);

  return ApiResponse.success(res, {
    users: result.users,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * POST /api/users — Admin create vendor user.
 * @type {import('express').RequestHandler}
 */
export async function createUser(req, res) {
  assertAdmin(req.user);

  const user = await userService.createUser(req.body, {
    actorUserId: req.user.userId,
    ...auditContextFromRequest(req),
  });

  return ApiResponse.success(
    res,
    { user },
    "User created successfully. Credentials sent by email.",
    201
  );
}

/**
 * PATCH /api/users/:userId — Admin update role/status.
 * @type {import('express').RequestHandler}
 */
export async function updateUser(req, res) {
  assertAdmin(req.user);

  const targetUserId = Number(req.params.userId);

  if (targetUserId === req.user.userId && req.body.status === "inactive") {
    throw ApiError.badRequest("You cannot deactivate your own account");
  }

  const user = await userService.updateUser(targetUserId, req.body, {
    actorUserId: req.user.userId,
    ...auditContextFromRequest(req),
  });

  return ApiResponse.success(res, { user }, "User updated successfully");
}

/**
 * DELETE /api/users/:userId — Admin soft-delete (inactive).
 * @type {import('express').RequestHandler}
 */
export async function deleteUser(req, res) {
  assertAdmin(req.user);

  const targetUserId = Number(req.params.userId);

  if (targetUserId === req.user.userId) {
    throw ApiError.badRequest("You cannot delete your own account");
  }

  const user = await userService.deleteUser(targetUserId, {
    actorUserId: req.user.userId,
    ...auditContextFromRequest(req),
  });

  return ApiResponse.success(res, { user }, "User deactivated successfully");
}
